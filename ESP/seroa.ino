#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ========== NUEVAS LIBRERIAS PARA RAILWAY ==========
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ========== FIREBASE ==========
#define API_KEY "AIzaSyD8GcNRjouSlrlNSKXcNrjl0gjAYuXvTMQ"
#define DATABASE_URL "https://seroa-e8606-default-rtdb.firebaseio.com"

// ========== PINES ==========
#define SDA_PIN 21
#define SCL_PIN 22

#define PIN_RELAY 26
#define PIN_PRESION 34

#define RELAY_ACTIVE_LOW true

// ========== OLED ==========
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDR 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ========== OBJETOS ==========
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
MAX30105 particleSensor;
Preferences preferencias;

// ========== VARIABLES WIFI / BLE ==========
String wifi_ssid = "";
String wifi_pass = "";
String id_paciente = "";

bool bleConectado = false;
bool sensorConectado = false;
bool oledConectada = false;

// ========== BLUETOOTH ==========
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ========== MAX30102 ==========
uint32_t irBuffer[100];
uint32_t redBuffer[100];
int32_t bufferLength = 100;

int32_t spo2;
int8_t validSPO2;
int32_t heartRate;
int8_t validHeartRate;

bool bufferLleno = false;

const int numLecturas = 5;
int lecturasSpO2[numLecturas];
int lecturasBPM[numLecturas];
int indiceFiltro = 0;
bool bufferFiltroLleno = false;

// ========== TIEMPOS ==========
unsigned long tiempoAnterior = 0;
unsigned long tiempoFirebase = 0;
unsigned long intervaloFirebase = 1000;

// ========== CONTROL ==========
int LIMITE_SPO2_BAJO = 88;
bool valvulaActiva = false;
bool onDisconnectConfigurado = false;

int spo2Actual = 0;
int bpmActual = 0;
float presionActual = 0;
String estadoActual = "ACTIVO";

// ========== CALIBRACIÓN DE TANQUE ==========
float maxPsiBaseline = 0.0;   // 0 = sin calibrar (usa MAX_BAR_DEFAULT)
bool  calibracionActiva = false;
bool  autoCalibPendiente = false;  // true cuando arranca sin baseline guardado
unsigned long tiempoCalibCheck = 0;
const unsigned long INTERVALO_CALIB_CHECK = 4000; // ms entre chequeos del flag

// ========== PERSISTENCIA DE TANQUE EN BD ==========
unsigned long tiempoUltimoTanqueDB = 0;
const unsigned long INTERVALO_TANQUE_DB = 30000; // escribe en tanques cada 30 s

// ========== FUNCIONES OLED ==========
void mostrarOLED(String estado, int spo2Val, int bpmVal, float presionBar, bool valvula) {
  if (!oledConectada) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("SEROA");

  display.setCursor(70, 0);
  display.println(estado);

  display.drawLine(0, 12, 128, 12, SSD1306_WHITE);

  display.setCursor(0, 18);
  display.print("SpO2: ");
  if (spo2Val > 0) {
    display.print(spo2Val);
    display.println("%");
  } else {
    display.println("--");
  }

  display.setCursor(0, 30);
  display.print("BPM : ");
  if (bpmVal > 0) {
    display.println(bpmVal);
  } else {
    display.println("--");
  }

  display.setCursor(0, 42);
  display.print("Pres: ");
  display.print(presionBar, 1);
  display.println(" bar");

  display.setCursor(0, 54);
  display.print("Valv: ");
  display.println(valvula ? "ON" : "OFF");

  display.display();
}

void mostrarMensajeOLED(String linea1, String linea2, String linea3) {
  if (!oledConectada) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("SEROA");
  display.drawLine(0, 12, 128, 12, SSD1306_WHITE);

  display.setCursor(0, 22);
  display.println(linea1);

  display.setCursor(0, 34);
  display.println(linea2);

  display.setCursor(0, 46);
  display.println(linea3);

  display.display();
}

// ========== RELAY / VALVULA ==========
void activarValvula() {
  if (RELAY_ACTIVE_LOW) digitalWrite(PIN_RELAY, LOW);
  else digitalWrite(PIN_RELAY, HIGH);

  valvulaActiva = true;
}

void desactivarValvula() {
  if (RELAY_ACTIVE_LOW) digitalWrite(PIN_RELAY, HIGH);
  else digitalWrite(PIN_RELAY, LOW);

  valvulaActiva = false;
}

// ========== SENSOR DE PRESION ==========
float leerPresionBar() {
  int lecturaADC = analogRead(PIN_PRESION);

  float voltajeADC = (lecturaADC / 4095.0) * 3.3;
  float voltajeSensor = voltajeADC * 1.5;

  float presion = ((voltajeSensor - 0.5) * 12.0) / 4.0;

  if (presion < 0) presion = 0;
  if (presion > 12) presion = 12;

  return presion;
}

String estadoTanque(float presionBar) {
  if (presionBar <= 0.3) return "SIN_PRESION";
  if (presionBar < 2.0) return "TANQUE_BAJO";
  return "TANQUE_OK";
}

// Toma 50 muestras en 5 s, promedia y guarda como baseline del 100%
void realizarCalibracion() {
  if (calibracionActiva) return;
  calibracionActiva = true;

  Serial.println("=== CALIBRACIÓN DE TANQUE INICIADA ===");
  mostrarMensajeOLED("Calibrando", "tanque O2...", "Espere 5s");

  float suma  = 0.0f;
  int conteo  = 0;
  unsigned long inicio = millis();

  while (millis() - inicio < 5000) {
    float p = leerPresionBar();
    if (p > 0.1f) { suma += p; conteo++; }
    delay(100);
  }

  calibracionActiva = false;

  if (conteo < 5 || (suma / conteo) < 0.5f) {
    Serial.println("[CALIB] ERROR: Sin presion suficiente durante la calibracion.");
    mostrarMensajeOLED("Calib ERROR", "Sin presion", "Revisa tanque");
    if (Firebase.ready() && id_paciente != "") {
      String ruta = "Seroa/Pacientes/" + id_paciente + "/Actual";
      Firebase.RTDB.setBool(&fbdo, (ruta + "/calibracion_pendiente").c_str(), false);
      Firebase.RTDB.setBool(&fbdo, (ruta + "/calibracion_error").c_str(), true);
    }
    return;
  }

  maxPsiBaseline = suma / conteo;

  preferencias.begin("seroa-cred", false);
  preferencias.putFloat("psiBaseline", maxPsiBaseline);
  preferencias.end();

  Serial.print("[CALIB] Baseline guardado: ");
  Serial.print(maxPsiBaseline, 3);
  Serial.println(" bar = 100%");
  mostrarMensajeOLED("Calibrado OK", String(maxPsiBaseline, 1) + " bar", "= 100%");

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure *client = new WiFiClientSecure;
    client->setInsecure();
    HTTPClient https;
    https.begin(*client, "https://seroa-web-production.up.railway.app/api/tanques/calibrar");
    https.addHeader("Content-Type", "application/json");
    String payload = "{\"id_paciente\": " + id_paciente +
                     ", \"max_psi_baseline\": " + String(maxPsiBaseline, 4) + "}";
    int code = https.POST(payload);
    if (code > 0) {
      Serial.print("[CALIB] Baseline enviado al servidor: "); Serial.println(maxPsiBaseline, 3);
    } else {
      Serial.print("[CALIB] Error enviando baseline: "); Serial.println(https.errorToString(code).c_str());
    }
    https.end();
    delete client;
  }

  if (Firebase.ready() && id_paciente != "") {
    String ruta = "Seroa/Pacientes/" + id_paciente + "/Actual";
    Firebase.RTDB.setBool(&fbdo, (ruta + "/calibracion_pendiente").c_str(), false);
    Firebase.RTDB.setBool(&fbdo, (ruta + "/calibracion_error").c_str(), false);
  }
}

// ========== CALCULO DE TANQUE ==========
float calcularPorcentajeTanque(float presionBar) {
  float ref = (maxPsiBaseline > 0.1f) ? maxPsiBaseline : 12.0f;
  float pct = (presionBar / ref) * 100.0f;
  if (pct < 0.0f)   pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;
  return pct;
}

// ========== SINCRONIZAR LIMITE SPO2 DESDE LA BD ==========
void sincronizarLimiteSpo2() {
  if (id_paciente == "" || WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure *client = new WiFiClientSecure;
  client->setInsecure();
  HTTPClient https;
  String url = "https://seroa-web-production.up.railway.app/api/pacientes/" + id_paciente + "/config";
  https.begin(*client, url);
  int code = https.GET();
  if (code == HTTP_CODE_OK) {
    String body = https.getString();
    int idx = body.indexOf("rango_spo2_min");
    if (idx >= 0) {
      idx = body.indexOf(":", idx) + 1;
      while (idx < (int)body.length() && (body[idx] == ' ' || body[idx] == '\t')) idx++;
      int endIdx = idx;
      while (endIdx < (int)body.length() && (isdigit(body[endIdx]) || body[endIdx] == '-')) endIdx++;
      if (endIdx > idx) {
        int nuevoLimite = body.substring(idx, endIdx).toInt();
        if (nuevoLimite >= 70 && nuevoLimite <= 100) {
          LIMITE_SPO2_BAJO = nuevoLimite;
          Serial.print("[CONFIG] Limite SpO2 sincronizado: "); Serial.print(LIMITE_SPO2_BAJO); Serial.println("%");
        }
      }
    }
  } else {
    Serial.print("[CONFIG] No se pudo sincronizar limite SpO2. HTTP: "); Serial.println(code);
  }
  https.end();
  delete client;
}

// ========== ENVIAR ESTADO DEL TANQUE A LA BD ==========
void enviarDatosTanque(float presionBar) {
  if (WiFi.status() != WL_CONNECTED || id_paciente == "") return;
  float pct     = calcularPorcentajeTanque(presionBar);
  int tiempoMin = (pct > 0.0f) ? (int)((pct / 100.0f) * 680.0f / 2.0f) : 0;
  WiFiClientSecure *client = new WiFiClientSecure;
  client->setInsecure();
  HTTPClient https;
  https.begin(*client, "https://seroa-web-production.up.railway.app/api/tanques");
  https.addHeader("Content-Type", "application/json");
  String payload = "{\"id_paciente\": " + id_paciente +
                   ", \"presion_actual\": " + String(presionBar, 3) +
                   ", \"porcentaje\": "     + String((int)pct) +
                   ", \"tiempo_restante_minutos\": " + String(tiempoMin) + "}";
  int code = https.POST(payload);
  if (code > 0) {
    Serial.print("[DB] Tanque enviado. Presion="); Serial.print(presionBar, 2);
    Serial.print(" bar, Pct="); Serial.print(pct, 1); Serial.println("%");
  } else {
    Serial.print("[DB] Error enviando tanque: "); Serial.println(https.errorToString(code).c_str());
  }
  https.end();
  delete client;
}

// ========== FIREBASE Y RAILWAY ==========
void enviarFirebase(int spo2Final, int bpmFinal, String estado, float presionBar) {
  if (!Firebase.ready() || id_paciente == "") return;

  String rutaBase = "Seroa/Pacientes/" + id_paciente + "/Actual";

  float pctTanque = calcularPorcentajeTanque(presionBar);
  // Tiempo restante: 680 L de referencia a 2 L/min de flujo promedio
  int tiempoMinutos = (pctTanque > 0.0f) ? (int)((pctTanque / 100.0f) * 680.0f / 2.0f) : 0;
  // PSI para visualización directa en el frontend
  float presionPSI = presionBar * 14.5038f;

  Firebase.RTDB.setInt(&fbdo, rutaBase + "/spo2", spo2Final);
  Firebase.RTDB.setInt(&fbdo, rutaBase + "/bpm", bpmFinal);
  Firebase.RTDB.setString(&fbdo, rutaBase + "/estado", estado);
  Firebase.RTDB.setFloat(&fbdo, rutaBase + "/presionBar", presionBar);
  Firebase.RTDB.setFloat(&fbdo, rutaBase + "/presionPSI", presionPSI);
  Firebase.RTDB.setFloat(&fbdo, rutaBase + "/porcentajeTanque", pctTanque);
  Firebase.RTDB.setString(&fbdo, rutaBase + "/estadoTanque", estadoTanque(presionBar));
  Firebase.RTDB.setInt(&fbdo, rutaBase + "/tiempoRestanteMinutos", tiempoMinutos);
  Firebase.RTDB.setBool(&fbdo, rutaBase + "/valvulaActiva", valvulaActiva);
  Firebase.RTDB.setInt(&fbdo, rutaBase + "/limiteSpo2Bajo", LIMITE_SPO2_BAJO);
  Firebase.RTDB.setInt(&fbdo, rutaBase + "/ultimaActualizacion", millis());
}

// NUEVA FUNCIÓN PARA ENVIAR DIRECTO AL BACKEND
void enviarRailway(String idPac, int spo2, int bpm) {
  if(WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure *client = new WiFiClientSecure;
    client->setInsecure(); // Ignora el certificado SSL
    HTTPClient https;

    https.begin(*client, "https://seroa-web-production.up.railway.app/api/registros");
    https.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"id_paciente\": " + idPac + 
                         ", \"saturacion_oxigeno\": " + String(spo2) + 
                         ", \"ritmo_cardiaco\": " + String(bpm) + "}";

    int httpResponseCode = https.POST(jsonPayload);
    
    if(httpResponseCode > 0) {
      Serial.print("Railway respondio OK: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("Error conectando a Railway: ");
      Serial.println(https.errorToString(httpResponseCode).c_str());
    }

    https.end();
    delete client;
  }
}

// ========== BLUETOOTH ==========
class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    bleConectado = true;
    Serial.println("");
    Serial.println("╔══════════════════════════════╗");
    Serial.println("║  BLE: APP CONECTADA          ║");
    Serial.println("╚══════════════════════════════╝");
    Serial.println("[BLE] Cliente vinculado. Esperando payload WiFi...");
    mostrarMensajeOLED("Bluetooth", "App conectada", "Envia WiFi");
  }

  void onDisconnect(BLEServer* pServer) {
    bleConectado = false;
    Serial.println("[BLE] Cliente desconectado.");
    // Reiniciar advertising para permitir nueva conexión
    BLEDevice::startAdvertising();
    Serial.println("[BLE] Advertising reiniciado. Esperando nueva conexion...");
  }
};

class MyCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    // getValue() devuelve std::string; lo convertimos a Arduino String de forma segura
    std::string valorStd = pCharacteristic->getValue();
    String payload = String(valorStd.c_str());

    Serial.println("");
    Serial.println("╔══════════════════════════════╗");
    Serial.println("║  BLE: PAYLOAD RECIBIDO       ║");
    Serial.println("╚══════════════════════════════╝");
    Serial.print("[BLE] Longitud: "); Serial.println(payload.length());
    Serial.print("[BLE] Contenido raw: ["); Serial.print(payload); Serial.println("]");

    if (payload.length() == 0) {
      Serial.println("[BLE] ERROR: Payload vacio. Ignorando.");
      mostrarMensajeOLED("Error BLE", "Payload vacio", "Reintenta");
      return;
    }

    int p1 = payload.indexOf('|');
    int p2 = (p1 >= 0) ? payload.indexOf('|', p1 + 1) : -1;

    Serial.print("[BLE] Posicion 1er pipe: "); Serial.println(p1);
    Serial.print("[BLE] Posicion 2do pipe: "); Serial.println(p2);

    // Validacion: ambos pipes encontrados y hay contenido despues del segundo
    if (p1 > 0 && p2 > p1 && p2 < (int)payload.length() - 1) {
      wifi_ssid   = payload.substring(0, p1);
      wifi_pass   = payload.substring(p1 + 1, p2);
      id_paciente = payload.substring(p2 + 1);

      // Eliminar posibles espacios o caracteres de control al final
      wifi_ssid.trim();
      wifi_pass.trim();
      id_paciente.trim();

      Serial.println("[BLE] Credenciales parseadas:");
      Serial.print("  SSID     : ["); Serial.print(wifi_ssid);   Serial.println("]");
      Serial.print("  Password : [*** "); Serial.print(wifi_pass.length()); Serial.println(" chars ***]");
      Serial.print("  ID Pac.  : ["); Serial.print(id_paciente); Serial.println("]");

      if (wifi_ssid.length() == 0 || wifi_pass.length() == 0 || id_paciente.length() == 0) {
        Serial.println("[BLE] ERROR: Campo vacio tras el parseo. Abortando.");
        mostrarMensajeOLED("Error BLE", "Campo vacio", "Reintenta");
        return;
      }

      // Guardar en NVS (flash no-volátil)
      preferencias.begin("seroa-cred", false);
      preferencias.putString("ssid",     wifi_ssid);
      preferencias.putString("pass",     wifi_pass);
      preferencias.putString("paciente", id_paciente);
      preferencias.end();

      Serial.println("[BLE] Credenciales guardadas en NVS. Reiniciando en 2s...");
      mostrarMensajeOLED("Credenciales", "Guardadas OK", "Reiniciando...");
      delay(2000);
      ESP.restart();

    } else {
      Serial.println("[BLE] ERROR: Formato invalido.");
      Serial.println("[BLE] Se esperaba: SSID|PASSWORD|ID_PACIENTE");
      Serial.print("[BLE] Recibido: ["); Serial.print(payload); Serial.println("]");
      mostrarMensajeOLED("Error BLE", "SSID|PASS|ID", "Formato inv.");
    }
  }
};

void setupBluetooth() {
  Serial.println("[BLE] Inicializando BLE con nombre SEROA_ESP32...");
  Serial.print("[BLE] Service UUID  : "); Serial.println(SERVICE_UUID);
  Serial.print("[BLE] Charact. UUID : "); Serial.println(CHARACTERISTIC_UUID);

  BLEDevice::init("SEROA_ESP32");

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  BLECharacteristic *pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ  |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_WRITE_NR   // Write without response también soportado
  );

  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  // Mejora compatibilidad iOS/Android
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("[BLE] Advertising activo. Abre la app Seroa y sincroniza.");
  mostrarMensajeOLED("Modo Bluetooth", "SEROA_ESP32", "Abre la app");
}

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("");
  Serial.println("╔══════════════════════════════════════╗");
  Serial.println("║       SEROA v2.0 — INICIANDO         ║");
  Serial.println("╠══════════════════════════════════════╣");
  Serial.print  ("║  SDA=21  SCL=22  RELAY=25  ADC=34    ║"); Serial.println("");
  Serial.println("╚══════════════════════════════════════╝");

  // Relay OFF por seguridad al arrancar
  pinMode(PIN_RELAY, OUTPUT);
  desactivarValvula();
  Serial.println("[HW] Relay desactivado (seguridad al arranque).");

  // Configurar ADC del sensor de presión
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_PRESION, ADC_11db);
  Serial.println("[HW] ADC configurado: 12-bit, 11dB atenuacion (0-3.6V).");

  // Iniciar bus I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  Serial.println("[HW] Bus I2C iniciado (SDA=21, SCL=22).");

  // OLED
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    oledConectada = true;
    Serial.println("[HW] OLED SSD1306 detectada en 0x3C.");
    mostrarMensajeOLED("Iniciando", "Sistema SEROA", "Espere...");
  } else {
    oledConectada = false;
    Serial.println("[HW] OLED NO detectada. Continuando sin pantalla.");
  }

  Serial.println("[INIT] Iniciando SEROA...");

  // Cargar credenciales y baseline desde NVS
  preferencias.begin("seroa-cred", false);
  wifi_ssid      = preferencias.getString("ssid",      "");
  wifi_pass      = preferencias.getString("pass",      "");
  id_paciente    = preferencias.getString("paciente",  "");
  maxPsiBaseline = preferencias.getFloat("psiBaseline", 0.0f);
  preferencias.end();

  Serial.println("[NVS] Credenciales cargadas desde flash:");
  Serial.print("  SSID     : ["); Serial.print(wifi_ssid.length() > 0 ? wifi_ssid : "(vacio)"); Serial.println("]");
  Serial.print("  Password : ["); Serial.print(wifi_pass.length() > 0 ? "(guardada)" : "(vacia)"); Serial.println("]");
  Serial.print("  ID Pac.  : ["); Serial.print(id_paciente.length() > 0 ? id_paciente : "(vacio)"); Serial.println("]");
  Serial.print("  Baseline : "); Serial.print(maxPsiBaseline, 3); Serial.println(" bar");

  if (maxPsiBaseline > 0.1f) {
    Serial.print("[CALIB] Baseline cargado: ");
    Serial.print(maxPsiBaseline, 2);
    Serial.println(" bar = 100%");
  } else {
    autoCalibPendiente = true;
    Serial.println("[CALIB] Sin baseline previo. Auto-calibracion pendiente al detectar presion.");
  }

  if (wifi_ssid == "" || id_paciente == "") {
    Serial.println("[INIT] Sin credenciales WiFi o ID de paciente. Entrando en modo Bluetooth...");
    setupBluetooth();
    while (true) { delay(100); }
  }

  BLEDevice::deinit(true);
  Serial.println("[BLE] Modulo BLE desactivado para liberar RAM.");

  mostrarMensajeOLED("Conectando", "WiFi...", wifi_ssid);
  Serial.println("[WiFi] Conectando a la red guardada...");
  Serial.print("[WiFi] SSID: ["); Serial.print(wifi_ssid); Serial.println("]");

  WiFi.begin(wifi_ssid.c_str(), wifi_pass.c_str());

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 40) {
    Serial.print(".");
    delay(500);
    intentos++;
    if (intentos % 10 == 0) {
      Serial.print(" [intento ");
      Serial.print(intentos);
      Serial.println("/40]");
    }
  }
  Serial.println("");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] FALLO: No se pudo conectar tras 40 intentos.");
    Serial.println("[WiFi] Borrando credenciales y reiniciando en modo BLE...");
    mostrarMensajeOLED("Error WiFi", "Reiniciando", "Config BLE");

    preferencias.begin("seroa-cred", false);
    preferencias.clear();
    preferencias.end();

    delay(2000);
    ESP.restart();
  }

  Serial.println("[WiFi] ¡Conectado!");
  Serial.print("[WiFi] IP asignada: "); Serial.println(WiFi.localIP());
  Serial.print("[WiFi] RSSI (señal): "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");
  mostrarMensajeOLED("WiFi OK", "Sincronizando", "config...");

  // Sincronizar umbral SpO2 desde la BD
  sincronizarLimiteSpo2();

  mostrarMensajeOLED("WiFi OK", "Conectando", "Firebase...");

  config.api_key      = API_KEY;
  config.database_url = DATABASE_URL;
  config.token_status_callback = tokenStatusCallback;  // Helper de TokenHelper.h

  Serial.println("[Firebase] Iniciando autenticacion anonima...");
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("[Firebase] ¡Autenticacion exitosa!");
  } else {
    Serial.print("[Firebase] ERROR de autenticacion: ");
    Serial.println(config.signer.signupError.message.c_str());
  }

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  Serial.println("[Firebase] Conexion iniciada. Esperando que este listo...");

  // Lectura inicial del sensor de presión para debug
  float presionInicial = leerPresionBar();
  Serial.print("[SENSOR] Presion inicial al arranque: ");
  Serial.print(presionInicial, 3);
  Serial.println(" bar");

  // Inicializar MAX30102
  Serial.println("[MAX30102] Buscando sensor en bus I2C...");
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[MAX30102] *** NO DETECTADO *** Revisar cables SDA/SCL y alimentacion 3.3V.");
    sensorConectado = false;
    estadoActual    = "SIN_SENSOR";
    desactivarValvula();
    enviarFirebase(0, 0, "SIN_SENSOR", presionInicial);
    mostrarMensajeOLED("MAX30102", "No detectado", "Revisar cables");
  } else {
    Serial.println("[MAX30102] Detectado correctamente.");
    sensorConectado = true;

    // ledBrightness=25, sampleAverage=4, ledMode=2(Red+IR), sampleRate=100, pulseWidth=411, adcRange=4096
    particleSensor.setup(25, 4, 2, 100, 411, 4096);
    particleSensor.setPulseAmplitudeRed(0x1F);
    particleSensor.setPulseAmplitudeIR(0x1F);
    particleSensor.wakeUp();
    particleSensor.clearFIFO();

    Serial.println("[MAX30102] Configurado: Red+IR, 100Hz, 411us, 4096 ADC range.");
    estadoActual = "SIN_DEDO";
    enviarFirebase(0, 0, "SIN_DEDO", presionInicial);
    mostrarMensajeOLED("Sistema listo", "Coloque dedo", "en sensor");
  }

  Serial.println("");
  Serial.println("[INIT] ¡Sistema SEROA en linea! Iniciando loop principal...");
  Serial.println("═══════════════════════════════════════");
}

// ========== LOOP ==========
void loop() {
  // Lectura del sensor de presión en cada iteración
  presionActual = leerPresionBar();

  // ── OnDisconnect: se configura una sola vez cuando Firebase está listo ──
  if (Firebase.ready() && !onDisconnectConfigurado && id_paciente != "") {
    String rutaEstado = "Seroa/Pacientes/" + id_paciente + "/Actual/estado";
    Firebase.RTDB.setDisconnectString(&fbdo, rutaEstado.c_str(), "Desconectado");
    onDisconnectConfigurado = true;
    Serial.println("[Firebase] OnDisconnect configurado. Escribira 'Desconectado' al perder enlace.");
  }

  // ── Auto-calibración en primer arranque ──────────────────────────────────
  // Requisito: Firebase listo + presión detectada + no hay calibración en curso
  if (autoCalibPendiente && !calibracionActiva && Firebase.ready() && id_paciente != "") {
    if (presionActual > 0.5f) {
      Serial.print("[AUTO-CALIB] Presion detectada: "); Serial.print(presionActual,3); Serial.println(" bar. Iniciando calibracion automatica.");
      autoCalibPendiente = false;
      // Notificar al frontend via Firebase
      String rutaBase = "Seroa/Pacientes/" + id_paciente + "/Actual";
      Firebase.RTDB.setBool(&fbdo, (rutaBase + "/calibracion_pendiente").c_str(), true);
      mostrarMensajeOLED("Auto-calibrando", "Primera medida", "No mover tanque");
      realizarCalibracion();
    } else {
      // Sin presión aún: no calibrar todavía
      Serial.print("[AUTO-CALIB] Esperando presion (actual: "); Serial.print(presionActual,3); Serial.println(" bar)...");
    }
  }

  // ── Calibración manual desde el frontend (flag en Firebase, cada 4 s) ───
  if (!calibracionActiva && !autoCalibPendiente && Firebase.ready() && id_paciente != "" &&
      (millis() - tiempoCalibCheck > INTERVALO_CALIB_CHECK)) {
    tiempoCalibCheck = millis();
    String rutaCalib = "Seroa/Pacientes/" + id_paciente + "/Actual/calibracion_pendiente";
    if (Firebase.RTDB.getBool(&fbdo, rutaCalib.c_str()) && fbdo.boolData() == true) {
      Serial.println("[CALIB] Flag 'calibracion_pendiente' detectado en Firebase. Iniciando...");
      realizarCalibracion();
    }
  }

  // ── Sincronizar estado del tanque en MySQL cada 30 s ────────────────────
  if (!calibracionActiva && (millis() - tiempoUltimoTanqueDB > INTERVALO_TANQUE_DB)) {
    tiempoUltimoTanqueDB = millis();
    Serial.print("[DB] Enviando estado del tanque a MySQL. Presion: ");
    Serial.print(presionActual, 3); Serial.println(" bar");
    enviarDatosTanque(presionActual);
  }

  // ── Sin sensor MAX30102: válvula OFF por seguridad, reportar solo presión ─
  if (!sensorConectado) {
    desactivarValvula();  // Seguridad: sin sensor → válvula siempre cerrada

    if (millis() - tiempoFirebase > intervaloFirebase) {
      tiempoFirebase = millis();
      estadoActual = "SIN_SENSOR";
      enviarFirebase(0, 0, estadoActual, presionActual);
      mostrarOLED(estadoActual, 0, 0, presionActual, valvulaActiva);
      Serial.print("[SENSOR] SIN_SENSOR. Presion: "); Serial.print(presionActual, 2); Serial.println(" bar");
    }
    return;
  }

  // Leer valor IR para detectar si hay dedo
  long irValue = particleSensor.getIR();

  // ── Sin dedo: estado CALIBRANDO/SIN_DEDO, válvula OFF por seguridad ──────
  if (irValue < 20000) {
    desactivarValvula();   // Sin dedo → válvula cerrada, sin excepción
    bufferLleno       = false;
    bufferFiltroLleno = false;
    indiceFiltro      = 0;

    if (millis() - tiempoFirebase > intervaloFirebase) {
      tiempoFirebase = millis();
      estadoActual = "SIN_DEDO";
      spo2Actual   = 0;
      bpmActual    = 0;
      enviarFirebase(0, 0, estadoActual, presionActual);
      mostrarOLED(estadoActual, 0, 0, presionActual, valvulaActiva);
      Serial.print("[SENSOR] SIN_DEDO. IR="); Serial.print(irValue);
      Serial.print("  Presion="); Serial.print(presionActual, 2); Serial.println(" bar");
    }
    delay(500);
    return;
  }

  // ── Hay dedo: llenando buffer de 100 muestras ─────────────────────────────
  // Mientras el buffer no esté lleno → CALIBRANDO, válvula OFF por seguridad
  estadoActual = "CALIBRANDO";
  desactivarValvula();   // Durante calibración del buffer: válvula siempre OFF

  if (!bufferLleno) {
    mostrarOLED("CALIB", 0, 0, presionActual, valvulaActiva);
    Serial.print("[MAX30102] Llenando buffer de 100 muestras. IR="); Serial.println(irValue);

    for (byte i = 0; i < bufferLength; i++) {
      while (!particleSensor.available()) { particleSensor.check(); delay(1); }
      redBuffer[i] = particleSensor.getRed();
      irBuffer[i]  = particleSensor.getIR();
      particleSensor.nextSample();
    }
    bufferLleno = true;
    Serial.println("[MAX30102] Buffer lleno. Calculando SpO2/BPM...");

  } else {
    // Buffer ya lleno: desplazar y añadir 25 nuevas muestras
    for (byte i = 25; i < 100; i++) {
      redBuffer[i - 25] = redBuffer[i];
      irBuffer[i - 25]  = irBuffer[i];
    }
    for (byte i = 75; i < 100; i++) {
      while (!particleSensor.available()) { particleSensor.check(); delay(1); }
      redBuffer[i] = particleSensor.getRed();
      irBuffer[i]  = particleSensor.getIR();
      particleSensor.nextSample();
    }
  }

  // Calcular SpO2 y BPM con el algoritmo MAXIM
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, bufferLength, redBuffer,
    &spo2, &validSPO2, &heartRate, &validHeartRate
  );

  if (millis() - tiempoAnterior > 1000) {
    tiempoAnterior = millis();

    // Debug de lecturas brutas del algoritmo
    Serial.print("[RAW] IR="); Serial.print(irValue);
    Serial.print("  SpO2="); Serial.print(spo2); Serial.print("(v="); Serial.print(validSPO2); Serial.print(")");
    Serial.print("  BPM=");  Serial.print(heartRate); Serial.print("(v="); Serial.print(validHeartRate); Serial.print(")");
    Serial.print("  Presion="); Serial.print(presionActual, 3); Serial.println(" bar");

    int bpmFinal = heartRate;
    // Corrección de doble conteo (artefacto del algoritmo MAXIM)
    if (validHeartRate == 1 && bpmFinal > 130 && bpmFinal < 250) {
      bpmFinal = bpmFinal / 2;
      Serial.print("[RAW] BPM corregido por doble conteo: "); Serial.println(bpmFinal);
    }

    // ── Solo pasar a estado ACTIVO cuando los datos son VÁLIDOS ─────────────
    if (validHeartRate == 1 && validSPO2 == 1 &&
        spo2 >= 85 && spo2 <= 100 &&
        bpmFinal > 40 && bpmFinal < 130) {

      // Acumular en buffer de promediado (5 lecturas)
      lecturasSpO2[indiceFiltro] = spo2;
      lecturasBPM[indiceFiltro]  = bpmFinal;
      indiceFiltro++;
      if (indiceFiltro >= numLecturas) { indiceFiltro = 0; bufferFiltroLleno = true; }

      // ── Solo enviar datos cuando el buffer de promediado esté lleno ────────
      if (bufferFiltroLleno) {
        int sumaSpO2 = 0, sumaBPM = 0;
        for (int i = 0; i < numLecturas; i++) { sumaSpO2 += lecturasSpO2[i]; sumaBPM += lecturasBPM[i]; }

        int promedioSpO2 = sumaSpO2 / numLecturas;
        int promedioBPM  = sumaBPM  / numLecturas;
        int bpmAjustado  = max(40, promedioBPM - 15);  // Corrección empírica del sensor

        spo2Actual = promedioSpO2;
        bpmActual  = bpmAjustado;
        estadoActual = "ACTIVO";

        // Control de válvula según umbral SpO2
        if (promedioSpO2 < LIMITE_SPO2_BAJO) {
          activarValvula();
          Serial.print("[VALVULA] ACTIVADA — SpO2="); Serial.print(promedioSpO2);
          Serial.print("% < limite="); Serial.print(LIMITE_SPO2_BAJO); Serial.println("%");
        } else {
          desactivarValvula();
        }

        // Enviar a Firebase y Railway
        enviarFirebase(spo2Actual, bpmActual, estadoActual, presionActual);
        enviarRailway(id_paciente, spo2Actual, bpmActual);
        mostrarOLED(estadoActual, spo2Actual, bpmActual, presionActual, valvulaActiva);

        // Debug completo de la lectura
        Serial.println("╔══════════════ SEROA DATA ══════════════╗");
        Serial.print("║  Estado  : "); Serial.println(estadoActual);
        Serial.print("║  SpO2    : "); Serial.print(spo2Actual); Serial.println("%");
        Serial.print("║  BPM     : "); Serial.println(bpmActual);
        Serial.print("║  Presion : "); Serial.print(presionActual, 2); Serial.print(" bar  (");
        Serial.print((int)(presionActual * 14.5038f + 0.5f)); Serial.println(" PSI)");
        Serial.print("║  Tanque  : "); Serial.print(calcularPorcentajeTanque(presionActual), 1); Serial.println("%");
        Serial.print("║  Estado T: "); Serial.println(estadoTanque(presionActual));
        Serial.print("║  Valvula : "); Serial.println(valvulaActiva ? "ACTIVA (abierta)" : "INACTIVA (cerrada)");
        Serial.print("║  Limite  : SpO2 < "); Serial.print(LIMITE_SPO2_BAJO); Serial.println("%");
        Serial.println("╚════════════════════════════════════════╝");

      } else {
        // Buffer de promediado aún llenándose → CALIBRANDO, válvula OFF
        estadoActual = "CALIBRANDO";
        desactivarValvula();
        Serial.print("[CALIB] Llenando buffer de promedio (");
        Serial.print(indiceFiltro); Serial.print("/"); Serial.print(numLecturas); Serial.println(")");
        enviarFirebase(0, 0, estadoActual, presionActual);
        mostrarOLED("CALIB", 0, 0, presionActual, valvulaActiva);
      }

    } else {
      // Lectura no válida (fuera de rango fisiológico): seguir en CALIBRANDO
      estadoActual = "CALIBRANDO";
      desactivarValvula();  // Datos no confiables → válvula OFF por seguridad
      enviarFirebase(0, 0, estadoActual, presionActual);
      mostrarOLED("CALIB", 0, 0, presionActual, valvulaActiva);
      Serial.print("[CALIB] Lectura fuera de rango: SpO2="); Serial.print(spo2);
      Serial.print(" BPM="); Serial.print(bpmFinal);
      Serial.println(". Descartada. Esperando lectura valida...");
    }
  }
}
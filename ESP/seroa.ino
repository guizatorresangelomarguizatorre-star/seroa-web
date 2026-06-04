#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// Librerías de Bluetooth y Memoria
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Librerías OLED (I2C compartido con MAX30102)
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ================= CONSTANTES =================
#define API_KEY        "AIzaSyD8GcNRjouSlrlNSKXcNrjl0gjAYuXvTMQ"
#define DATABASE_URL   "https://seroa-e8606-default-rtdb.firebaseio.com"

#define PIN_RELAY      25
#define PIN_PRESION    34
#define RELAY_ACTIVE_LOW true

#define OLED_WIDTH     128
#define OLED_HEIGHT    64
#define OLED_ADDRESS   0x3C

// ================= OBJETOS =================
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
MAX30105 particleSensor;
Preferences preferencias;
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

// ================= VARIABLES GLOBALES =================
String wifi_ssid    = "";
String wifi_pass    = "";
String id_paciente  = "";
bool bleConectado   = false;
bool sensorConectado = false;
bool oledConectada  = false;

// UUIDs del Bluetooth
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Variables del algoritmo MAX30102
uint32_t irBuffer[100];
uint32_t redBuffer[100];
int32_t bufferLength = 100;
int32_t spo2;
int8_t  validSPO2;
int32_t heartRate;
int8_t  validHeartRate;

bool bufferLleno        = false;
const int numLecturas   = 5;
int lecturasSpO2[numLecturas];
int lecturasBPM[numLecturas];
int indiceFiltro        = 0;
bool bufferFiltroLleno  = false;

unsigned long tiempoAnterior  = 0;
unsigned long tiempoFirebase  = 0;
unsigned long intervaloFirebase = 1000;

int  LIMITE_SPO2_BAJO = 90;
bool valvulaActiva    = false;

// ================= FUNCIÓN OLED =================
void actualizarOLED(String estado, int spO2Val, int bpmVal, float presionVal, bool valvula) {
  if (!oledConectada) return;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(30, 0);
  display.print("-- SEROA --");

  display.setCursor(0, 12);
  display.print("Estado: ");
  display.print(estado);

  display.setCursor(0, 24);
  display.print("SpO2:   ");
  if (spO2Val > 0) { display.print(spO2Val); display.print(" %"); }
  else              { display.print("--"); }

  display.setCursor(0, 34);
  display.print("BPM:    ");
  if (bpmVal > 0) { display.print(bpmVal); }
  else            { display.print("--"); }

  display.setCursor(0, 44);
  display.print("Pres:   ");
  display.print(presionVal, 2);
  display.print(" bar");

  display.setCursor(0, 54);
  display.print("Valvula: ");
  display.print(valvula ? "ON" : "OFF");

  display.display();
}

// ================= BLUETOOTH CALLBACKS =================
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    bleConectado = true;
    Serial.println("App vinculada. Esperando datos...");
  }
  void onDisconnect(BLEServer* pServer) {
    bleConectado = false;
    Serial.println("App desconectada.");
  }
};

// CORRECCIÓN ESP32 Core 3.x: getData()/getLength() en lugar de getValue()
class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    uint8_t* data = pCharacteristic->getData();
    size_t   len  = pCharacteristic->getLength();

    if (len == 0) return;

    String payload = "";
    for (size_t i = 0; i < len; i++) {
      payload += (char)data[i];
    }

    Serial.println("Payload BLE recibido: " + payload);

    int primerPipe  = payload.indexOf('|');
    int segundoPipe = payload.indexOf('|', primerPipe + 1);

    if (primerPipe > 0 && segundoPipe > 0) {
      wifi_ssid   = payload.substring(0, primerPipe);
      wifi_pass   = payload.substring(primerPipe + 1, segundoPipe);
      id_paciente = payload.substring(segundoPipe + 1);

      preferencias.begin("seroa-cred", false);
      preferencias.putString("ssid",     wifi_ssid);
      preferencias.putString("pass",     wifi_pass);
      preferencias.putString("paciente", id_paciente);
      preferencias.end();

      Serial.println("Credenciales guardadas. Reiniciando en 2 s...");
      delay(2000);
      ESP.restart();
    } else {
      Serial.println("Error BLE: formato invalido. Se esperaba SSID|PASS|ID");
    }
  }
};

// ================= FUNCIONES HARDWARE =================
void activarValvula() {
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? LOW : HIGH);
  valvulaActiva = true;
}

void desactivarValvula() {
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  valvulaActiva = false;
}

float leerPresionBar() {
  int   lecturaADC   = analogRead(PIN_PRESION);
  float voltajeADC   = (lecturaADC / 4095.0f) * 3.3f;
  float voltajeSensor = voltajeADC * 1.5f;
  float presion      = ((voltajeSensor - 0.5f) * 12.0f) / 4.0f;

  if (presion < 0)  presion = 0;
  if (presion > 12) presion = 12;

  return presion;
}

void enviarFirebase(int spo2Final, int bpmFinal, String estado, float presionBar) {
  String ruta = "Seroa/Pacientes/" + id_paciente + "/Actual";

  Firebase.RTDB.setInt   (&fbdo, ruta + "/spo2",         spo2Final);
  Firebase.RTDB.setInt   (&fbdo, ruta + "/bpm",          bpmFinal);
  Firebase.RTDB.setString(&fbdo, ruta + "/estado",       estado);
  Firebase.RTDB.setFloat (&fbdo, ruta + "/presionBar",   presionBar);
  Firebase.RTDB.setBool  (&fbdo, ruta + "/valvulaActiva", valvulaActiva);
}

void setupBluetooth() {
  Serial.println("Inicializando BLE...");
  BLEDevice::init("SEROA_ESP32");
  BLEServer* pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);
  BLECharacteristic* pChar = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  pChar->setCallbacks(new MyCallbacks());
  pService->start();

  BLEAdvertising* pAdv = BLEDevice::getAdvertising();
  pAdv->addServiceUUID(SERVICE_UUID);
  pAdv->setScanResponse(true);
  pAdv->setMinPreferred(0x06);
  pAdv->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("Modo Sincronizacion BLE activo. Envía los datos desde la PWA...");
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(PIN_RELAY, OUTPUT);
  desactivarValvula();          // Seguridad: válvula cerrada al arrancar
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Serial.println("=== Iniciando SEROA ===");

  preferencias.begin("seroa-cred", false);
  wifi_ssid   = preferencias.getString("ssid",     "");
  wifi_pass   = preferencias.getString("pass",     "");
  id_paciente = preferencias.getString("paciente", "");
  preferencias.end();

  if (wifi_ssid == "") {
    // Sin credenciales: modo aprovisionamiento BLE
    setupBluetooth();
    while (true) { delay(100); }
  }

  // Con credenciales guardadas: modo operativo
  BLEDevice::deinit(true);
  Serial.println("Conectando a WiFi: " + wifi_ssid);
  WiFi.begin(wifi_ssid.c_str(), wifi_pass.c_str());

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 20) {
    Serial.print(".");
    delay(500);
    intentos++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFallo WiFi. Borrando credenciales y reiniciando...");
    preferencias.begin("seroa-cred", false);
    preferencias.clear();
    preferencias.end();
    ESP.restart();
  }

  Serial.println("\nWiFi conectado. IP: " + WiFi.localIP().toString());

  // Firebase
  config.api_key      = API_KEY;
  config.database_url = DATABASE_URL;
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase autenticado. Paciente: " + id_paciente);
  }
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // Bus I2C compartido GPIO21 (SDA) / GPIO22 (SCL)
  Wire.begin(21, 22);

  // OLED SSD1306
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("ADVERTENCIA: OLED SSD1306 no detectada en 0x3C.");
    oledConectada = false;
  } else {
    Serial.println("OLED SSD1306 detectada correctamente.");
    oledConectada = true;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(20, 28);
    display.print("Iniciando SEROA...");
    display.display();
  }

  // MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("ADVERTENCIA: MAX30102 no detectado. Sistema sin sensor.");
    sensorConectado = false;
    Firebase.RTDB.setString(&fbdo, "Seroa/Pacientes/" + id_paciente + "/Actual/estado", "SIN_SENSOR");
    actualizarOLED("SIN_SENSOR", 0, 0, 0.0f, false);
  } else {
    Serial.println("MAX30102 detectado correctamente.");
    sensorConectado = true;
    particleSensor.setup(50, 4, 2, 100, 411, 4096);
    Firebase.RTDB.setString(&fbdo, "Seroa/Pacientes/" + id_paciente + "/Actual/estado", "SIN_DEDO");
    actualizarOLED("SIN_DEDO", 0, 0, 0.0f, false);
  }

  Serial.println("=== Sistema SEROA en linea ===");
}

// ================= LOOP =================
void loop() {
  if (wifi_ssid == "") return;

  // Leer presión en cada ciclo (directriz 3)
  float presionBar = leerPresionBar();
  Serial.printf("[DEBUG] Presion: %.2f bar\n", presionBar);

  // --- Caso: sin sensor físico ---
  if (!sensorConectado) {
    desactivarValvula();  // Seguridad: sin sensor = válvula cerrada
    if (millis() - tiempoFirebase > intervaloFirebase) {
      tiempoFirebase = millis();
      enviarFirebase(0, 0, "SIN_SENSOR", presionBar);
      actualizarOLED("SIN_SENSOR", 0, 0, presionBar, false);
      Serial.println("[DEBUG] Ping Firebase: SIN_SENSOR");
    }
    return;
  }

  // Leer IR del MAX30102
  long irValue = particleSensor.getIR();
  Serial.printf("[DEBUG] IR raw: %ld\n", irValue);

  // --- Caso: sin dedo ---
  if (irValue < 20000) {
    desactivarValvula();  // Seguridad: sin dedo = válvula cerrada
    bufferLleno       = false;  // Resetear para próxima sesión
    bufferFiltroLleno = false;
    indiceFiltro      = 0;

    if (millis() - tiempoFirebase > intervaloFirebase) {
      tiempoFirebase = millis();
      enviarFirebase(0, 0, "SIN_DEDO", presionBar);
      actualizarOLED("SIN_DEDO", 0, 0, presionBar, false);
      Serial.println("[DEBUG] Sin dedo. Valvula CERRADA.");
    }
    delay(500);
    return;
  }

  // --- Llenar buffer inicial de 100 muestras ---
  if (!bufferLleno) {
    for (byte i = 0; i < bufferLength; i++) {
      while (particleSensor.available() == false) {
        particleSensor.check();
        delay(1);
      }
      redBuffer[i] = particleSensor.getRed();
      irBuffer[i]  = particleSensor.getIR();
      particleSensor.nextSample();
      Serial.printf("[DEBUG] Llenando buffer: %d/100\n", i + 1);
    }
    bufferLleno = true;
    Serial.println("[DEBUG] Buffer de 100 muestras completo. Iniciando calculo...");
  } else {
    // Desplazar y añadir 25 muestras nuevas
    for (byte i = 25; i < 100; i++) {
      redBuffer[i - 25] = redBuffer[i];
      irBuffer[i - 25]  = irBuffer[i];
    }
    for (byte i = 75; i < 100; i++) {
      while (particleSensor.available() == false) {
        particleSensor.check();
        delay(1);
      }
      redBuffer[i] = particleSensor.getRed();
      irBuffer[i]  = particleSensor.getIR();
      particleSensor.nextSample();
    }
  }

  // Calcular SpO2 y BPM
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, bufferLength, redBuffer,
    &spo2, &validSPO2, &heartRate, &validHeartRate
  );

  if (millis() - tiempoAnterior > 1000) {
    tiempoAnterior = millis();
    int bpmFinal = heartRate;

    // Corrección por doble conteo del algoritmo
    if (validHeartRate == 1 && bpmFinal > 130 && bpmFinal < 250) {
      bpmFinal = bpmFinal / 2;
    }

    bool lecturaValida = (validHeartRate == 1 && validSPO2 == 1 &&
                          spo2 >= 85 && bpmFinal > 40 && bpmFinal < 130);

    if (lecturaValida) {
      lecturasSpO2[indiceFiltro] = spo2;
      lecturasBPM[indiceFiltro]  = bpmFinal;
      indiceFiltro++;

      Serial.printf("[DEBUG] Llenando buffer filtro: %d/%d | SpO2=%d BPM=%d\n",
                    indiceFiltro, numLecturas, spo2, bpmFinal);

      if (indiceFiltro >= numLecturas) {
        indiceFiltro      = 0;
        bufferFiltroLleno = true;
      }

      if (bufferFiltroLleno) {
        // Promediar las últimas N lecturas válidas
        int sumaSpO2 = 0, sumaBPM = 0;
        for (int i = 0; i < numLecturas; i++) {
          sumaSpO2 += lecturasSpO2[i];
          sumaBPM  += lecturasBPM[i];
        }
        int promedioSpO2 = sumaSpO2 / numLecturas;
        int promedioBPM  = sumaBPM  / numLecturas;

        int bpmAjustado = promedioBPM - 15;
        if (bpmAjustado < 40) bpmAjustado = 40;

        // Válvula SOLO si SpO2 por debajo del límite (directriz 3)
        if (promedioSpO2 < LIMITE_SPO2_BAJO) {
          activarValvula();
        } else {
          desactivarValvula();
        }

        // Firebase + OLED (directriz 4)
        enviarFirebase(promedioSpO2, bpmAjustado, "ACTIVO", presionBar);
        actualizarOLED("ACTIVO", promedioSpO2, bpmAjustado, presionBar, valvulaActiva);

        // Resumen serial validado (directriz 5)
        Serial.println("============== SEROA ==============");
        Serial.printf("[RESUMEN] SpO2: %d%% | BPM: %d | Presion: %.2f bar | Valvula: %s\n",
                      promedioSpO2, bpmAjustado, presionBar,
                      valvulaActiva ? "ON" : "OFF");
        Serial.println("===================================");

      } else {
        // Buffer filtro aún incompleto: seguridad = válvula cerrada
        desactivarValvula();
        enviarFirebase(0, 0, "CALIBRANDO", presionBar);
        actualizarOLED("CALIBRANDO", 0, 0, presionBar, false);
        Serial.printf("[DEBUG] Calibrando buffer filtro: %d/%d. Valvula CERRADA.\n",
                      indiceFiltro, numLecturas);
      }

    } else {
      // Lectura inválida del algoritmo: seguridad = válvula cerrada
      desactivarValvula();
      enviarFirebase(0, 0, "CALIBRANDO", presionBar);
      actualizarOLED("CALIBRANDO", 0, 0, presionBar, false);
      Serial.printf("[DEBUG] Lectura invalida -> validSPO2=%d validHR=%d SpO2=%d BPM=%d. Valvula CERRADA.\n",
                    validSPO2, validHeartRate, spo2, bpmFinal);
    }
  }
}

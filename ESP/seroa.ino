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

#define PIN_RELAY 25
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

int spo2Actual = 0;
int bpmActual = 0;
float presionActual = 0;
String estadoActual = "ACTIVO";

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

// ========== FIREBASE Y RAILWAY ==========
void enviarFirebase(int spo2Final, int bpmFinal, String estado, float presionBar) {
  if (!Firebase.ready() || id_paciente == "") return;

  String rutaBase = "Seroa/Pacientes/" + id_paciente + "/Actual";

  Firebase.RTDB.setInt(&fbdo, rutaBase + "/spo2", spo2Final);
  Firebase.RTDB.setInt(&fbdo, rutaBase + "/bpm", bpmFinal);
  Firebase.RTDB.setString(&fbdo, rutaBase + "/estado", estado);
  Firebase.RTDB.setFloat(&fbdo, rutaBase + "/presionBar", presionBar);
  Firebase.RTDB.setString(&fbdo, rutaBase + "/estadoTanque", estadoTanque(presionBar));
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
    Serial.println("App vinculada. Esperando datos...");
    mostrarMensajeOLED("Bluetooth", "App conectada", "Envia WiFi");
  }

  void onDisconnect(BLEServer* pServer) {
    bleConectado = false;
    Serial.println("App desconectada.");
  }
};

class MyCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String payload = pCharacteristic->getValue();

    if (payload.length() > 0) {
      Serial.println("Payload recibido: " + payload);

      int primerPipe = payload.indexOf('|');
      int segundoPipe = payload.indexOf('|', primerPipe + 1);

      if (primerPipe > 0 && segundoPipe > 0) {
        wifi_ssid = payload.substring(0, primerPipe);
        wifi_pass = payload.substring(primerPipe + 1, segundoPipe);
        id_paciente = payload.substring(segundoPipe + 1);

        preferencias.begin("seroa-cred", false);
        preferencias.putString("ssid", wifi_ssid);
        preferencias.putString("pass", wifi_pass);
        preferencias.putString("paciente", id_paciente);
        preferencias.end();

        mostrarMensajeOLED("Datos guardados", "Reiniciando", "Espere...");
        delay(2000);
        ESP.restart();
      } else {
        Serial.println("Formato invalido.");
        mostrarMensajeOLED("Error BLE", "Formato", "invalido");
      }
    }
  }
};

void setupBluetooth() {
  Serial.println("Inicializando BLE...");
  BLEDevice::init("SEROA_ESP32");

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  BLECharacteristic *pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );

  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("Modo sincronizacion Bluetooth.");
  mostrarMensajeOLED("Modo Bluetooth", "Abre la PWA", "Sincroniza WiFi");
}

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(PIN_RELAY, OUTPUT);
  desactivarValvula();

  analogReadResolution(12);
  analogSetPinAttenuation(PIN_PRESION, ADC_11db);

  Wire.begin(SDA_PIN, SCL_PIN);

  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    oledConectada = true;
    mostrarMensajeOLED("Iniciando", "Sistema SEROA", "Espere...");
  } else {
    oledConectada = false;
    Serial.println("OLED no detectada.");
  }

  Serial.println("Iniciando SEROA...");

  preferencias.begin("seroa-cred", false);
  wifi_ssid = preferencias.getString("ssid", "");
  wifi_pass = preferencias.getString("pass", "");
  id_paciente = preferencias.getString("paciente", "");
  preferencias.end();

  if (wifi_ssid == "" || id_paciente == "") {
    setupBluetooth();
    while (true) {
      delay(100);
    }
  }

  BLEDevice::deinit(true);

  mostrarMensajeOLED("Conectando", "WiFi...", wifi_ssid);
  Serial.println("Conectando al WiFi guardado...");

  WiFi.begin(wifi_ssid.c_str(), wifi_pass.c_str());

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    Serial.print(".");
    delay(500);
    intentos++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Fallo WiFi. Reseteando credenciales.");
    mostrarMensajeOLED("Error WiFi", "Reiniciando", "Config BLE");

    preferencias.begin("seroa-cred", false);
    preferencias.clear();
    preferencias.end();

    delay(2000);
    ESP.restart();
  }

  Serial.println("\nWiFi conectado.");
  mostrarMensajeOLED("WiFi OK", "Conectando", "Firebase");

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase listo.");
  } else {
    Serial.println("Error Firebase:");
    Serial.println(config.signer.signupError.message.c_str());
  }

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30102 no detectado.");
    sensorConectado = false;
    estadoActual = "SIN_SENSOR";
    desactivarValvula();
    enviarFirebase(0, 0, "SIN_SENSOR", leerPresionBar());
    mostrarMensajeOLED("MAX30102", "No detectado", "Revisar cables");
  } else {
    Serial.println("MAX30102 detectado.");
    sensorConectado = true;

    particleSensor.setup(25, 4, 2, 100, 411, 4096);
    particleSensor.setPulseAmplitudeRed(0x1F);
    particleSensor.setPulseAmplitudeIR(0x1F);

    particleSensor.wakeUp();
    particleSensor.clearFIFO();

    estadoActual = "SIN_DEDO";
    enviarFirebase(0, 0, "SIN_DEDO", leerPresionBar());
    mostrarMensajeOLED("Sistema listo", "Coloque dedo", "en sensor");
  }

  Serial.println("Sistema en linea.");
}

// ========== LOOP ==========
void loop() {
  presionActual = leerPresionBar();

  if (!sensorConectado) {
    desactivarValvula();

    if (millis() - tiempoFirebase > intervaloFirebase) {
      tiempoFirebase = millis();

      estadoActual = "SIN_SENSOR";
      enviarFirebase(0, 0, estadoActual, presionActual);
      mostrarOLED(estadoActual, 0, 0, presionActual, valvulaActiva);

      Serial.println("Sistema vivo, pero sin MAX30102.");
    }

    return;
  }

  long irValue = particleSensor.getIR();

  if (irValue < 20000) {
    desactivarValvula();
    bufferLleno = false;
    bufferFiltroLleno = false;
    indiceFiltro = 0;

    if (millis() - tiempoFirebase > intervaloFirebase) {
      tiempoFirebase = millis();

      estadoActual = "SIN_DEDO";
      spo2Actual = 0;
      bpmActual = 0;

      enviarFirebase(0, 0, estadoActual, presionActual);
      mostrarOLED(estadoActual, 0, 0, presionActual, valvulaActiva);

      Serial.println("Sin dedo en el sensor.");
    }

    delay(500);
    return;
  }

  estadoActual = "CALIBRANDO";

  if (!bufferLleno) {
    mostrarOLED("CALIB", 0, 0, presionActual, valvulaActiva);

    for (byte i = 0; i < bufferLength; i++) {
      while (particleSensor.available() == false) {
        particleSensor.check();
        delay(1);
      }

      redBuffer[i] = particleSensor.getRed();
      irBuffer[i] = particleSensor.getIR();
      particleSensor.nextSample();
    }

    bufferLleno = true;
  } else {
    for (byte i = 25; i < 100; i++) {
      redBuffer[i - 25] = redBuffer[i];
      irBuffer[i - 25] = irBuffer[i];
    }

    for (byte i = 75; i < 100; i++) {
      while (particleSensor.available() == false) {
        particleSensor.check();
        delay(1);
      }

      redBuffer[i] = particleSensor.getRed();
      irBuffer[i] = particleSensor.getIR();
      particleSensor.nextSample();
    }
  }

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer,
    bufferLength,
    redBuffer,
    &spo2,
    &validSPO2,
    &heartRate,
    &validHeartRate
  );

  if (millis() - tiempoAnterior > 1000) {
    tiempoAnterior = millis();

    int bpmFinal = heartRate;

    if (validHeartRate == 1 && bpmFinal > 130 && bpmFinal < 250) {
      bpmFinal = bpmFinal / 2;
    }

    if (validHeartRate == 1 && validSPO2 == 1 && spo2 >= 85 && spo2 <= 100 && bpmFinal > 40 && bpmFinal < 130) {
      lecturasSpO2[indiceFiltro] = spo2;
      lecturasBPM[indiceFiltro] = bpmFinal;
      indiceFiltro++;

      if (indiceFiltro >= numLecturas) {
        indiceFiltro = 0;
        bufferFiltroLleno = true;
      }

      if (bufferFiltroLleno) {
        int sumaSpO2 = 0;
        int sumaBPM = 0;

        for (int i = 0; i < numLecturas; i++) {
          sumaSpO2 += lecturasSpO2[i];
          sumaBPM += lecturasBPM[i];
        }

        int promedioSpO2 = sumaSpO2 / numLecturas;
        int promedioBPM = sumaBPM / numLecturas;

        int bpmAjustado = promedioBPM - 15;
        if (bpmAjustado < 40) bpmAjustado = 40;

        spo2Actual = promedioSpO2;
        bpmActual = bpmAjustado;

        if (promedioSpO2 < LIMITE_SPO2_BAJO) {
          activarValvula();
          estadoActual = "ACTIVO";
        } else {
          desactivarValvula();
          estadoActual = "ACTIVO";
        }

        // Envía a Firebase (para interfaz en vivo)
        enviarFirebase(spo2Actual, bpmActual, estadoActual, presionActual);
        
        // LLAMADA NUEVA AL BACKEND RAILWAY
        enviarRailway(id_paciente, spo2Actual, bpmActual);
        
        mostrarOLED(estadoActual, spo2Actual, bpmActual, presionActual, valvulaActiva);

        Serial.println("============== SEROA ==============");
        Serial.print("SpO2: "); Serial.print(spo2Actual); Serial.println("%");
        Serial.print("BPM: "); Serial.println(bpmActual);
        Serial.print("Presion: "); Serial.print(presionActual); Serial.println(" bar");
        Serial.print("Tanque: "); Serial.println(estadoTanque(presionActual));
        Serial.print("Valvula: "); Serial.println(valvulaActiva ? "ACTIVA" : "INACTIVA");
        Serial.println("===================================");
      } else {
        estadoActual = "CALIBRANDO";
        desactivarValvula();

        enviarFirebase(0, 0, estadoActual, presionActual);
        mostrarOLED("CALIB", 0, 0, presionActual, valvulaActiva);
      }

    } else {
      estadoActual = "CALIBRANDO";
      desactivarValvula();

      enviarFirebase(0, 0, estadoActual, presionActual);
      mostrarOLED("CALIB", 0, 0, presionActual, valvulaActiva);

      Serial.println("Lectura no valida. Calibrando...");
    }
  }
}
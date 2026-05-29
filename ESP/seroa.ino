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

#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ================= CONSTANTES =================
#define API_KEY "AIzaSyD8GcNrjousLrlNSKXcNrjl0gjAYuXvTMQ"
#define DATABASE_URL "https://seroa-e8606-default-rtdb.firebaseio.com"

#define PIN_RELAY 25
#define PIN_PRESION 34
#define RELAY_ACTIVE_LOW true

// ================= OBJETOS =================
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
MAX30105 particleSensor;
Preferences preferencias;

// ================= VARIABLES GLOBALES =================
String wifi_ssid = "";
String wifi_pass = "";
String id_paciente = "";
bool bleConectado = false;

// UUIDs del Bluetooth
#define SERVICE_UUID           "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Variables del algoritmo y sensores
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

unsigned long tiempoAnterior = 0;
unsigned long tiempoFirebase = 0;
unsigned long intervaloFirebase = 1000;

int LIMITE_SPO2_BAJO = 90;
bool valvulaActiva = false;

// ================= BLUETOOTH CALLBACKS =================
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      bleConectado = true;
      Serial.println("App vinculada. Esperando datos...");
    };
    void onDisconnect(BLEServer* pServer) {
      bleConectado = false;
      Serial.println("App desconectada.");
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string rxValue = pCharacteristic->getValue();

      if (rxValue.length() > 0) {
        String payload = String(rxValue.c_str());
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

          Serial.println("Datos guardados. El dispositivo se reiniciará en 2 segundos...");
          delay(2000);
          ESP.restart(); 
        } else {
          Serial.println("Error: El formato no es válido.");
        }
      }
    }
};

// ================= FUNCIONES HARDWARE =================
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

float leerPresionBar() {
  int lecturaADC = analogRead(PIN_PRESION);
  float voltajeADC = (lecturaADC / 4095.0) * 3.3;
  float voltajeSensor = voltajeADC * 1.5;
  float presion = ((voltajeSensor - 0.5) * 12.0) / 4.0;

  if (presion < 0) presion = 0;
  if (presion > 12) presion = 12;

  return presion;
}

void enviarFirebase(int spo2Final, int bpmFinal, String estado, float presionBar) {
  // Enviar a la ruta del paciente específico sincronizado
  String rutaBase = "Seroa/Pacientes/" + id_paciente + "/Actual";

  Firebase.RTDB.setInt(&fbdo, rutaBase + "/spo2", spo2Final);
  Firebase.RTDB.setInt(&fbdo, rutaBase + "/bpm", bpmFinal);
  Firebase.RTDB.setString(&fbdo, rutaBase + "/estado", estado);
  Firebase.RTDB.setFloat(&fbdo, rutaBase + "/presionBar", presionBar);
  Firebase.RTDB.setBool(&fbdo, rutaBase + "/valvulaActiva", valvulaActiva);
}

void setupBluetooth() {
  Serial.println("Inicializando BLE...");
  BLEDevice::init("SEROA_ESP32"); 
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  BLECharacteristic *pCharacteristic = pService->createCharacteristic(
                                         CHARACTERISTIC_UUID,
                                         BLECharacteristic::PROPERTY_READ |
                                         BLECharacteristic::PROPERTY_WRITE
                                       );
  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();
  
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("Modo Sincronización. Envia los datos desde la PWA...");
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(PIN_RELAY, OUTPUT);
  desactivarValvula();
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Serial.println("Iniciando SEROA...");

  preferencias.begin("seroa-cred", false);
  wifi_ssid = preferencias.getString("ssid", "");
  wifi_pass = preferencias.getString("pass", "");
  id_paciente = preferencias.getString("paciente", "");
  preferencias.end();

  if (wifi_ssid == "") {
    setupBluetooth();
    // Atrapar en loop infinito hasta que se configure el WiFi
    while (true) { delay(100); }
  } else {
    BLEDevice::deinit(true); // Apagar BLE para liberar memoria RAM
    Serial.println("Conectando al WiFi guardado...");
    WiFi.begin(wifi_ssid.c_str(), wifi_pass.c_str());

    int intentos = 0;
    while (WiFi.status() != WL_CONNECTED && intentos < 20) {
      Serial.print(".");
      delay(500);
      intentos++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi conectado.");
      config.api_key = API_KEY;
      config.database_url = DATABASE_URL;

      if (Firebase.signUp(&config, &auth, "", "")) {
        Serial.println("Firebase listo. ID Paciente: " + id_paciente);
      }
      Firebase.begin(&config, &auth);
      Firebase.reconnectWiFi(true);

      Wire.begin(21, 22);
      if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
        Serial.println("ERROR: MAX30102 no detectado.");
        while (1);
      }
      particleSensor.setup(50, 4, 2, 100, 411, 4096);
      
      // Estado de inicio
      Firebase.RTDB.setString(&fbdo, "Seroa/Pacientes/" + id_paciente + "/Actual/estado", "SIN_DEDO");
      Serial.println("Sistema en línea. Coloca tu dedo.");
    } else {
      Serial.println("\nFallo en el WiFi. Reseteando configuración...");
      preferencias.begin("seroa-cred", false);
      preferencias.clear();
      preferencias.end();
      ESP.restart();
    }
  }
}

void loop() {
  if (wifi_ssid == "") return; 

  float presionBar = leerPresionBar();
  long irValue = particleSensor.getIR();

  if (irValue < 20000) {
    desactivarValvula();
    if (millis() - tiempoFirebase > intervaloFirebase) {
      tiempoFirebase = millis();
      enviarFirebase(0, 0, "SIN_DEDO", presionBar);
    }
    Serial.println("Sin dedo detectado.");
    delay(500);
    return;
  }

  if (!bufferLleno) {
    Serial.print("Calibrando");
    for (byte i = 0; i < bufferLength; i++) {
      while (particleSensor.available() == false) {
        particleSensor.check();
        delay(1);
      }
      redBuffer[i] = particleSensor.getRed();
      irBuffer[i] = particleSensor.getIR();
      particleSensor.nextSample();
      if (i % 10 == 0) Serial.print(".");
    }
    Serial.println(" listo.");
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
    irBuffer, bufferLength, redBuffer, &spo2, &validSPO2, &heartRate, &validHeartRate
  );

  if (millis() - tiempoAnterior > 1000) {
    tiempoAnterior = millis();
    int bpmFinal = heartRate;

    if (validHeartRate == 1 && bpmFinal > 130 && bpmFinal < 250) {
      bpmFinal = bpmFinal / 2;
    }

    if (validHeartRate == 1 && validSPO2 == 1 && spo2 >= 85 && bpmFinal > 40 && bpmFinal < 130) {
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

        if (promedioSpO2 < LIMITE_SPO2_BAJO) {
          activarValvula();
        } else {
          desactivarValvula();
        }

        enviarFirebase(promedioSpO2, bpmAjustado, "ACTIVO", presionBar);

        Serial.println("============== SEROA ==============");
        Serial.print("SpO2: "); Serial.print(promedioSpO2); Serial.println("%");
        Serial.print("BPM: ");  Serial.println(bpmAjustado);
        Serial.print("Presion: "); Serial.print(presionBar); Serial.println(" bar");
        Serial.print("Valvula: "); Serial.println(valvulaActiva ? "ACTIVA" : "INACTIVA");
        Serial.println("===================================");
      } else {
        enviarFirebase(0, 0, "CALIBRANDO", presionBar);
        Serial.println("Llenando filtro...");
      }
    } else {
      desactivarValvula();
      enviarFirebase(0, 0, "CALIBRANDO", presionBar);
      Serial.println("Lectura inestable, calibrando...");
    }
  }
}
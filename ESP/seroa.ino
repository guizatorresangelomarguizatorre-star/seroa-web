#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ================= WIFI / FIREBASE =================
#define WIFI_SSID "TU_WIFI"
#define WIFI_PASSWORD "TU_PASSWORD"

#define API_KEY "AIzaSyD8GcNrjousLrlNSKXcNrjl0gjAYuXvTMQ"
#define DATABASE_URL "https://seroa-e8606-default-rtdb.firebaseio.com"

// ================= PINES =================
#define PIN_RELAY 25
#define PIN_PRESION 34

// Muchos relays de 1 canal son activos en LOW.
// Si tu relay se prende al revés, cambia true por false.
#define RELAY_ACTIVE_LOW true

// ================= OBJETOS =================
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

MAX30105 particleSensor;

// ================= MAX30102 =================
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

// ================= TIEMPOS =================
unsigned long tiempoAnterior = 0;
unsigned long tiempoFirebase = 0;
unsigned long intervaloFirebase = 1000;

// ================= CONTROL =================
int LIMITE_SPO2_BAJO = 90;
bool valvulaActiva = false;

// ================= FUNCIONES =================
void activarValvula() {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(PIN_RELAY, LOW);
  } else {
    digitalWrite(PIN_RELAY, HIGH);
  }
  valvulaActiva = true;
}

void desactivarValvula() {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(PIN_RELAY, HIGH);
  } else {
    digitalWrite(PIN_RELAY, LOW);
  }
  valvulaActiva = false;
}

float leerPresionBar() {
  int lecturaADC = analogRead(PIN_PRESION);

  float voltajeADC = (lecturaADC / 4095.0) * 3.3;

  // Si usaste divisor: 10k arriba y 20k abajo,
  // el voltaje real del sensor es aproximadamente voltajeADC * 1.5
  float voltajeSensor = voltajeADC * 1.5;

  // Sensor típico: 0.5V = 0 bar, 4.5V = 12 bar
  float presion = ((voltajeSensor - 0.5) * 12.0) / 4.0;

  if (presion < 0) presion = 0;
  if (presion > 12) presion = 12;

  return presion;
}

void enviarFirebase(int spo2Final, int bpmFinal, String estado, float presionBar) {
  Firebase.RTDB.setInt(&fbdo, "Seroa/Actual/spo2", spo2Final);
  Firebase.RTDB.setInt(&fbdo, "Seroa/Actual/bpm", bpmFinal);
  Firebase.RTDB.setString(&fbdo, "Seroa/Actual/estado", estado);
  Firebase.RTDB.setFloat(&fbdo, "Seroa/Actual/presionBar", presionBar);
  Firebase.RTDB.setBool(&fbdo, "Seroa/Actual/valvulaActiva", valvulaActiva);
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(PIN_RELAY, OUTPUT);
  desactivarValvula();

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Serial.println("Iniciando SEROA...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }

  Serial.println("\nWiFi conectado.");

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase conectado.");
  } else {
    Serial.printf("Error Firebase: %s\n", config.signer.signupError.message.c_str());
  }

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  Wire.begin(21, 22);

  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("ERROR: MAX30102 no detectado.");
    while (1);
  }

  particleSensor.setup(50, 4, 2, 100, 411, 4096);

  Firebase.RTDB.setString(&fbdo, "Seroa/Actual/estado", "SIN_DEDO");

  Serial.println("SEROA listo. Coloca tu dedo.");
}

void loop() {
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
        Serial.print("SpO2: ");
        Serial.print(promedioSpO2);
        Serial.println("%");

        Serial.print("BPM: ");
        Serial.println(bpmAjustado);

        Serial.print("Presion: ");
        Serial.print(presionBar);
        Serial.println(" bar");

        Serial.print("Valvula: ");
        Serial.println(valvulaActiva ? "ACTIVA" : "INACTIVA");
        Serial.println("===================================");
      } else {
        Firebase.RTDB.setString(&fbdo, "Seroa/Actual/estado", "CALIBRANDO");
        Serial.println("Llenando filtro...");
      }
    } else {
      desactivarValvula();
      Firebase.RTDB.setString(&fbdo, "Seroa/Actual/estado", "CALIBRANDO");
      Serial.println("Lectura inestable, calibrando...");
    }
  }
}
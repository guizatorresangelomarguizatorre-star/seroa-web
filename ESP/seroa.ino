// SEROA v2.2 — Firebase eliminado, cliente HTTPS único compartido
#include <WiFi.h>
#include <Wire.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ─── CONFIG ──────────────────────────────────────────────────────────────────
#define RAILWAY_BASE    "https://seroa-web-production.up.railway.app"
#define SDA_PIN         21
#define SCL_PIN         22
#define PIN_RELAY       26
#define PIN_PRESION     34
#define RELAY_ACTIVE_LOW true
#define OLED_ADDR       0x3C
#define BLE_SVC_UUID    "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define BLE_CHR_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ─── OBJETOS ─────────────────────────────────────────────────────────────────
Adafruit_SSD1306  display(128, 64, &Wire, -1);
MAX30105          particleSensor;
Preferences       prefs;
WiFiClientSecure  sec;   // único cliente HTTPS compartido

// ─── CREDENCIALES ────────────────────────────────────────────────────────────
String wifi_ssid, wifi_pass, id_paciente;

// ─── FLAGS ───────────────────────────────────────────────────────────────────
bool sensorOK      = false;
bool oledOK        = false;
bool valvulaActiva = false;
bool bufferLleno   = false;
bool filtroLleno   = false;
bool calibBusy     = false;
bool autoCalib     = false;

// ─── MEDICIÓN ────────────────────────────────────────────────────────────────
int   LIMITE_SPO2  = 88;
float presion      = 0.0f;
float baseline     = 0.0f;
int   spo2Out      = 0;
int   bpmOut       = 0;
String estado      = "ACTIVO";

// ─── MAX30102 ────────────────────────────────────────────────────────────────
uint32_t irBuf[100], redBuf[100];
int32_t  spo2Raw, bpmRaw;
int8_t   vSpo2, vBpm;
const int NF = 5;
int      fSpo2[NF], fBpm[NF];
int      fIdx = 0;

// ─── TIMERS ──────────────────────────────────────────────────────────────────
unsigned long tPrev = 0, tCalib = 0, tTanque = 0;
const unsigned long T_SAMPLE = 1000;
const unsigned long T_CALIB  = 4000;
const unsigned long T_TANQUE = 30000;

// ─── OLED ─────────────────────────────────────────────────────────────────────
void oledMsg(const char* a, const char* b, const char* c = "") {
  if (!oledOK) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);  display.println(F("SEROA"));
  display.drawLine(0, 12, 128, 12, SSD1306_WHITE);
  display.setCursor(0, 22); display.println(a);
  display.setCursor(0, 34); display.println(b);
  display.setCursor(0, 46); display.println(c);
  display.display();
}

void oledData() {
  if (!oledOK) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(F("SEROA ")); display.println(estado.c_str());
  display.drawLine(0, 12, 128, 12, SSD1306_WHITE);
  display.setCursor(0, 18); display.print(F("SpO2: "));
  if (spo2Out > 0) { display.print(spo2Out); display.println(F("%")); }
  else               display.println(F("--"));
  display.setCursor(0, 30); display.print(F("BPM : "));
  if (bpmOut > 0)  display.println(bpmOut);
  else             display.println(F("--"));
  display.setCursor(0, 42); display.print(F("Pres: "));
  display.print(presion, 1); display.println(F(" bar"));
  display.setCursor(0, 54); display.print(F("Valv: "));
  display.println(valvulaActiva ? F("ON") : F("OFF"));
  display.display();
}

// ─── RELAY ───────────────────────────────────────────────────────────────────
void setValvula(bool on) {
  valvulaActiva = on;
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? !on : on);
}

// ─── PRESIÓN ─────────────────────────────────────────────────────────────────
float leerPresion() {
  float v = (analogRead(PIN_PRESION) / 4095.0f) * 3.3f * 1.5f;
  return constrain(((v - 0.5f) * 12.0f) / 4.0f, 0.0f, 12.0f);
}

float pctTanque() {
  float ref = (baseline > 0.1f) ? baseline : 12.0f;
  return constrain((presion / ref) * 100.0f, 0.0f, 100.0f);
}

const char* estadoTanque() {
  if (presion <= 0.3f) return "SIN_PRESION";
  if (presion <  2.0f) return "TANQUE_BAJO";
  return "TANQUE_OK";
}

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────
int httpPost(const String& path, const String& body) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  HTTPClient h;
  h.begin(sec, String(RAILWAY_BASE) + path);
  h.addHeader(F("Content-Type"), F("application/json"));
  int code = h.POST(body);
  h.end();
  return code;
}

String httpGet(const String& path) {
  if (WiFi.status() != WL_CONNECTED) return "";
  HTTPClient h;
  h.begin(sec, String(RAILWAY_BASE) + path);
  int code = h.GET();
  String r = (code == 200) ? h.getString() : "";
  h.end();
  return r;
}

// Extrae un entero o bool de un campo JSON: "clave": valor
int jsonField(const String& j, const char* key) {
  int i = j.indexOf(key);
  if (i < 0) return -1;
  i = j.indexOf(':', i) + 1;
  while (i < (int)j.length() && (j[i] == ' ' || j[i] == '\t')) i++;
  if (j.substring(i, i + 4) == F("true"))  return 1;
  if (j.substring(i, i + 5) == F("false")) return 0;
  int end = i;
  while (end < (int)j.length() && (isdigit(j[end]) || j[end] == '-')) end++;
  return (end > i) ? j.substring(i, end).toInt() : -1;
}

// ─── SINCRONIZAR CONFIG (límite SpO2 + flag de calibración desde Railway) ───
// NOTA: El backend debe retornar "calibracion_pendiente" en GET /api/pacientes/:id/config
// y ponerlo a false cuando recibe POST /api/tanques/calibrar exitoso.
bool sincronizarConfig() {
  if (id_paciente.isEmpty()) return false;
  String body = httpGet("/api/pacientes/" + id_paciente + "/config");
  if (body.isEmpty()) return false;

  int lim = jsonField(body, "rango_spo2_min");
  if (lim >= 70 && lim <= 100) {
    LIMITE_SPO2 = lim;
    Serial.printf("[CFG] LimiteSpo2=%d%%\n", LIMITE_SPO2);
  }
  return jsonField(body, "calibracion_pendiente") == 1;
}

// ─── CALIBRAR TANQUE ─────────────────────────────────────────────────────────
void calibrar() {
  if (calibBusy) return;
  calibBusy = true;
  oledMsg("Calibrando", "tanque O2...", "Espere 5s");
  Serial.println(F("[CALIB] Iniciando..."));

  float suma = 0.0f; int n = 0;
  for (unsigned long t0 = millis(); millis() - t0 < 5000; ) {
    float p = leerPresion();
    if (p > 0.1f) { suma += p; n++; }
    delay(100);
  }
  calibBusy = false;

  if (n < 5 || (suma / n) < 0.5f) {
    Serial.println(F("[CALIB] Error: sin presion suficiente"));
    oledMsg("Calib ERROR", "Sin presion", "Revisa tanque");
    httpPost("/api/tanques/calibrar",
             "{\"id_paciente\":" + id_paciente + ",\"error\":true}");
    return;
  }

  baseline = suma / n;
  prefs.begin("seroa-cred", false);
  prefs.putFloat("psiBaseline", baseline);
  prefs.end();

  Serial.printf("[CALIB] Baseline: %.3f bar\n", baseline);
  String bStr = String(baseline, 1) + " bar";
  oledMsg("Calibrado OK", bStr.c_str(), "= 100%");

  httpPost("/api/tanques/calibrar",
           "{\"id_paciente\":" + id_paciente +
           ",\"max_psi_baseline\":" + String(baseline, 4) + "}");
}

// ─── BLUETOOTH ───────────────────────────────────────────────────────────────
class SrvCB : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    Serial.println(F("[BLE] App conectada"));
    oledMsg("Bluetooth", "App conectada", "Envia WiFi");
  }
  void onDisconnect(BLEServer*) override {
    Serial.println(F("[BLE] Desconectado"));
    BLEDevice::startAdvertising();
  }
};

class ChrCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String payload = "";
    uint8_t* d = c->getData();
    size_t   n = c->getLength();
    for (size_t i = 0; i < n; i++) payload += (char)d[i];

    int p1 = payload.indexOf('|');
    int p2 = (p1 >= 0) ? payload.indexOf('|', p1 + 1) : -1;

    if (p1 > 0 && p2 > p1 && p2 < (int)payload.length() - 1) {
      String s  = payload.substring(0, p1);     s.trim();
      String ps = payload.substring(p1+1, p2);  ps.trim();
      String id = payload.substring(p2+1);      id.trim();

      if (s.length() && ps.length() && id.length()) {
        prefs.begin("seroa-cred", false);
        prefs.putString("ssid",     s);
        prefs.putString("pass",     ps);
        prefs.putString("paciente", id);
        prefs.end();
        Serial.println(F("[BLE] Credenciales guardadas. Reiniciando..."));
        oledMsg("Credenciales", "Guardadas OK", "Reiniciando...");
        delay(2000);
        ESP.restart();
      } else {
        oledMsg("Error BLE", "Campo vacio", "Reintenta");
      }
    } else {
      oledMsg("Error BLE", "SSID|PASS|ID", "Formato inv.");
    }
  }
};

void setupBLE() {
  BLEDevice::init("SEROA_ESP32");
  BLEServer* srv = BLEDevice::createServer();
  srv->setCallbacks(new SrvCB());
  BLEService* svc = srv->createService(BLE_SVC_UUID);
  BLECharacteristic* chr = svc->createCharacteristic(
    BLE_CHR_UUID,
    BLECharacteristic::PROPERTY_READ  |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_WRITE_NR
  );
  chr->setCallbacks(new ChrCB());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(BLE_SVC_UUID);
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);
  adv->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  oledMsg("Modo Bluetooth", "SEROA_ESP32", "Abre la app");
}

// ─── SETUP ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println(F("[INIT] SEROA v2.2"));

  pinMode(PIN_RELAY, OUTPUT);
  setValvula(false);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_PRESION, ADC_11db);
  Wire.begin(SDA_PIN, SCL_PIN);

  oledOK = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!oledOK) Serial.println(F("[OLED] No detectada"));
  else         oledMsg("Iniciando", "SEROA...", "");

  prefs.begin("seroa-cred", true);
  wifi_ssid = prefs.getString("ssid",        "");
  wifi_pass = prefs.getString("pass",        "");
  id_paciente = prefs.getString("paciente",  "");
  baseline  = prefs.getFloat("psiBaseline", 0.0f);
  prefs.end();

  Serial.printf("[NVS] SSID=%s  ID=%s  Baseline=%.3f\n",
                wifi_ssid.isEmpty() ? "(vacio)" : wifi_ssid.c_str(),
                id_paciente.isEmpty() ? "(vacio)" : id_paciente.c_str(),
                baseline);

  if (baseline < 0.1f) autoCalib = true;

  if (wifi_ssid.isEmpty() || id_paciente.isEmpty()) {
    Serial.println(F("[INIT] Sin credenciales. Modo BLE"));
    setupBLE();
    for (;;) delay(100);
  }

  BLEDevice::deinit(true);

  oledMsg("Conectando", "WiFi...", wifi_ssid.c_str());
  WiFi.begin(wifi_ssid.c_str(), wifi_pass.c_str());
  int att = 0;
  while (WiFi.status() != WL_CONNECTED && att++ < 40) {
    delay(500); Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    prefs.begin("seroa-cred", false); prefs.clear(); prefs.end();
    oledMsg("Error WiFi", "Reiniciando", "Config BLE");
    delay(2000);
    ESP.restart();
  }
  Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());

  sec.setInsecure();
  oledMsg("WiFi OK", "Sincronizando", "config...");
  sincronizarConfig();

  presion = leerPresion();
  Serial.printf("[SENSOR] Presion inicial: %.3f bar\n", presion);

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println(F("[MAX30102] No detectado"));
    sensorOK = false;
    estado = F("SIN_SENSOR");
    oledMsg("MAX30102", "No detectado", "Revisar cables");
  } else {
    particleSensor.setup(25, 4, 2, 100, 411, 4096);
    particleSensor.setPulseAmplitudeRed(0x1F);
    particleSensor.setPulseAmplitudeIR(0x1F);
    particleSensor.wakeUp();
    particleSensor.clearFIFO();
    sensorOK = true;
    estado = F("SIN_DEDO");
    oledMsg("Sistema listo", "Coloque dedo", "en sensor");
    Serial.println(F("[MAX30102] OK"));
  }
  Serial.println(F("[INIT] En linea"));
}

// ─── LOOP ────────────────────────────────────────────────────────────────────
void loop() {
  presion = leerPresion();

  // Auto-calibración en primer arranque (sin baseline guardado)
  if (autoCalib && !calibBusy && WiFi.status() == WL_CONNECTED) {
    if (presion > 0.5f) {
      autoCalib = false;
      oledMsg("Auto-calib", "No mover tanque", "5s...");
      calibrar();
    }
  }

  // Polling de config + flag de calibración manual (cada T_CALIB ms)
  if (!calibBusy && !autoCalib && millis() - tCalib > T_CALIB) {
    tCalib = millis();
    if (sincronizarConfig()) {
      Serial.println(F("[CALIB] Solicitada desde backend"));
      calibrar();
    }
  }

  // Estado del tanque a Railway cada T_TANQUE ms
  if (!calibBusy && millis() - tTanque > T_TANQUE) {
    tTanque = millis();
    float pct  = pctTanque();
    int   mins = (pct > 0) ? (int)(pct / 100.0f * 340.0f) : 0;
    httpPost("/api/tanques",
             "{\"id_paciente\":" + id_paciente +
             ",\"presion_actual\":" + String(presion, 3) +
             ",\"porcentaje\":"     + (int)pct +
             ",\"tiempo_restante_minutos\":" + mins + "}");
  }

  // Sin sensor: válvula siempre OFF
  if (!sensorOK) {
    setValvula(false);
    estado = F("SIN_SENSOR");
    oledData();
    delay(T_SAMPLE);
    return;
  }

  long ir = particleSensor.getIR();

  // Sin dedo
  if (ir < 20000) {
    setValvula(false);
    bufferLleno = false; filtroLleno = false; fIdx = 0;
    if (millis() - tPrev > T_SAMPLE) {
      tPrev = millis();
      estado = F("SIN_DEDO"); spo2Out = 0; bpmOut = 0;
      oledData();
      Serial.printf("[SENSOR] SIN_DEDO IR=%ld P=%.2f\n", ir, presion);
    }
    delay(500);
    return;
  }

  // Llenar / desplazar buffer de 100 muestras
  estado = F("CALIBRANDO");
  setValvula(false);

  if (!bufferLleno) {
    for (byte i = 0; i < 100; i++) {
      while (!particleSensor.available()) { particleSensor.check(); delay(1); }
      redBuf[i] = particleSensor.getRed();
      irBuf[i]  = particleSensor.getIR();
      particleSensor.nextSample();
    }
    bufferLleno = true;
  } else {
    for (byte i = 25; i < 100; i++) { redBuf[i-25] = redBuf[i]; irBuf[i-25] = irBuf[i]; }
    for (byte i = 75; i < 100; i++) {
      while (!particleSensor.available()) { particleSensor.check(); delay(1); }
      redBuf[i] = particleSensor.getRed();
      irBuf[i]  = particleSensor.getIR();
      particleSensor.nextSample();
    }
  }

  maxim_heart_rate_and_oxygen_saturation(irBuf, 100, redBuf, &spo2Raw, &vSpo2, &bpmRaw, &vBpm);

  if (millis() - tPrev > T_SAMPLE) {
    tPrev = millis();

    int bpmCorr = bpmRaw;
    if (vBpm == 1 && bpmCorr > 130 && bpmCorr < 250) bpmCorr /= 2;

    Serial.printf("[RAW] IR=%ld SpO2=%d(v=%d) BPM=%d(v=%d) P=%.3f\n",
                  ir, spo2Raw, vSpo2, bpmCorr, vBpm, presion);

    if (vBpm == 1 && vSpo2 == 1 &&
        spo2Raw >= 85 && spo2Raw <= 100 &&
        bpmCorr > 40  && bpmCorr < 130) {

      fSpo2[fIdx] = spo2Raw;
      fBpm[fIdx]  = bpmCorr;
      if (++fIdx >= NF) { fIdx = 0; filtroLleno = true; }

      if (filtroLleno) {
        int sS = 0, sB = 0;
        for (int i = 0; i < NF; i++) { sS += fSpo2[i]; sB += fBpm[i]; }
        spo2Out = sS / NF;
        bpmOut  = max(40, sB / NF - 15);
        estado  = F("ACTIVO");

        setValvula(spo2Out < LIMITE_SPO2);

        httpPost("/api/registros",
                 "{\"id_paciente\":" + id_paciente +
                 ",\"saturacion_oxigeno\":" + spo2Out +
                 ",\"ritmo_cardiaco\":"     + bpmOut + "}");

        oledData();
        Serial.printf("[DATA] SpO2=%d BPM=%d P=%.2f Valv=%s\n",
                      spo2Out, bpmOut, presion, valvulaActiva ? "ON" : "OFF");
      } else {
        oledData();
        Serial.printf("[CALIB] Llenando filtro %d/%d\n", fIdx, NF);
      }
    } else {
      filtroLleno = false; fIdx = 0;
      estado = F("CALIBRANDO");
      oledData();
      Serial.printf("[CALIB] Lectura descartada SpO2=%d BPM=%d\n", spo2Raw, bpmCorr);
    }
  }
}

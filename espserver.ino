#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_MCP4725.h>
#include <Adafruit_INA219.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ==================== CONFIGURATION ====================
#define CLK 32
#define DT 33
#define SW 25

#define MIN_DAC 1024
#define MAX_DAC 4000

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_SDA 17
#define OLED_SCL 16
TwoWire WireOLED(1);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &WireOLED, -1);

Adafruit_MCP4725 dac;
Adafruit_INA219 ina219;

// WiFi & Server
const char* ssid = "SSID";
const char* password = "password";
const char* serverIP = "Your server IP"; // Your server IP
const int serverPort = 3000;

// ==================== GLOBAL STATE ====================
int encoderValue = 2048;
int lastEncoded = 0;
bool lastSW = HIGH;

float busVoltage = 0.0, current_mA = 0.0;
unsigned long lastINA219Time = 0;
const unsigned long INA219_INTERVAL = 1000;

unsigned long lastNetUpdate = 0;
const unsigned long NET_INTERVAL = 2000;
int lastServerDACValue = -1;

// ==================== WIFI & SERVER ====================
void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println(" connected!");
}

void postVoltageAndCurrent(float voltage, float current) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = "http://" + String(serverIP) + ":" + String(serverPort) + "/update";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    String json = "{\"voltage\":" + String(voltage, 2) + ",\"current\":" + String(current, 1) + "}";
    int code = http.POST(json);
    if (code > 0) {
      Serial.println("POST /update OK");
    } else {
      Serial.println("POST /update failed");
    }
    http.end();
  }
}

int fetchDACValueFromServer() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = "http://" + String(serverIP) + ":" + String(serverPort) + "/getVoltage";
    http.begin(url);
    int code = http.GET();
    if (code == 200) {
      String payload = http.getString();
      int voltage = payload.substring(payload.indexOf(":") + 1, payload.indexOf("}")).toInt();
      http.end();
      return voltage;
    }
    http.end();
  }
  return -1;
}

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);

  Wire.begin(21, 22);         // DAC & INA219
  WireOLED.begin(OLED_SDA, OLED_SCL); // OLED

  connectWiFi();

  // OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED not found"); while (1);
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0); display.println("OLED Ready");
  display.display();

  // Inputs
  pinMode(CLK, INPUT);
  pinMode(DT, INPUT);
  pinMode(SW, INPUT_PULLUP);
  lastEncoded = (digitalRead(CLK) << 1) | digitalRead(DT);

  // DAC
  if (!dac.begin(0x60)) {
    Serial.println("DAC not found"); while (1);
  }

  // INA219
  if (!ina219.begin()) {
    Serial.println("INA219 not found"); while (1);
  }

  Serial.println("System Ready");
}

// ==================== MAIN LOOP ====================
void loop() {
  // Rotary Encoder
  int MSB = digitalRead(CLK);
  int LSB = digitalRead(DT);
  int encoded = (MSB << 1) | LSB;
  int sum = (lastEncoded << 2) | encoded;
  if (sum == 0b1101 || sum == 0b0100 || sum == 0b0010 || sum == 0b1011) encoderValue = encoderValue - 20;
  if (sum == 0b1110 || sum == 0b0111 || sum == 0b0001 || sum == 0b1000) encoderValue = encoderValue + 20;
  encoderValue = constrain(encoderValue, MIN_DAC, MAX_DAC);
  lastEncoded = encoded;

  // Button Press
  bool currentSW = digitalRead(SW);
  if (lastSW == HIGH && currentSW == LOW) {
    dac.setVoltage(encoderValue, false);
    Serial.print("DAC set manually: "); Serial.println(encoderValue);
    delay(200);
  }
  lastSW = currentSW;

  // INA219 Sampling
  unsigned long now = millis();
  if (now - lastINA219Time > INA219_INTERVAL) {
    lastINA219Time = now;
    busVoltage = ina219.getBusVoltage_V();
    current_mA = ina219.getCurrent_mA();
    Serial.printf("INA219: %.2f V, %.1f mA\n", busVoltage, current_mA);
  }

  // Network Communication
  if (now - lastNetUpdate > NET_INTERVAL) {
    lastNetUpdate = now;

    postVoltageAndCurrent(busVoltage, current_mA);

    int ref_mV = fetchDACValueFromServer();
if (ref_mV >= 1000 && ref_mV <= 5000) {
  int ref_dac = map(ref_mV, 0, 5000, 0, 4095);
  ref_dac = constrain(ref_dac, MIN_DAC, MAX_DAC);

  // Only update DAC if the value from the server has changed
  if (ref_dac != lastServerDACValue) {
    lastServerDACValue = ref_dac;
    encoderValue = ref_dac;
    dac.setVoltage(ref_dac, false);
    Serial.print("DAC updated from server: ");
    Serial.println(ref_dac);
  }
}
    

  // OLED Display
  display.clearDisplay();

  display.setCursor(0, 0);
  display.setTextSize(2);
  display.print(busVoltage, 2);
  display.println(" V");

  display.setCursor(0, 30);
  display.print(current_mA, 0);
  display.println(" mA");

  display.drawLine(0, 63, 127, 63, SSD1306_WHITE);
  int markerX = map(encoderValue, MIN_DAC, MAX_DAC, 127, 0);
  display.drawLine(markerX, 60, markerX, 63, SSD1306_WHITE);

  display.display();
}}

#define BLYNK_TEMPLATE_ID "TMPL6pvQCSYRl"
#define BLYNK_TEMPLATE_NAME "smart socket"
#define BLYNK_AUTH_TOKEN "OAaz-OBH4PutRhS53Q7ofc93Ie5s1CIM"

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include <EEPROM.h>
#include <BlynkSimpleEsp8266.h>
#include <PubSubClient.h>  // MQTT Client library
#include <ArduinoJson.h>   // For JSON parsing
#include <WiFiClientSecure.h> // For secure TLS connections
#include <time.h>          // For time functions

// Pin definitions
const int RELAY_PIN = 5;   // D1 on NodeMCU is GPIO5
const int LED_PIN = 2;     // D4 on NodeMCU is GPIO2

// Access Point settings
const char* AP_SSID = "SmartPlug_AP";
const char* AP_PASSWORD = "12345678";

// Static IP Configuration
IPAddress staticIP(192, 168, 1, 200);
IPAddress gateway(192, 168, 1, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress dns(8, 8, 8, 8);

// DNS Server
const byte DNS_PORT = 53;
DNSServer dnsServer;

// Web Server
ESP8266WebServer server(80);

// Variables
bool relayState = false;
bool apMode = false;
String savedSSID = "";
String savedPassword = "";

// Device Information
String deviceId = "smartsocket_" + String(ESP.getChipId(), HEX);

// Timer variables
unsigned long timerDuration = 0;  // Timer duration in milliseconds
unsigned long timerStartTime = 0; // When the timer started
bool timerActive = false;         // Is timer currently running?
bool timerTurnOn = false;         // Should timer turn relay ON (true) or OFF (false)

// Schedule variables
struct Schedule {
  int hour;
  int minute;
  bool action; // true = ON, false = OFF
  bool enabled;
};

const int MAX_SCHEDULES = 10;
Schedule schedules[MAX_SCHEDULES];
int scheduleCount = 0;

// EEPROM addresses
const int EEPROM_SSID_ADDR = 0;
const int EEPROM_PASS_ADDR = 40;
const int EEPROM_SSID_LEN_ADDR = 80;
const int EEPROM_PASS_LEN_ADDR = 81;
const int EEPROM_SCHEDULE_COUNT_ADDR = 82;
const int EEPROM_SCHEDULES_ADDR = 83;

// MQTT Configuration
#define MQTT_RECONNECT_INTERVAL 5000
const char* mqtt_server = "49d2b5be8a524a3ca738210f545504aa.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_username = "sarthak";
const char* mqtt_password = "Socket@071424";
const char* mqtt_topic_base = "smartplug/";
unsigned long lastMqttReconnectAttempt = 0;

// Root CA Certificate for HiveMQ Cloud
const char* root_ca = \
"-----BEGIN CERTIFICATE-----\n" \
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n" \
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n" \
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n" \
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n" \
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n" \
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n" \
"h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n" \
"0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U\n" \
"A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW\n" \
"T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH\n" \
"B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC\n" \
"B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv\n" \
"KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn\n" \
"OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn\n" \
"jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw\n" \
"qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI\n" \
"rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV\n" \
"HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq\n" \
"hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL\n" \
"ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ\n" \
"3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK\n" \
"NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5\n" \
"ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur\n" \
"TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC\n" \
"jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc\n" \
"oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq\n" \
"4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA\n" \
"mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d\n" \
"emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=\n" \
"-----END CERTIFICATE-----";

// MQTT and Blynk timers
BlynkTimer blynkTimer;
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

// X509 certificate for TLS
BearSSL::X509List cert(root_ca);

void setup() {
  Serial.begin(115200);

  // Initialize EEPROM
  EEPROM.begin(512);

  // Initialize pins
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  // Ensure relay and LED start in OFF state
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  // Load WiFi credentials from EEPROM
  loadWiFiCredentials();

  // Load schedules from EEPROM
  loadSchedules();

  // Try to connect to saved WiFi
  if (connectToSavedWiFi()) {
    // Connected to WiFi, start Blynk and MQTT
    Serial.println("\nConnected to WiFi");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());

    // Set up MQTT client
    setupMQTT();

    // Set up Blynk
    Blynk.begin(BLYNK_AUTH_TOKEN, savedSSID.c_str(), savedPassword.c_str());

    // Update LED and relay state on Blynk server
    Blynk.virtualWrite(V1, relayState);

    // Set up timer check every second
    blynkTimer.setInterval(1000L, checkTimer);

    // Set up schedule check every minute
    blynkTimer.setInterval(60000L, checkSchedules);

    // Publish status every minute
    blynkTimer.setInterval(60000L, publishStatus);

    // Set up web server routes for normal mode
    setupNormalRoutes();
    server.begin();
  } else {
    // Failed to connect, start AP mode
    startAPMode();
  }

  Serial.println("Smart Plug Ready!");
}

void loop() {
  if (apMode) {
    dnsServer.processNextRequest();
  } else {
    // Handle MQTT connection
    if (!mqttClient.connected()) {
      long now = millis();
      if (now - lastMqttReconnectAttempt > MQTT_RECONNECT_INTERVAL) {
        lastMqttReconnectAttempt = now;
        if (reconnectMQTT()) {
          lastMqttReconnectAttempt = 0;
        }
      }
    } else {
      mqttClient.loop();
    }

    Blynk.run();
    blynkTimer.run();
  }

  server.handleClient();
  yield();
}

void setupMQTT() {
  // Set up secure connection with the certificate for ESP8266
  espClient.setTrustAnchors(&cert);

  // Set time via NTP, as required for x.509 validation
  // Set timezone to Nepal Time (NPT): UTC+5:45
  configTime(5 * 3600 + 45 * 60, 0, "pool.ntp.org", "time.nist.gov");

  Serial.print("Waiting for NTP time sync: ");
  time_t now = time(nullptr);
  while (now < 8 * 3600 * 2) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.println();

  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  Serial.print("Current time (NPT): ");
  Serial.print(asctime(&timeinfo));

  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);

  // Try initial connection
  reconnectMQTT();
}

boolean reconnectMQTT() {
  if (mqttClient.connect(deviceId.c_str(), mqtt_username, mqtt_password)) {
    Serial.println("Connected to MQTT broker");

    // Subscribe to control topic for this device
    String controlTopic = String(mqtt_topic_base) + "control/" + deviceId;
    mqttClient.subscribe(controlTopic.c_str());

    // Subscribe to general control topic
    String generalControlTopic = String(mqtt_topic_base) + "control";
    mqttClient.subscribe(generalControlTopic.c_str());

    // Publish status immediately after connecting
    publishStatus();

    return true;
  }

  Serial.println("Failed to connect to MQTT broker");
  return false;
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived on topic: ");
  Serial.println(topic);

  // Convert payload to String
  char message[length + 1];
  for (unsigned int i = 0; i < length; i++) {
    message[i] = (char)payload[i];
  }
  message[length] = '\0';

  Serial.print("Message: ");
  Serial.println(message);

  // Parse the JSON message
  DynamicJsonDocument doc(512);
  deserializeJson(doc, message);

  // Get the command from the message
  String command = doc["command"];

  if (command == "getStatus") {
    // Respond with current status
    publishStatus();
  }
  else if (command == "power") {
    // Toggle or set power state
    if (doc.containsKey("state")) {
      bool newState = doc["state"];
      setRelayState(newState);
    } else {
      toggleRelay();
    }
  }
  else if (command == "timer") {
    bool enabled = doc["enabled"];
    if (enabled) {
      int hour = doc["hour"];
      int minute = doc["minute"];
      bool action = doc["action"];

      // Calculate duration in milliseconds (time until target time)
      time_t now;
      time(&now);
      struct tm *timeinfo = localtime(&now);

      int currentHour = timeinfo->tm_hour;
      int currentMinute = timeinfo->tm_min;

      int currentTotalMinutes = currentHour * 60 + currentMinute;
      int targetTotalMinutes = hour * 60 + minute;

      // If target time is earlier today, assume it's for tomorrow
      if (targetTotalMinutes <= currentTotalMinutes) {
        targetTotalMinutes += 24 * 60; // Add 24 hours
      }

      int minutesDifference = targetTotalMinutes - currentTotalMinutes;
      unsigned long duration = minutesDifference * 60 * 1000; // Convert to milliseconds

      startTimer(duration, action);
    } else {
      cancelTimer();
    }
  }
  else if (command == "addSchedule") {
    if (scheduleCount < MAX_SCHEDULES) {
      schedules[scheduleCount].hour = doc["hour"];
      schedules[scheduleCount].minute = doc["minute"];
      schedules[scheduleCount].action = doc["action"];
      schedules[scheduleCount].enabled = true;
      scheduleCount++;
      saveSchedules();
      publishStatus(); // Update schedules in status
    }
  }
  else if (command == "deleteSchedule") {
    int index = doc["index"];
    if (index >= 0 && index < scheduleCount) {
      // Remove the schedule by shifting everything down
      for (int i = index; i < scheduleCount - 1; i++) {
        schedules[i] = schedules[i + 1];
      }
      scheduleCount--;
      saveSchedules();
      publishStatus(); // Update schedules in status
    }
  }
}

void publishStatus() {
  if (!mqttClient.connected()) {
    return;
  }

  // Create a JSON document
  DynamicJsonDocument doc(1024);

  // Add device information
  doc["deviceId"] = deviceId;
  doc["power"] = relayState;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();

  // Add timer information
  JsonObject timer = doc.createNestedObject("timer");
  timer["enabled"] = timerActive;

  if (timerActive) {
    // Calculate remaining time and convert to target hour/minute
    unsigned long remainingMillis = timerDuration - (millis() - timerStartTime);
    unsigned long remainingMinutes = remainingMillis / 60000;

    // Get current time
    time_t now;
    time(&now);
    struct tm *timeinfo = localtime(&now);

    // Calculate target time
    int totalMinutes = timeinfo->tm_hour * 60 + timeinfo->tm_min + remainingMinutes;
    int targetHour = (totalMinutes / 60) % 24;
    int targetMinute = totalMinutes % 60;

    timer["hour"] = targetHour;
    timer["minute"] = targetMinute;
    timer["action"] = timerTurnOn;
  } else {
    timer["hour"] = 0;
    timer["minute"] = 0;
    timer["action"] = false;
  }

  // Add schedules
  JsonArray schedulesArray = doc.createNestedArray("schedules");
  for (int i = 0; i < scheduleCount; i++) {
    JsonObject schedule = schedulesArray.createNestedObject();
    schedule["id"] = i;
    schedule["hour"] = schedules[i].hour;
    schedule["minute"] = schedules[i].minute;
    schedule["action"] = schedules[i].action;
    schedule["enabled"] = schedules[i].enabled;
  }

  // Serialize the JSON document
  String statusJson;
  serializeJson(doc, statusJson);

  // Publish to the status topic
  String statusTopic = String(mqtt_topic_base) + "status/" + deviceId;
  mqttClient.publish(statusTopic.c_str(), statusJson.c_str());

  Serial.println("Published status to MQTT: " + statusJson);
}

void toggleRelay() {
  // Toggle the relay state
  relayState = !relayState;
  setRelayState(relayState);
}

void setRelayState(bool state) {
  relayState = state;

  // Update the physical relay and LED
  digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);
  digitalWrite(LED_PIN, relayState ? HIGH : LOW);

  // Update Blynk if connected
  if (Blynk.connected()) {
    Blynk.virtualWrite(V1, relayState);
  }

  // Publish new state to MQTT
  publishStatus();

  Serial.println("Relay set to: " + String(relayState ? "ON" : "OFF"));
}

void checkTimer() {
  if (timerActive) {
    unsigned long currentTime = millis();
    unsigned long elapsedTime = currentTime - timerStartTime;

    // Check if timer has expired
    if (elapsedTime >= timerDuration) {
      timerActive = false;

      // Set relay to desired state after timer
      setRelayState(timerTurnOn);

      // Update Blynk if connected
      if (Blynk.connected()) {
        Blynk.virtualWrite(V2, 0); // Reset timer duration slider
        Blynk.virtualWrite(V3, 0); // Reset timer status
      }

      // Publish new status to MQTT
      publishStatus();

      Serial.println("Timer completed! Relay set to: " + String(relayState ? "ON" : "OFF"));
    } else {
      // Update remaining time in Blynk
      if (Blynk.connected()) {
        unsigned long remainingTime = (timerDuration - elapsedTime) / 1000; // seconds
        Blynk.virtualWrite(V3, remainingTime);
      }
    }
  }
}

void checkSchedules() {
  // Get current time
  time_t now;
  time(&now);
  struct tm *timeinfo = localtime(&now);

  int currentHour = timeinfo->tm_hour;
  int currentMinute = timeinfo->tm_min;

  // Check each schedule
  for (int i = 0; i < scheduleCount; i++) {
    if (schedules[i].enabled &&
        schedules[i].hour == currentHour &&
        schedules[i].minute == currentMinute) {

      // Time matches, execute the schedule
      setRelayState(schedules[i].action);

      Serial.println("Schedule executed: " + String(i) +
                     " at " + String(currentHour) + ":" + String(currentMinute) +
                     " - Set relay to " + String(schedules[i].action ? "ON" : "OFF"));
    }
  }
}

void startTimer(unsigned long duration, bool turnOnAfter) {
  timerDuration = duration;
  timerStartTime = millis();
  timerActive = true;
  timerTurnOn = turnOnAfter;

  Serial.println("Timer started for " + String(duration / 1000) + " seconds");
  Serial.println("After timer, relay will turn " + String(turnOnAfter ? "ON" : "OFF"));

  // Update Blynk if connected
  if (Blynk.connected()) {
    Blynk.virtualWrite(V3, duration / 1000); // Show initial timer value in seconds
  }

  // Publish status to MQTT
  publishStatus();
}

void cancelTimer() {
  timerActive = false;
  Serial.println("Timer cancelled");

  // Update Blynk if connected
  if (Blynk.connected()) {
    Blynk.virtualWrite(V2, 0); // Reset timer duration slider
    Blynk.virtualWrite(V3, 0); // Reset timer status
  }

  // Publish status to MQTT
  publishStatus();
}

bool connectToSavedWiFi() {
  if (savedSSID.length() > 0) {
    Serial.println("Connecting to saved WiFi: " + savedSSID);

    WiFi.mode(WIFI_STA);

    // Configure static IP
    WiFi.config(staticIP, gateway, subnet, dns);

    WiFi.begin(savedSSID.c_str(), savedPassword.c_str());

    // Wait for connection for 10 seconds
    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startTime < 10000) {
      delay(500);
      Serial.print(".");
    }

    return WiFi.status() == WL_CONNECTED;
  }

  return false;
}

void startAPMode() {
  apMode = true;

  Serial.println("Starting Access Point Mode");
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);

  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  // Setup DNS server to redirect all domains to the AP IP
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  // Setup AP web server routes
  setupAPRoutes();

  server.begin();
}

void setupNormalRoutes() {
  server.on("/", handleRoot);
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.on("/toggle", handleToggle);
  server.on("/status", handleStatus);
  server.on("/reset", handleReset);

  // Add timer routes
  server.on("/timer", handleTimerForm);
  server.on("/settimer", HTTP_POST, handleSetTimer);
  server.on("/canceltimer", handleCancelTimer);
}

void setupAPRoutes() {
  server.on("/", handleAPRoot);
  server.on("/scan", handleWiFiScan);
  server.on("/connect", HTTP_POST, handleWiFiConnect);

  // Captive portal - catch all requests and redirect to root
  server.onNotFound([]() {
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString(), true);
    server.send(302, "text/plain", "");
  });
}

void loadWiFiCredentials() {
  int ssidLength = EEPROM.read(EEPROM_SSID_LEN_ADDR);
  int passLength = EEPROM.read(EEPROM_PASS_LEN_ADDR);

  if (ssidLength > 0 && ssidLength < 33) { // Valid SSID length
    savedSSID = "";
    for (int i = 0; i < ssidLength; i++) {
      savedSSID += char(EEPROM.read(EEPROM_SSID_ADDR + i));
    }

    savedPassword = "";
    for (int i = 0; i < passLength; i++) {
      savedPassword += char(EEPROM.read(EEPROM_PASS_ADDR + i));
    }

    Serial.println("Loaded WiFi credentials:");
    Serial.println("SSID: " + savedSSID);
    Serial.println("Password length: " + String(passLength) + " characters");
  } else {
    Serial.println("No saved WiFi credentials found");
  }
}

void saveWiFiCredentials(String ssid, String password) {
  // Clear previous data
  for (int i = 0; i < 80; i++) {
    EEPROM.write(EEPROM_SSID_ADDR + i, 0);
    EEPROM.write(EEPROM_PASS_ADDR + i, 0);
  }

  // Save SSID
  for (int i = 0; i < ssid.length(); i++) {
    EEPROM.write(EEPROM_SSID_ADDR + i, ssid[i]);
  }

  // Save password
  for (int i = 0; i < password.length(); i++) {
    EEPROM.write(EEPROM_PASS_ADDR + i, password[i]);
  }

  // Save lengths
  EEPROM.write(EEPROM_SSID_LEN_ADDR, ssid.length());
  EEPROM.write(EEPROM_PASS_LEN_ADDR, password.length());

  EEPROM.commit();

  savedSSID = ssid;
  savedPassword = password;

  Serial.println("Saved new WiFi credentials");
}

void loadSchedules() {
  scheduleCount = EEPROM.read(EEPROM_SCHEDULE_COUNT_ADDR);

  if (scheduleCount > MAX_SCHEDULES) {
    scheduleCount = 0; // Invalid count, reset
  }

  for (int i = 0; i < scheduleCount; i++) {
    int baseAddr = EEPROM_SCHEDULES_ADDR + (i * 4); // 4 bytes per schedule
    schedules[i].hour = EEPROM.read(baseAddr);
    schedules[i].minute = EEPROM.read(baseAddr + 1);
    schedules[i].action = EEPROM.read(baseAddr + 2) == 1;
    schedules[i].enabled = EEPROM.read(baseAddr + 3) == 1;
  }

  Serial.println("Loaded " + String(scheduleCount) + " schedules from EEPROM");
}

void saveSchedules() {
  // Save schedule count
  EEPROM.write(EEPROM_SCHEDULE_COUNT_ADDR, scheduleCount);

  // Save each schedule
  for (int i = 0; i < scheduleCount; i++) {
    int baseAddr = EEPROM_SCHEDULES_ADDR + (i * 4); // 4 bytes per schedule
    EEPROM.write(baseAddr, schedules[i].hour);
    EEPROM.write(baseAddr + 1, schedules[i].minute);
    EEPROM.write(baseAddr + 2, schedules[i].action ? 1 : 0);
    EEPROM.write(baseAddr + 3, schedules[i].enabled ? 1 : 0);
  }

  EEPROM.commit();

  Serial.println("Saved " + String(scheduleCount) + " schedules to EEPROM");
}

// Web server handler functions
void handleRoot() {
  String html = getHeader("ESP8266 Smart Plug");

  html += "<div class='status'>Status: " + String(relayState ? "ON" : "OFF") + "</div>";

  // Add timer status if active
  if (timerActive) {
    unsigned long remainingTime = (timerDuration - (millis() - timerStartTime)) / 1000;
    html += "<div class='timer-status'>";
    html += "Timer: " + String(remainingTime) + " seconds remaining<br>";
    html += "Will turn " + String(timerTurnOn ? "ON" : "OFF") + " after timer";
    html += "<div class='timer-cancel'><a href='/canceltimer' class='button button-small'>Cancel Timer</a></div>";
    html += "</div>";
  }

  html += "<div class='button-row'>";
  html += "<a href='/on' class='button button-on'>ON</a>";
  html += "<a href='/off' class='button button-off'>OFF</a>";
  html += "</div>";

  html += "<div class='button-row'>";
  html += "<a href='/timer' class='button button-timer'>Timer</a>";
  html += "</div>";

  html += "<div class='info'>";

  // Add current time display
  time_t now;
  time(&now);
  struct tm *timeinfo = localtime(&now);
  char timeStr[50];
  sprintf(timeStr, "%04d-%02d-%02d %02d:%02d:%02d",
          timeinfo->tm_year + 1900, timeinfo->tm_mon + 1, timeinfo->tm_mday,
          timeinfo->tm_hour, timeinfo->tm_min, timeinfo->tm_sec);
  html += "Current time (NPT): " + String(timeStr) + "<br>";

  html += "Connected to: " + savedSSID + "<br>";
  html += "IP address: " + WiFi.localIP().toString() + "<br>";
  html += "MQTT status: " + String(mqttClient.connected() ? "Connected" : "Disconnected") + "<br>";
  html += "Device ID: " + deviceId + "<br>";
  html += "</div>";

  // Show schedules if any
  if (scheduleCount > 0) {
    html += "<div class='schedules'>";
    html += "<h3>Schedules</h3>";

    for (int i = 0; i < scheduleCount; i++) {
      html += "<div class='schedule-item'>";
      html += String(schedules[i].hour < 10 ? "0" : "") + String(schedules[i].hour) + ":" +
             String(schedules[i].minute < 10 ? "0" : "") + String(schedules[i].minute);
      html += " - Turn " + String(schedules[i].action ? "ON" : "OFF");
      html += "</div>";
    }

    html += "</div>";
  }

  html += "<div class='reset-option'>";
  html += "<a href='/reset' class='button button-reset' onclick='return confirm(\"This will reset WiFi settings. Continue?\");'>Reset WiFi</a>";
  html += "</div>";

  html += getFooter();
  server.send(200, "text/html", html);
}

void handleTimerForm() {
  String html = getHeader("Set Timer");

  html += "<div class='setup-info'>";
  html += "<h3>Set Timer</h3>";
  html += "<p>Set a timer to change the relay state after a specified time.</p>";
  html += "</div>";

  html += "<div class='timer-form'>";
  html += "<form action='/settimer' method='post'>";

  html += "<div class='form-group'>";
  html += "<label>Timer Duration (minutes):</label>";
  html += "<input type='number' name='duration' min='1' max='1440' value='5'>";
  html += "</div>";

  html += "<div class='form-group'>";
  html += "<label>After timer expires:</label>";
  html += "<select name='action'>";
  html += "<option value='on'>Turn ON</option>";
  html += "<option value='off'>Turn OFF</option>";
  html += "</select>";
  html += "</div>";

  html += "<div class='form-submit'>";
  html += "<input type='submit' value='Start Timer' class='button button-timer'>";
  html += "</div>";

  html += "</form>";
  html += "</div>";

  html += "<div class='back-link'>";
  html += "<a href='/' class='button button-small'>Back</a>";
  html += "</div>";

  html += getFooter();
  server.send(200, "text/html", html);
}

void handleSetTimer() {
  if (!server.hasArg("duration") || !server.hasArg("action")) {
    server.send(400, "text/plain", "Missing timer parameters");
    return;
  }

  int minutes = server.arg("duration").toInt();
  String action = server.arg("action");

  // Validate inputs
  if (minutes < 1 || minutes > 1440) {
    minutes = 5; // Default to 5 minutes if out of range
  }

  // Convert minutes to milliseconds
  unsigned long duration = minutes * 60 * 1000;

  // Start timer
  startTimer(duration, action == "on");

  // Redirect back to main page
  server.sendHeader("Location", "/", true);
  server.send(303);
}

void handleCancelTimer() {
  cancelTimer();

  // Redirect back to main page
  server.sendHeader("Location", "/", true);
  server.send(303);
}

void handleAPRoot() {
  String html = getHeader("Smart Plug WiFi Setup");

  html += "<div class='setup-info'>";
  html += "Please connect this smart plug to your WiFi network:";
  html += "</div>";

  html += "<div class='wifi-list'>";
  html += "<a href='/scan' class='button button-wifi'>Scan for Networks</a>";
  html += "</div>";

  html += "<div class='manual-connect'>";
  html += "<h3>Or enter network details manually:</h3>";
  html += "<form action='/connect' method='post'>";
  html += "<label>SSID (Network Name):<br><input type='text' name='ssid' required></label><br>";
  html += "<label>Password:<br><input type='password' name='password'></label><br><br>";
  html += "<input type='submit' value='Connect' class='button button-small'>";
  html += "</form>";
  html += "</div>";

  html += getFooter();
  server.send(200, "text/html", html);
}

void handleWiFiScan() {
  String html = getHeader("Available WiFi Networks");

  int n = WiFi.scanNetworks();

  if (n == 0) {
    html += "<div class='setup-info'>No networks found. Try again.</div>";
  } else {
    html += "<div class='wifi-list'>";
    html += "<h3>Select a network:</h3>";

    // Sort networks by signal strength
    int indices[n];
    for (int i = 0; i < n; i++) {
      indices[i] = i;
    }

    // Bubble sort by RSSI
    for (int i = 0; i < n - 1; i++) {
      for (int j = 0; j < n - i - 1; j++) {
        if (WiFi.RSSI(indices[j]) < WiFi.RSSI(indices[j + 1])) {
          std::swap(indices[j], indices[j + 1]);
        }
      }
    }

    // Display networks
    for (int i = 0; i < n; i++) {
      int id = indices[i];
      html += "<div class='network-item' onclick='selectNetwork(\"" + WiFi.SSID(id) + "\")'>";
      html += "<div class='network-name'>" + WiFi.SSID(id) + "</div>";
      html += "<div class='network-info'>";

      // Signal strength indicator
      int rssi = WiFi.RSSI(id);
      int quality = 0;
      if (rssi <= -100) {
        quality = 0;
      } else if (rssi >= -50) {
        quality = 100;
      } else {
        quality = 2 * (rssi + 100);
      }

      html += "Signal: " + String(quality) + "% ";

      // Encryption type
      html += (WiFi.encryptionType(id) == ENC_TYPE_NONE) ? "Open" : "Secured";

      html += "</div></div>";
    }
    html += "</div>";

    // Form for the selected network
    html += "<div class='connect-form' id='connect-form' style='display:none;'>";
    html += "<form action='/connect' method='post'>";
    html += "<input type='hidden' id='ssid' name='ssid'>";
    html += "<label>Password:<br><input type='password' name='password'></label><br><br>";
    html += "<input type='submit' value='Connect' class='button button-small'>";
    html += "</form>";
    html += "</div>";

    // JavaScript for network selection
    html += "<script>";
    html += "function selectNetwork(ssid) {";
    html += "  document.getElementById('ssid').value = ssid;";
    html += "  document.getElementById('connect-form').style.display = 'block';";
    html += "  document.getElementsByClassName('wifi-list')[0].style.opacity = '0.7';";
    html += "}";
    html += "</script>";
  }

  html += "<br><a href='/' class='button button-small'>Back</a>";

  html += getFooter();
  server.send(200, "text/html", html);
}

void handleWiFiConnect() {
  if (!server.hasArg("ssid") || !server.hasArg("password")) {
    server.send(400, "text/plain", "Missing network credentials");
    return;
  }

  String ssid = server.arg("ssid");
  String password = server.arg("password");

  // Save credentials to EEPROM
  saveWiFiCredentials(ssid, password);

  String html = getHeader("Connecting to WiFi");

  html += "<div class='setup-info'>";
  html += "<h3>Connecting to " + ssid + "...</h3>";
  html += "<p>The smart plug will restart and try to connect to your network.</p>";
  html += "<p>If successful, the device will connect to Blynk and MQTT.</p>";
  html += "<p>If connection fails, it will create an access point named \"" + String(AP_SSID) + "\" again.</p>";
  html += "</div>";

  html += getFooter();

  html += "<script>setTimeout(function() { document.body.innerHTML += '<div class=\"setup-info\">Restarting...</div>'; }, 3000);</script>";

  server.send(200, "text/html", html);

  // Give time for the response to be sent
  delay(3000);

  // Restart the ESP
  ESP.restart();
}

void handleOn() {
  setRelayState(true);

  // Redirect back to main page
  server.sendHeader("Location", "/", true);
  server.send(303);
}

void handleOff() {
  setRelayState(false);

  // Redirect back to main page
  server.sendHeader("Location", "/", true);
  server.send(303);
}

void handleToggle() {
  toggleRelay();

  // Redirect back to main page
  server.sendHeader("Location", "/", true);
  server.send(303);
}

void handleStatus() {
  DynamicJsonDocument doc(512);
  doc["power"] = relayState;
  doc["timer_active"] = timerActive;

  if (timerActive) {
    unsigned long remainingTime = (timerDuration - (millis() - timerStartTime)) / 1000;
    doc["timer_remaining"] = remainingTime;
    doc["timer_action"] = timerTurnOn;
  }

  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["mqtt_connected"] = mqttClient.connected();
  doc["device_id"] = deviceId;

  JsonArray schedulesArray = doc.createNestedArray("schedules");
  for (int i = 0; i < scheduleCount; i++) {
    JsonObject schedule = schedulesArray.createNestedObject();
    schedule["hour"] = schedules[i].hour;
    schedule["minute"] = schedules[i].minute;
    schedule["action"] = schedules[i].action;
    schedule["enabled"] = schedules[i].enabled;
  }

  String statusJson;
  serializeJson(doc, statusJson);

  server.send(200, "application/json", statusJson);
}

void handleReset() {
  String html = getHeader("Resetting WiFi Settings");

  html += "<div class='setup-info'>";
  html += "<h3>Resetting WiFi settings...</h3>";
  html += "<p>The smart plug will restart and create an access point named \"" + String(AP_SSID) + "\".</p>";
  html += "</div>";

  html += getFooter();

  server.send(200, "text/html", html);

  // Clear WiFi credentials
  saveWiFiCredentials("", "");

  // Give time for the response to be sent
  delay(3000);

  // Restart the ESP
  ESP.restart();
}

String getHeader(String title) {
  String html = "<!DOCTYPE html><html><head>";
  html += "<title>" + title + "</title>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<style>";
  html += "body { font-family: Arial, sans-serif; text-align: center; margin: 0px; padding: 20px; background-color: #f4f4f4; }";
  html += "h1 { color: #333; }";
  html += ".container { max-width: 400px; margin: 0 auto; background-color: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }";
  html += ".button { display: inline-block; padding: 12px 24px; text-decoration: none; font-size: 18px; margin: 10px; cursor: pointer; border-radius: 8px; font-weight: bold; text-align: center; }";
  html += ".button-on { background-color: #4CAF50; color: white; width: 40%; }";
  html += ".button-off { background-color: #D11D53; color: white; width: 40%; }";
  html += ".button-timer { background-color: #9C27B0; color: white; width: 90%; }";
  html += ".button-small { background-color: #2196F3; color: white; padding: 8px 16px; font-size: 14px; }";
  html += ".button-wifi { background-color: #ff9800; color: white; width: 80%; }";
  html += ".button-reset { background-color: #f44336; color: white; width: 80%; font-size: 16px; }";
  html += ".status { font-size: 24px; margin: 20px 0; padding: 10px; background-color: #eee; border-radius: 5px; }";
  html += ".timer-status { font-size: 16px; margin: 10px 0 20px 0; padding: 10px; background-color: #e1bee7; border-radius: 5px; }";
  html += ".timer-cancel { margin-top: 5px; }";
  html += ".setup-info { margin: 20px 0; }";
  html += ".button-row { display: flex; justify-content: space-between; margin: 20px 0; }";
  html += ".info { margin: 20px 0; font-size: 14px; color: #666; }";
  html += ".reset-option { margin: 30px 0 10px 0; }";
  html += ".schedules { margin: 20px 0; text-align: left; background-color: #f9f9f9; padding: 10px; border-radius: 5px; }";
  html += ".schedule-item { padding: 5px; border-bottom: 1px solid #eee; }";
  html += "input[type='text'], input[type='password'], input[type='number'], select { width: 100%; padding: 10px; margin: 8px 0; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }";
  html += ".wifi-list { margin: 20px 0; text-align: left; }";
  html += ".network-item { padding: 10px; border: 1px solid #ddd; margin: 5px 0; border-radius: 5px; cursor: pointer; }";
  html += ".network-item:hover { background-color: #f0f0f0; }";
  html += ".network-name { font-weight: bold; }";
  html += ".network-info { font-size: 12px; color: #666; }";
  html += ".manual-connect { margin: 20px 0; text-align: left; }";
  html += ".connect-form { margin-top: 20px; padding: 15px; background-color: #f9f9f9; border-radius: 5px; }";
  html += ".form-group { margin-bottom: 15px; text-align: left; }";
  html += ".form-submit { margin-top: 20px; }";
  html += ".back-link { margin-top: 20px; }";
  html += "</style>";
  html += "</head><body><div class='container'>";
  html += "<h1>" + title + "</h1>";
  return html;
}

String getFooter() {
  return "</div></body></html>";
}

// String helper function
String padStart(String str, int length, char padChar) {
  while (str.length() < length) {
    str = padChar + str;
  }
  return str;
}

// Blynk virtual pin handlers
BLYNK_WRITE(V1) {
  int value = param.asInt();
  setRelayState(value);
}

// Global variable to store V4 value (ON/OFF after timer)
int timerEndAction = 1; // Default to ON (1)

// Timer duration from Blynk (in minutes)
BLYNK_WRITE(V2) {
  int minutes = param.asInt();

  if (minutes > 0) {
    // Use the stored timerEndAction value (from V4)
    // Convert minutes to milliseconds
    unsigned long duration = minutes * 60 * 1000;

    // Start timer
    startTimer(duration, timerEndAction == 1);
  } else if (timerActive) {
    // If slider set to 0, cancel timer
    cancelTimer();
  }
}

// Turn ON/OFF after timer action
BLYNK_WRITE(V4) {
  // Store the value for later use in V2
  timerEndAction = param.asInt();
}

// Send current state to Blynk when connected
BLYNK_CONNECTED() {
  // Send the current value of relay to the app
  Blynk.virtualWrite(V1, relayState);

  // Send timer status if active
  if (timerActive) {
    unsigned long remainingSeconds = (timerDuration - (millis() - timerStartTime)) / 1000;
    unsigned long remainingMinutes = remainingSeconds / 60;

    Blynk.virtualWrite(V2, remainingMinutes);
    Blynk.virtualWrite(V3, remainingSeconds);
    Blynk.virtualWrite(V4, timerTurnOn ? 1 : 0);
  } else {
    Blynk.virtualWrite(V2, 0);
    Blynk.virtualWrite(V3, 0);
    Blynk.virtualWrite(V4, 1); // Default to "turn ON after timer"
  }
}
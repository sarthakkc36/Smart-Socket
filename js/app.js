// Smart Socket PWA - Main JavaScript

// MQTT Configuration
let mqttConfig = {
  broker: localStorage.getItem('mqtt_broker') || 'broker.hivemq.com',
  port: parseInt(localStorage.getItem('mqtt_port') || '8884'),
  username: localStorage.getItem('mqtt_username') || '',
  password: localStorage.getItem('mqtt_password') || '',
  clientId: 'webClient_' + Math.random().toString(16).substr(2, 8),
  topicBase: 'smartplug/'
};

// Device state
let deviceState = {
  connected: false,
  deviceId: '',
  power: false,
  timer: {
    enabled: false,
    hour: 0,
    minute: 0,
    action: false
  },
  ip: '',
  rssi: 0,
  schedules: []
};

// MQTT Client
let mqttClient = null;

// DOM Elements
const connectionStatus = document.getElementById('connection-status');
const deviceName = document.getElementById('device-name');
const deviceId = document.getElementById('device-id');
const deviceIp = document.getElementById('device-ip');
const signalStrength = document.getElementById('signal-strength');
const powerToggle = document.getElementById('power-toggle');
const powerLabel = document.querySelector('.power-label');
const timerToggle = document.getElementById('timer-toggle');
const timerHourSelect = document.getElementById('timer-hour');
const timerMinuteSelect = document.getElementById('timer-minute');
const timerActionSelect = document.getElementById('timer-action');
const saveTimerBtn = document.getElementById('save-timer');
const settingsBtn = document.getElementById('settings');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.querySelector('.close');
const settingsForm = document.getElementById('settings-form');
const mqttBrokerInput = document.getElementById('mqtt-broker');
const mqttPortInput = document.getElementById('mqtt-port');
const mqttUsernameInput = document.getElementById('mqtt-username');
const mqttPasswordInput = document.getElementById('mqtt-password');
const addScheduleBtn = document.getElementById('add-schedule');
const scheduleHourSelect = document.getElementById('schedule-hour');
const scheduleMinuteSelect = document.getElementById('schedule-minute');
const scheduleActionSelect = document.getElementById('schedule-action');
const scheduleList = document.getElementById('schedule-list');

// Initialize the app
function initApp() {
  // Populate time selectors
  populateTimeSelectors();

  // Load saved settings
  loadSettings();

  // Connect to MQTT broker
  connectMQTT();

  // Set up event listeners
  setupEventListeners();

  // Load saved schedules
  loadSchedules();
}

// Populate hour and minute selectors
function populateTimeSelectors() {
  // Hours (0-23)
  for (let i = 0; i < 24; i++) {
    const hourOption = document.createElement('option');
    hourOption.value = i;
    hourOption.textContent = i.toString().padStart(2, '0');
    timerHourSelect.appendChild(hourOption);

    const scheduleHourOption = document.createElement('option');
    scheduleHourOption.value = i;
    scheduleHourOption.textContent = i.toString().padStart(2, '0');
    scheduleHourSelect.appendChild(scheduleHourOption);
  }

  // Minutes (0-59)
  for (let i = 0; i < 60; i++) {
    const minuteOption = document.createElement('option');
    minuteOption.value = i;
    minuteOption.textContent = i.toString().padStart(2, '0');
    timerMinuteSelect.appendChild(minuteOption);

    const scheduleMinuteOption = document.createElement('option');
    scheduleMinuteOption.value = i;
    scheduleMinuteOption.textContent = i.toString().padStart(2, '0');
    scheduleMinuteSelect.appendChild(scheduleMinuteOption);
  }
}

// Load settings from localStorage
function loadSettings() {
  mqttBrokerInput.value = mqttConfig.broker;
  mqttPortInput.value = mqttConfig.port;
  mqttUsernameInput.value = mqttConfig.username;
  mqttPasswordInput.value = mqttConfig.password;
}

// Save settings to localStorage
function saveSettings() {
  mqttConfig.broker = mqttBrokerInput.value;
  mqttConfig.port = parseInt(mqttPortInput.value);
  mqttConfig.username = mqttUsernameInput.value;
  mqttConfig.password = mqttPasswordInput.value;

  localStorage.setItem('mqtt_broker', mqttConfig.broker);
  localStorage.setItem('mqtt_port', mqttConfig.port);
  localStorage.setItem('mqtt_username', mqttConfig.username);
  localStorage.setItem('mqtt_password', mqttConfig.password);

  // Reconnect with new settings
  if (mqttClient && mqttClient.isConnected()) {
    mqttClient.disconnect();
  }
  connectMQTT();
}

// Connect to MQTT broker
function connectMQTT() {
  // Update UI
  connectionStatus.textContent = 'Connecting...';
  connectionStatus.className = 'disconnected';

  // Create MQTT client
  mqttClient = new Paho.MQTT.Client(
    mqttConfig.broker,
    mqttConfig.port,
    mqttConfig.clientId
  );

  // Set callback handlers
  mqttClient.onConnectionLost = onConnectionLost;
  mqttClient.onMessageArrived = onMessageArrived;

  // Connect options
  const options = {
    useSSL: true,
    timeout: 3,
    onSuccess: onConnect,
    onFailure: onConnectFailure
  };

  // Add credentials if provided
  if (mqttConfig.username) {
    options.userName = mqttConfig.username;
    options.password = mqttConfig.password;
  }

  // Connect
  try {
    mqttClient.connect(options);
  } catch (error) {
    console.error('MQTT connection error:', error);
    connectionStatus.textContent = 'Connection Error';
    connectionStatus.className = 'disconnected';
  }
}

// On successful connection
function onConnect() {
  console.log('Connected to MQTT broker');
  connectionStatus.textContent = 'Connected';
  connectionStatus.className = 'connected';

  // Subscribe to all smart plugs for discovery
  mqttClient.subscribe(mqttConfig.topicBase + 'status/#');

  // Request status from all devices
  publishMessage(mqttConfig.topicBase + 'control', {
    command: 'getStatus'
  });
}

// On connection failure
function onConnectFailure(error) {
  console.error('Failed to connect to MQTT broker:', error);
  connectionStatus.textContent = 'Connection Failed';
  connectionStatus.className = 'disconnected';
}

// On connection lost
function onConnectionLost(responseObject) {
  if (responseObject.errorCode !== 0) {
    console.error('Connection lost:', responseObject.errorMessage);
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'disconnected';

    // Try to reconnect after a delay
    setTimeout(connectMQTT, 5000);
  }
}

// On message received
function onMessageArrived(message) {
  console.log('Message arrived:', message.destinationName, message.payloadString);

  try {
    const topic = message.destinationName;
    const payload = JSON.parse(message.payloadString);

    // Check if this is a status message
    if (topic.startsWith(mqttConfig.topicBase + 'status/')) {
      // Extract device ID from topic
      const deviceIdFromTopic = topic.replace(mqttConfig.topicBase + 'status/', '');

      // Update device state
      deviceState.deviceId = payload.deviceId || deviceIdFromTopic;
      deviceState.power = payload.power;
      deviceState.timer = payload.timer;
      deviceState.ip = payload.ip;
      deviceState.rssi = payload.rssi;
      
      // Update schedules if available in the payload
      if (payload.schedules && Array.isArray(payload.schedules)) {
        // Map device schedules to our format with IDs
        deviceState.schedules = payload.schedules.map(schedule => ({
          id: `device_${schedule.hour}_${schedule.minute}_${schedule.action ? 'on' : 'off'}`,
          hour: schedule.hour,
          minute: schedule.minute,
          action: schedule.action,
          enabled: schedule.enabled
        }));
        
        // Save to localStorage
        saveSchedules();
        
        // Update UI
        renderSchedules();
      }

      // Update UI
      updateDeviceUI();
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

// Update device UI with current state
function updateDeviceUI() {
  // Device info
  deviceId.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,8.39C13.57,9.4 15.42,10 17.42,10C18.2,10 18.95,9.91 19.67,9.74C19.88,10.45 20,11.21 20,12C20,16.41 16.41,20 12,20C9,20 6.39,18.34 5,15.89L6.61,14V16A1,1 0 0,0 7.61,17A1,1 0 0,0 8.61,16V13A1,1 0 0,0 7.61,12H4.61A1,1 0 0,0 3.61,13A1,1 0 0,0 4.61,14H5.74C6.63,17.13 9.11,19.43 12,20C7.97,19.08 6.16,13.22 12,8.39Z"/>
    </svg>
    ${deviceState.deviceId}
  `;

  deviceIp.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="currentColor" d="M20,8h0L14,2.74a3,3,0,0,0-4,0L4,8a3,3,0,0,0-1,2.26V19a3,3,0,0,0,3,3H18a3,3,0,0,0,3-3V10.25A3,3,0,0,0,20,8ZM14,20H10V15a1,1,0,0,1,1-1h2a1,1,0,0,1,1,1Zm5-1a1,1,0,0,1-1,1H16V15a3,3,0,0,0-3-3H11a3,3,0,0,0-3,3v5H6a1,1,0,0,1-1-1V10.25a1,1,0,0,1,.34-.75l6-5.25a1,1,0,0,1,1.32,0l6,5.25a1,1,0,0,1,.34.75Z"/>
    </svg>
    IP: ${deviceState.ip}
  `;

  signalStrength.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="currentColor" d="M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9z"/>
    </svg>
    Signal: ${deviceState.rssi} dBm
  `;

  // Power state
  powerToggle.checked = deviceState.power;
  updatePowerLabel(deviceState.power);
  updateDeviceStatusBg(deviceState.power);

  // Timer state
  timerToggle.checked = deviceState.timer.enabled;
  timerHourSelect.value = deviceState.timer.hour;
  timerMinuteSelect.value = deviceState.timer.minute;
  timerActionSelect.value = deviceState.timer.action ? 'on' : 'off';

  // Enable/disable timer controls based on timer state
  timerHourSelect.disabled = !deviceState.timer.enabled;
  timerMinuteSelect.disabled = !deviceState.timer.enabled;
  timerActionSelect.disabled = !deviceState.timer.enabled;

  // Update current time
  updateCurrentTime();
}

// Publish message to MQTT broker
function publishMessage(topic, message) {
  if (!mqttClient || !mqttClient.isConnected()) {
    console.error('MQTT client not connected');
    return;
  }

  const payload = JSON.stringify(message);
  const mqttMessage = new Paho.MQTT.Message(payload);
  mqttMessage.destinationName = topic;
  mqttMessage.qos = 1;
  mqttMessage.retained = false;

  mqttClient.send(mqttMessage);
}

// Toggle power state
function togglePower() {
  const newState = !deviceState.power;

  // Publish power command
  publishMessage(mqttConfig.topicBase + 'control/' + deviceState.deviceId, {
    command: 'power',
    state: newState
  });

  // Optimistically update UI
  deviceState.power = newState;
  updateDeviceUI();
}

// Save timer settings
function saveTimer() {
  const enabled = timerToggle.checked;
  const hour = parseInt(timerHourSelect.value);
  const minute = parseInt(timerMinuteSelect.value);
  const action = timerActionSelect.value === 'on';

  // Publish timer command
  publishMessage(mqttConfig.topicBase + 'control/' + deviceState.deviceId, {
    command: 'timer',
    enabled: enabled,
    hour: hour,
    minute: minute,
    action: action
  });

  // Optimistically update UI
  deviceState.timer.enabled = enabled;
  deviceState.timer.hour = hour;
  deviceState.timer.minute = minute;
  deviceState.timer.action = action;
  updateDeviceUI();
}

// Load schedules from localStorage
function loadSchedules() {
  const savedSchedules = localStorage.getItem('schedules');
  if (savedSchedules) {
    deviceState.schedules = JSON.parse(savedSchedules);
    renderSchedules();
  }
}

// Save schedules to localStorage
function saveSchedules() {
  localStorage.setItem('schedules', JSON.stringify(deviceState.schedules));
}

// Add a new schedule
function addSchedule() {
  const hour = parseInt(scheduleHourSelect.value);
  const minute = parseInt(scheduleMinuteSelect.value);
  const action = scheduleActionSelect.value === 'on';

  // Create new schedule
  const schedule = {
    id: Date.now(),
    hour: hour,
    minute: minute,
    action: action,
    enabled: true
  };

  // Add to schedules
  deviceState.schedules.push(schedule);

  // Save and render
  saveSchedules();
  renderSchedules();

  // Send to device via MQTT
  if (deviceState.deviceId && mqttClient && mqttClient.isConnected()) {
    publishMessage(mqttConfig.topicBase + 'control/' + deviceState.deviceId, {
      command: 'addSchedule',
      hour: hour,
      minute: minute,
      action: action,
      enabled: true
    });
  }

  // Reset selectors
  scheduleHourSelect.value = 0;
  scheduleMinuteSelect.value = 0;
  scheduleActionSelect.value = 'on';
}

// Delete a schedule
function deleteSchedule(id) {
  // Find the schedule to be deleted
  const scheduleToDelete = deviceState.schedules.find(schedule => schedule.id === id);
  
  if (!scheduleToDelete) {
    return; // Schedule not found
  }
  
  // Get the index before removing from the array
  const scheduleIndex = deviceState.schedules.findIndex(s => s.id === id);
  
  // Remove from local array
  deviceState.schedules = deviceState.schedules.filter(schedule => schedule.id !== id);
  saveSchedules();
  renderSchedules();
  
  // Send deletion to device via MQTT if connected
  if (deviceState.deviceId && mqttClient && mqttClient.isConnected()) {
    publishMessage(mqttConfig.topicBase + 'control/' + deviceState.deviceId, {
      command: 'deleteSchedule',
      index: scheduleIndex
    });
  }
}

// Render schedules list
function renderSchedules() {
  scheduleList.innerHTML = '';

  if (deviceState.schedules.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'placeholder-text';
    emptyMessage.textContent = 'No schedules set';
    scheduleList.appendChild(emptyMessage);
    return;
  }

  // Sort schedules by time
  deviceState.schedules.sort((a, b) => {
    if (a.hour !== b.hour) {
      return a.hour - b.hour;
    }
    return a.minute - b.minute;
  });

  // Create schedule items
  deviceState.schedules.forEach(schedule => {
    const scheduleItem = document.createElement('div');
    scheduleItem.className = 'schedule-item';

    const timeText = document.createElement('div');
    timeText.className = 'schedule-time';
    timeText.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12,2C6.477,2,2,6.477,2,12c0,5.523,4.477,10,10,10s10-4.477,10-10C22,6.477,17.523,2,12,2z M12,20c-4.418,0-8-3.582-8-8s3.582-8,8-8s8,3.582,8,8S16.418,20,12,20z"/>
        <path fill="currentColor" d="M12.5,7H11v6l5.25,3.15l0.75-1.23l-4.5-2.67V7z"/>
      </svg>
      ${schedule.hour.toString().padStart(2, '0')}:${schedule.minute.toString().padStart(2, '0')}
    `;

    const actionText = document.createElement('div');
    actionText.className = `schedule-action ${schedule.action ? 'action-on' : 'action-off'}`;
    actionText.textContent = schedule.action ? 'ON' : 'OFF';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.innerHTML = '&times;';
    deleteButton.addEventListener('click', () => deleteSchedule(schedule.id));

    scheduleItem.appendChild(timeText);
    scheduleItem.appendChild(actionText);
    scheduleItem.appendChild(deleteButton);

    scheduleList.appendChild(scheduleItem);
  });
}

// Enhanced setup event listeners
function setupEventListeners() {
  // Original event listeners
  powerToggle.addEventListener('change', togglePower);

  timerToggle.addEventListener('change', () => {
    timerHourSelect.disabled = !timerToggle.checked;
    timerMinuteSelect.disabled = !timerToggle.checked;
    timerActionSelect.disabled = !timerToggle.checked;
  });

  saveTimerBtn.addEventListener('click', saveTimer);

  settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'block';
  });

  // Update close button selector
  document.querySelector('.close-button').addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
    settingsModal.style.display = 'none';
  });

  addScheduleBtn.addEventListener('click', addSchedule);

  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  // Set up time update interval
  setInterval(updateCurrentTime, 1000);
}

// Theme toggle function
function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem('darkTheme', isDark);
  document.getElementById('theme-icon').textContent = isDark ? '🌙' : '☀️';
}

// Initialize theme based on user preference
function initTheme() {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const storedTheme = localStorage.getItem('darkTheme');
  const isDark = storedTheme ? storedTheme === 'true' : prefersDark;

  if (isDark) {
    document.body.classList.add('dark-theme');
  }

  document.getElementById('theme-icon').textContent = isDark ? '🌙' : '☀️';
}

// Update device status background
function updateDeviceStatusBg(isOn) {
  const bg = document.getElementById('device-status-bg');
  if (bg) {
    bg.className = 'device-status-bg ' + (isOn ? 'on' : 'off');
  }
}

// Update power label with animation
function updatePowerLabel(isOn) {
  const label = document.getElementById('power-label');
  if (label) {
    label.className = 'power-label ' + (isOn ? 'on' : 'off');
    label.textContent = isOn ? 'ON' : 'OFF';
  }
}

// Update current time
function updateCurrentTime() {
  const timeElement = document.getElementById('current-time');
  if (timeElement) {
    const now = new Date();
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kathmandu' // Nepal Time Zone
    };

    try {
      const formatter = new Intl.DateTimeFormat('en-US', options);
      timeElement.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12,2C6.477,2,2,6.477,2,12c0,5.523,4.477,10,10,10s10-4.477,10-10C22,6.477,17.523,2,12,2z M12,20c-4.418,0-8-3.582-8-8s3.582-8,8-8s8,3.582,8,8S16.418,20,12,20z"/>
          <path fill="currentColor" d="M12.5,7H11v6l5.25,3.15l0.75-1.23l-4.5-2.67V7z"/>
        </svg>
        Time (NPT): ${formatter.format(now)}
      `;
    } catch (e) {
      // Fallback if Intl is not supported
      const pad = (num) => num.toString().padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      timeElement.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12,2C6.477,2,2,6.477,2,12c0,5.523,4.477,10,10,10s10-4.477,10-10C22,6.477,17.523,2,12,2z M12,20c-4.418,0-8-3.582-8-8s3.582-8,8-8s8,3.582,8,8S16.418,20,12,20z"/>
          <path fill="currentColor" d="M12.5,7H11v6l5.25,3.15l0.75-1.23l-4.5-2.67V7z"/>
        </svg>
        Time: ${dateStr}
      `;
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initApp();
});

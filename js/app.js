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

// ============ Logging System ============
// Logger configuration
const loggerConfig = {
  maxEntries: 100,
  storageKey: 'smartSocket_logs',
  logLevel: localStorage.getItem('logLevel') || 'info' // info, warning, error, or debug
};

// Log types
const LogType = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  SUCCESS: 'success'
};

// Connection tracking variables
let connectionAttempts = 0;
let lastDisconnectTime = null;
let connectionHistory = [];

// Logger class
class Logger {
  constructor(config) {
    this.config = config;
    this.logs = this.loadLogs();
    this.logsElement = document.getElementById('logs-content');
    this.setupEventListeners();
  }

  // Load logs from localStorage
  loadLogs() {
    const savedLogs = localStorage.getItem(this.config.storageKey);
    return savedLogs ? JSON.parse(savedLogs) : [];
  }

  // Save logs to localStorage
  saveLogs() {
    // Ensure we don't exceed the maximum number of entries
    if (this.logs.length > this.config.maxEntries) {
      this.logs = this.logs.slice(-this.config.maxEntries);
    }
    localStorage.setItem(this.config.storageKey, JSON.stringify(this.logs));
  }

  // Add a new log entry
  addLog(message, type = LogType.INFO, data = null) {
    // Skip if log level doesn't match
    if (type === LogType.INFO && this.config.logLevel === 'warning') return;
    if ((type === LogType.INFO || type === LogType.WARNING) && this.config.logLevel === 'error') return;

    const timestamp = new Date();
    const logEntry = {
      timestamp,
      type,
      message,
      data
    };

    this.logs.push(logEntry);
    this.saveLogs();
    this.renderLog(logEntry);
    
    // Log to console as well
    if (type === LogType.ERROR) {
      console.error(message, data || '');
    } else if (type === LogType.WARNING) {
      console.warn(message, data || '');
    } else {
      console.log(message, data || '');
    }
  }

  // Clear all logs
  clearLogs() {
    this.logs = [];
    localStorage.removeItem(this.config.storageKey);
    if (this.logsElement) {
      this.logsElement.innerHTML = '<div class="log-entry"><span class="log-info">Logs cleared</span></div>';
    }
  }

  // Format timestamp for display
  formatTimestamp(date) {
    const pad = (num) => num.toString().padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  // Render a single log entry in the UI
  renderLog(logEntry) {
    if (!this.logsElement) return;

    const logItem = document.createElement('div');
    logItem.className = 'log-entry fade-in';

    const timestamp = document.createElement('span');
    timestamp.className = 'log-timestamp';
    timestamp.textContent = this.formatTimestamp(new Date(logEntry.timestamp));

    const message = document.createElement('span');
    message.className = `log-${logEntry.type}`;
    message.textContent = logEntry.message;

    logItem.appendChild(timestamp);
    logItem.appendChild(message);

    // Add to the top of the logs
    this.logsElement.insertBefore(logItem, this.logsElement.firstChild);

    // Auto-scroll to the latest log
    this.logsElement.scrollTop = 0;
  }

  // Export logs as text file
  exportLogs() {
    const logText = this.logs.map(log => {
      const timestamp = new Date(log.timestamp);
      const timeStr = timestamp.toISOString();
      const levelPadded = log.type.toUpperCase().padEnd(7, ' ');
      return `${timeStr} [${levelPadded}] ${log.message}${log.data ? ' - ' + JSON.stringify(log.data) : ''}`;
    }).join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `smartsocket_logs_${new Date().toISOString().replace(/[:.]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // Set up event listeners for log-related buttons
  setupEventListeners() {
    const clearBtn = document.getElementById('clear-logs');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearLogs();
      });
    }

    const exportBtn = document.getElementById('export-logs');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportLogs();
      });
    }
  }

  // Render all logs in the UI
  renderAllLogs() {
    if (!this.logsElement) return;

    this.logsElement.innerHTML = '';

    if (this.logs.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'log-entry';
      emptyMessage.innerHTML = '<span class="log-info">No logs yet</span>';
      this.logsElement.appendChild(emptyMessage);
      return;
    }

    // Render logs in reverse chronological order (newest first)
    for (let i = this.logs.length - 1; i >= 0; i--) {
      this.renderLog(this.logs[i]);
    }
  }

  // Calculate and return uptime statistics
  getUptimeStats() {
    if (connectionHistory.length === 0) {
      return {
        totalUptime: 0,
        totalDowntime: 0,
        uptimePercentage: 0,
        avgReconnectTime: 0,
        reconnectAttempts: connectionAttempts
      };
    }

    let totalUptime = 0;
    let totalDowntime = 0;
    let reconnectTimes = [];

    // Calculate times between connect/disconnect events
    for (let i = 1; i < connectionHistory.length; i++) {
      const prev = connectionHistory[i - 1];
      const curr = connectionHistory[i];

      if (prev.status === 'connected' && curr.status === 'disconnected') {
        totalUptime += curr.timestamp - prev.timestamp;
      }

      if (prev.status === 'disconnected' && curr.status === 'connected') {
        const reconnectTime = curr.timestamp - prev.timestamp;
        totalDowntime += reconnectTime;
        reconnectTimes.push(reconnectTime);
      }
    }

    // If currently connected, add the time since last connect
    const lastEvent = connectionHistory[connectionHistory.length - 1];
    if (lastEvent.status === 'connected') {
      totalUptime += Date.now() - lastEvent.timestamp;
    }

    // If currently disconnected, add the time since last disconnect
    if (lastEvent.status === 'disconnected') {
      totalDowntime += Date.now() - lastEvent.timestamp;
    }

    const totalTime = totalUptime + totalDowntime;
    const uptimePercentage = totalTime > 0 ? (totalUptime / totalTime) * 100 : 0;
    const avgReconnectTime = reconnectTimes.length > 0 
      ? reconnectTimes.reduce((sum, time) => sum + time, 0) / reconnectTimes.length 
      : 0;

    return {
      totalUptime,
      totalDowntime,
      uptimePercentage,
      avgReconnectTime,
      reconnectAttempts: connectionAttempts
    };
  }
}

// Global logger instance
let logger = null;

// Initialize the logger
function initLogger() {
  logger = new Logger(loggerConfig);
  logger.addLog('Logging system initialized', LogType.INFO);
  logger.renderAllLogs();
}

// Track connection state change
function trackConnectionState(status, details = {}) {
  const timestamp = Date.now();
  
  connectionHistory.push({
    status,
    timestamp,
    details
  });

  // Maintain history size
  if (connectionHistory.length > 100) {
    connectionHistory.shift();
  }

  // Log connection state changes
  if (status === 'connected') {
    if (lastDisconnectTime !== null) {
      const reconnectTime = timestamp - lastDisconnectTime;
      const reconnectTimeFormatted = formatDuration(reconnectTime);
      logger.addLog(`Reconnected after ${reconnectTimeFormatted}`, LogType.SUCCESS, {
        reconnectTime,
        attempts: connectionAttempts
      });
      // Reset connection attempts after successful connection
      connectionAttempts = 0;
    } else {
      logger.addLog('Connected to MQTT broker', LogType.SUCCESS, details);
    }
    lastDisconnectTime = null;
  } 
  else if (status === 'disconnected') {
    lastDisconnectTime = timestamp;
    logger.addLog('Disconnected from MQTT broker', LogType.WARNING, details);
  }
  else if (status === 'connecting') {
    connectionAttempts++;
    logger.addLog(`Connecting to MQTT broker (attempt ${connectionAttempts})`, LogType.INFO, details);
  }
  else if (status === 'failed') {
    logger.addLog('Failed to connect to MQTT broker', LogType.ERROR, details);
  }
}

// Format milliseconds to a readable duration
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  let result = '';
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0 || hours > 0) result += `${minutes}m `;
  result += `${seconds}s`;
  
  return result;
}

// Connection monitor - periodically logs connection stats
function startConnectionMonitor() {
  setInterval(() => {
    if (mqttClient && mqttClient.isConnected()) {
      const stats = logger.getUptimeStats();
      
      if (stats.reconnectAttempts > 0) {
        logger.addLog(`Connection stats: ${stats.uptimePercentage.toFixed(1)}% uptime, avg reconnect: ${formatDuration(stats.avgReconnectTime)}`, 
          LogType.INFO, stats);
      }
    }
  }, 60000); // Log stats every minute
}

// Enhanced connection functions
// On successful connection
function onConnect() {
  console.log('Connected to MQTT broker');
  connectionStatus.textContent = 'Connected';
  connectionStatus.className = 'connected';

  // Update connection tracking
  trackConnectionState('connected', {
    broker: mqttConfig.broker,
    port: mqttConfig.port
  });

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

  // Update connection tracking
  trackConnectionState('failed', {
    error: error.errorMessage || error.toString(),
    broker: mqttConfig.broker,
    port: mqttConfig.port
  });

  // Try to reconnect after a delay
  setTimeout(connectMQTT, 5000);
}

// On connection lost
function onConnectionLost(responseObject) {
  if (responseObject.errorCode !== 0) {
    console.error('Connection lost:', responseObject.errorMessage);
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'disconnected';

    // Update connection tracking
    trackConnectionState('disconnected', {
      error: responseObject.errorMessage,
      errorCode: responseObject.errorCode
    });

    // Try to reconnect after a delay
    setTimeout(connectMQTT, 5000);
  }
}

// Connect to MQTT broker with enhanced logging
function connectMQTT() {
  // Update UI
  connectionStatus.textContent = 'Connecting...';
  connectionStatus.className = 'disconnected';

  // Update connection tracking
  trackConnectionState('connecting', {
    broker: mqttConfig.broker,
    port: mqttConfig.port
  });

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
    
    // Log error
    trackConnectionState('failed', {
      error: error.toString()
    });
  }
}

// Enhanced message handling
function onMessageArrived(message) {
  console.log('Message arrived:', message.destinationName, message.payloadString);

  try {
    const topic = message.destinationName;
    const payload = JSON.parse(message.payloadString);

    // Log interesting message events
    if (topic.includes('/status/')) {
      logger.addLog(`Received status update from device ${topic.split('/').pop()}`, 
        LogType.INFO, { topic, rssi: payload.rssi });
    }

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

      // Log low signal strength
      if (payload.rssi < -80) {
        logger.addLog(`Low signal strength detected: ${payload.rssi} dBm`, 
          LogType.WARNING, { deviceId: deviceState.deviceId, rssi: payload.rssi });
      }

      // Update UI
      updateDeviceUI();
    }
  } catch (error) {
    console.error('Error processing message:', error);
    logger.addLog('Error processing message', LogType.ERROR, { 
      error: error.toString(), 
      topic: message.destinationName 
    });
  }
}

// Enhanced publish message function with logging
function publishMessage(topic, message) {
  if (!mqttClient || !mqttClient.isConnected()) {
    logger.addLog('Cannot publish message - MQTT client not connected', LogType.ERROR);
    console.error('MQTT client not connected');
    return;
  }

  const payload = JSON.stringify(message);
  const mqttMessage = new Paho.MQTT.Message(payload);
  mqttMessage.destinationName = topic;
  mqttMessage.qos = 1;
  mqttMessage.retained = false;

  try {
    mqttClient.send(mqttMessage);
    logger.addLog(`Message published to ${topic}`, LogType.INFO, { command: message.command });
  } catch (error) {
    logger.addLog('Failed to publish message', LogType.ERROR, { 
      error: error.toString(),
      topic: topic
    });
  }
}

// Initialize the app with logging
function initApp() {
  // Initialize logger
  initLogger();
  logger.addLog('Application starting', LogType.INFO);

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
  
  // Start connection monitor
  startConnectionMonitor();
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

  // Reset selectors
  scheduleHourSelect.value = 0;
  scheduleMinuteSelect.value = 0;
  scheduleActionSelect.value = 'on';
}

// Delete a schedule
function deleteSchedule(id) {
  deviceState.schedules = deviceState.schedules.filter(schedule => schedule.id !== id);
  saveSchedules();
  renderSchedules();
}

// Enhanced version of renderSchedules
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

// Enhanced version of updateDeviceUI
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

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initApp();
});

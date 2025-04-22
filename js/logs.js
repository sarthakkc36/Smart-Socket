// Smart Socket Logging System

// Log levels 
const LOG_LEVELS = {
    INFO: { level: 0, label: 'INFO', color: '#4285f4' },
    SUCCESS: { level: 1, label: 'SUCCESS', color: '#0f9d58' },
    WARNING: { level: 2, label: 'WARNING', color: '#f4b400' },
    ERROR: { level: 3, label: 'ERROR', color: '#db4437' },
    SYSTEM: { level: 4, label: 'SYSTEM', color: '#9334e6' }
};

// Log categories
const LOG_CATEGORIES = {
    POWER: { id: 'power', label: 'Power', icon: 'flash_on' },
    CONNECTION: { id: 'connection', label: 'Connection', icon: 'wifi' },
    TIMER: { id: 'timer', label: 'Timer', icon: 'schedule' },
    MQTT: { id: 'mqtt', label: 'MQTT', icon: 'cloud' },
    SYSTEM: { id: 'system', label: 'System', icon: 'settings' }
};

// Log storage
const MAX_LOGS = 100; // Maximum number of logs to store

class LoggingSystem {
    constructor() {
        this.logs = [];
        this.loadLogs();
    }

    // Add a new log entry
    log(message, level = LOG_LEVELS.INFO, category = LOG_CATEGORIES.SYSTEM, source = 'webapp') {
        const timestamp = new Date();
        
        const logEntry = {
            id: Date.now(),
            timestamp: timestamp,
            formattedTime: this.formatTimestamp(timestamp),
            message: message,
            level: level,
            category: category,
            source: source
        };

        // Add to the beginning of the array for reverse chronological order
        this.logs.unshift(logEntry);
        
        // Trim logs if exceeding maximum
        if (this.logs.length > MAX_LOGS) {
            this.logs = this.logs.slice(0, MAX_LOGS);
        }

        // Save to localStorage
        this.saveLogs();

        // Display in UI if available
        this.displayLog(logEntry);

        return logEntry;
    }

    // Format timestamp nicely
    formatTimestamp(timestamp) {
        const options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };

        try {
            return new Intl.DateTimeFormat('en-US', options).format(timestamp);
        } catch (e) {
            // Fallback formatting
            return timestamp.toISOString().replace('T', ' ').substr(0, 19);
        }
    }

    // Save logs to localStorage
    saveLogs() {
        try {
            localStorage.setItem('smart_socket_logs', JSON.stringify(this.logs));
        } catch (e) {
            console.error('Error saving logs to localStorage:', e);
        }
    }

    // Load logs from localStorage
    loadLogs() {
        try {
            const savedLogs = localStorage.getItem('smart_socket_logs');
            this.logs = savedLogs ? JSON.parse(savedLogs) : [];
        } catch (e) {
            console.error('Error loading logs from localStorage:', e);
            this.logs = [];
        }
    }

    // Clear all logs
    clearLogs() {
        this.logs = [];
        this.saveLogs();
        this.renderAllLogs();
    }

    // Filter logs by category
    filterLogs(category = null, level = null, source = null) {
        let filteredLogs = [...this.logs];

        if (category) {
            filteredLogs = filteredLogs.filter(log => log.category.id === category);
        }

        if (level !== null) {
            filteredLogs = filteredLogs.filter(log => log.level.level === level);
        }

        if (source) {
            filteredLogs = filteredLogs.filter(log => log.source === source);
        }

        return filteredLogs;
    }

    // Display a log entry in the UI
    displayLog(logEntry) {
        const logsContainer = document.getElementById('logs-container');
        if (!logsContainer) return;

        const logElement = this.createLogElement(logEntry);
        
        // Add to the beginning of the list
        if (logsContainer.firstChild) {
            logsContainer.insertBefore(logElement, logsContainer.firstChild);
        } else {
            logsContainer.appendChild(logElement);
        }

        // Trim UI logs if there are too many
        while (logsContainer.children.length > MAX_LOGS) {
            logsContainer.removeChild(logsContainer.lastChild);
        }
    }

    // Create a log element for the UI
    createLogElement(logEntry) {
        const logElement = document.createElement('div');
        logElement.className = 'log-item';
        logElement.setAttribute('data-level', logEntry.level.label);
        logElement.setAttribute('data-category', logEntry.category.id);
        logElement.setAttribute('data-source', logEntry.source);

        const levelDot = document.createElement('span');
        levelDot.className = 'log-level-indicator';
        levelDot.style.backgroundColor = logEntry.level.color;
        levelDot.title = logEntry.level.label;

        const logContent = document.createElement('div');
        logContent.className = 'log-content';

        const logHeader = document.createElement('div');
        logHeader.className = 'log-header';
        
        const timestamp = document.createElement('span');
        timestamp.className = 'log-timestamp';
        timestamp.textContent = logEntry.formattedTime;

        const categoryBadge = document.createElement('span');
        categoryBadge.className = 'log-category';
        categoryBadge.innerHTML = `
            <i class="material-icons">${logEntry.category.icon}</i>
            ${logEntry.category.label}
        `;

        const sourceBadge = document.createElement('span');
        sourceBadge.className = 'log-source';
        sourceBadge.textContent = logEntry.source;

        logHeader.appendChild(timestamp);
        logHeader.appendChild(categoryBadge);
        logHeader.appendChild(sourceBadge);

        const logMessage = document.createElement('div');
        logMessage.className = 'log-message';
        logMessage.textContent = logEntry.message;

        logContent.appendChild(logHeader);
        logContent.appendChild(logMessage);

        logElement.appendChild(levelDot);
        logElement.appendChild(logContent);

        return logElement;
    }

    // Render all logs to the UI
    renderAllLogs(filteredLogs = null) {
        const logsContainer = document.getElementById('logs-container');
        if (!logsContainer) return;

        // Clear existing logs
        logsContainer.innerHTML = '';

        // Use filtered logs or all logs
        const logsToRender = filteredLogs || this.logs;

        if (logsToRender.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'logs-empty-message';
            emptyMessage.textContent = 'No logs to display';
            logsContainer.appendChild(emptyMessage);
            return;
        }

        // Add each log to the container
        logsToRender.forEach(log => {
            const logElement = this.createLogElement(log);
            logsContainer.appendChild(logElement);
        });
    }

    // Export logs as JSON
    exportLogs() {
        try {
            const logsJSON = JSON.stringify(this.logs, null, 2);
            const blob = new Blob([logsJSON], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `smart_socket_logs_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Error exporting logs:', e);
        }
    }

    // Log power event
    logPowerEvent(state, source) {
        const message = `Socket turned ${state ? 'ON' : 'OFF'}`;
        const level = LOG_LEVELS.INFO;
        return this.log(message, level, LOG_CATEGORIES.POWER, source);
    }

    // Log WiFi connection event
    logWiFiEvent(connected, rssi = null) {
        let message;
        let level;
        
        if (connected) {
            message = `WiFi connected`;
            if (rssi !== null) {
                message += ` (Signal: ${rssi} dBm)`;
            }
            level = LOG_LEVELS.SUCCESS;
        } else {
            message = 'WiFi disconnected';
            level = LOG_LEVELS.WARNING;
        }
        
        return this.log(message, level, LOG_CATEGORIES.CONNECTION);
    }

    // Log MQTT event
    logMQTTEvent(status, details = '') {
        let message;
        let level;
        
        switch (status) {
            case 'connected':
                message = `MQTT connected to broker`;
                level = LOG_LEVELS.SUCCESS;
                break;
            case 'disconnected':
                message = `MQTT disconnected`;
                level = LOG_LEVELS.WARNING;
                break;
            case 'error':
                message = `MQTT error: ${details}`;
                level = LOG_LEVELS.ERROR;
                break;
            default:
                message = `MQTT: ${status} ${details}`;
                level = LOG_LEVELS.INFO;
        }
        
        return this.log(message, level, LOG_CATEGORIES.MQTT);
    }

    // Log timer event
    logTimerEvent(action, hour, minute) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const message = `Timer set to turn ${action ? 'ON' : 'OFF'} at ${timeStr}`;
        return this.log(message, LOG_LEVELS.INFO, LOG_CATEGORIES.TIMER);
    }

    // Log schedule added or removed
    logScheduleEvent(eventType, hour, minute, action) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        let message;
        
        if (eventType === 'added') {
            message = `Schedule added: Turn ${action ? 'ON' : 'OFF'} at ${timeStr}`;
        } else if (eventType === 'removed') {
            message = `Schedule removed: Turn ${action ? 'ON' : 'OFF'} at ${timeStr}`;
        }
        
        return this.log(message, LOG_LEVELS.INFO, LOG_CATEGORIES.TIMER);
    }
}

// Create and export the singleton instance
const logger = new LoggingSystem();

// Initialize material icons (handle the case if they're already initialized)
function initMaterialIcons() {
    if (document.querySelector('link[href*="material-icons"]')) return;
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
    document.head.appendChild(link);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initMaterialIcons();
    
    // Initialize filter buttons if they exist
    const filterButtons = document.querySelectorAll('.log-filter-btn');
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            const categoryFilter = this.getAttribute('data-category');
            const activeButtons = document.querySelectorAll('.log-filter-btn.active');
            
            // Toggle active state
            if (this.classList.contains('active')) {
                this.classList.remove('active');
                logger.renderAllLogs();
            } else {
                // Remove active class from all buttons
                activeButtons.forEach(btn => btn.classList.remove('active'));
                // Add active class to clicked button
                this.classList.add('active');
                // Filter logs
                const filteredLogs = logger.filterLogs(categoryFilter);
                logger.renderAllLogs(filteredLogs);
            }
        });
    });
    
    // Initialize clear logs button if it exists
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all logs?')) {
                logger.clearLogs();
            }
        });
    }
    
    // Initialize export logs button if it exists
    const exportLogsBtn = document.getElementById('export-logs-btn');
    if (exportLogsBtn) {
        exportLogsBtn.addEventListener('click', () => {
            logger.exportLogs();
        });
    }
});

// Create initial system startup log
logger.log('Logging system initialized', LOG_LEVELS.SYSTEM, LOG_CATEGORIES.SYSTEM);
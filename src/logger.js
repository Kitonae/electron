const fs = require('fs').promises;
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
      TRACE: 4
    };
    
    this.colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow
      INFO: '\x1b[36m',  // Cyan
      DEBUG: '\x1b[35m', // Magenta
      TRACE: '\x1b[37m', // White
      RESET: '\x1b[0m'   // Reset
    };
    
    this.currentLevel = this.levels[options.level || 'INFO'];
    this.enableColors = options.colors !== false;
    this.enableFile = options.file !== false;
    this.logFilePath = options.logFilePath;
    this.component = options.component || 'APP';
    
    this.initializeLogFile();
  }
  
  async initializeLogFile() {
    if (!this.enableFile) return;
    
    try {
      if (!this.logFilePath) {
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        await fs.mkdir(userDataPath, { recursive: true });
        this.logFilePath = path.join(userDataPath, 'watchout-assistant.log');
      }
    } catch (error) {
      console.warn('Failed to initialize log file:', error.message);
      this.enableFile = false;
    }
  }
  
  formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').replace('Z', '');
  }
  
  formatMessage(level, component, message, data = null) {
    const timestamp = this.formatTimestamp();
    const baseMessage = `[${timestamp}] [${level.padEnd(5)}] [${component.padEnd(12)}] ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        return `${baseMessage}\n${JSON.stringify(data, null, 2)}`;
      } else {
        return `${baseMessage} ${data}`;
      }
    }
    
    return baseMessage;
  }
  
  formatConsoleMessage(level, component, message, data = null) {
    const timestamp = this.formatTimestamp();
    const color = this.enableColors ? this.colors[level] : '';
    const reset = this.enableColors ? this.colors.RESET : '';
    
    const baseMessage = `${color}[${timestamp}] [${level.padEnd(5)}] [${component.padEnd(12)}]${reset} ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        return `${baseMessage}\n${JSON.stringify(data, null, 2)}`;
      } else {
        return `${baseMessage} ${data}`;
      }
    }
    
    return baseMessage;
  }
  
  async writeToFile(message) {
    if (!this.enableFile || !this.logFilePath) return;
    
    try {
      await fs.appendFile(this.logFilePath, message + '\n');
    } catch (error) {
      // Silently fail file writing to avoid infinite loops
    }
  }
  
  log(level, message, data = null, component = null) {
    const logLevel = this.levels[level];
    if (logLevel > this.currentLevel) return;
    
    const comp = component || this.component;
    const consoleMessage = this.formatConsoleMessage(level, comp, message, data);
    const fileMessage = this.formatMessage(level, comp, message, data);
    
    // Output to console
    console.log(consoleMessage);
    
    // Write to file
    this.writeToFile(fileMessage);
  }
  
  error(message, data = null, component = null) {
    this.log('ERROR', message, data, component);
  }
  
  warn(message, data = null, component = null) {
    this.log('WARN', message, data, component);
  }
  
  info(message, data = null, component = null) {
    this.log('INFO', message, data, component);
  }
  
  debug(message, data = null, component = null) {
    this.log('DEBUG', message, data, component);
  }
  
  trace(message, data = null, component = null) {
    this.log('TRACE', message, data, component);
  }
  
  // Create child logger with different component
  child(component) {
    return new Logger({
      level: Object.keys(this.levels)[this.currentLevel],
      colors: this.enableColors,
      file: this.enableFile,
      logFilePath: this.logFilePath,
      component: component
    });
  }
  
  // Performance timing utility
  time(label, component = null) {
    const comp = component || this.component;
    const startTime = process.hrtime.bigint();
    
    return {
      end: (message = null) => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        const logMessage = message || `Timer '${label}' completed`;
        this.info(`${logMessage} (${duration.toFixed(2)}ms)`, null, comp);
      }
    };
  }
}

// Create a default logger instance
const defaultLogger = new Logger({
  level: process.env.LOG_LEVEL || 'INFO',
  component: 'MAIN'
});

module.exports = {
  Logger,
  logger: defaultLogger
};

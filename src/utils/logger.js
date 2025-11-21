/**
 * Logger utility to capture and save console logs
 */

class Logger {
  constructor() {
    this.logs = [];
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    };
    this.isCapturing = false;
    this.maxLogs = 10000; // Maximum number of logs to keep in memory
  }

  /**
   * Start capturing console logs
   */
  startCapture() {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;

    // Override console methods
    console.log = (...args) => {
      this.addLog('log', args);
      this.originalConsole.log(...args);
    };

    console.error = (...args) => {
      this.addLog('error', args);
      this.originalConsole.error(...args);
    };

    console.warn = (...args) => {
      this.addLog('warn', args);
      this.originalConsole.warn(...args);
    };

    console.info = (...args) => {
      this.addLog('info', args);
      this.originalConsole.info(...args);
    };

    console.debug = (...args) => {
      this.addLog('debug', args);
      this.originalConsole.debug(...args);
    };
  }

  /**
   * Stop capturing console logs
   */
  stopCapture() {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;

    // Restore original console methods
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;
  }

  /**
   * Add a log entry
   * @param {string} level - Log level (log, error, warn, info, debug)
   * @param {Array} args - Log arguments
   */
  addLog(level, args) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message: this.formatMessage(args),
      raw: args,
    };

    this.logs.push(logEntry);

    // Limit log size to prevent memory issues
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest log
    }
  }

  /**
   * Format log message from arguments
   * @param {Array} args - Log arguments
   * @returns {string} Formatted message
   */
  formatMessage(args) {
    return args
      .map((arg) => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');
  }

  /**
   * Get all logs
   * @returns {Array} Array of log entries
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * Get logs as formatted text
   * @returns {string} Formatted log text
   */
  getLogsAsText() {
    return this.logs
      .map((log) => {
        return `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`;
      })
      .join('\n');
  }

  /**
   * Get logs as JSON
   * @returns {string} JSON string of logs
   */
  getLogsAsJSON() {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Download logs as a text file
   */
  downloadLogsAsText() {
    const text = this.getLogsAsText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pose-detection-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Download logs as a JSON file
   */
  downloadLogsAsJSON() {
    const json = this.getLogsAsJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pose-detection-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get log count
   * @returns {number} Number of logs
   */
  getLogCount() {
    return this.logs.length;
  }
}

// Create singleton instance
const logger = new Logger();

// Auto-start capturing on import
logger.startCapture();

export default logger;


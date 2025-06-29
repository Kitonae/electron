/**
 * LokiLogManager - Handles Loki log viewer functionality
 */
class LokiLogManager {
  constructor(app) {
    this.app = app;
  }

  showLokiLogViewer() {
    // Enhanced server selection validation
    if (!this.app.selectedServerIp) {
      alert('Please select a server first before opening the log viewer.');
      return;
    }
    
    // Additional validation to ensure the selected server exists
    const selectedServer = this.app.servers.find(
      (server) => this.app.getServerId(server) === this.app.selectedServerId
    );
    
    if (!selectedServer) {
      alert('Selected server not found. Please refresh the server list and try again.');
      return;
    }
    
    console.log(`Opening Loki Log Viewer for server: ${this.app.selectedServerIp} (${selectedServer.hostname || selectedServer.ip})`);

    // Check if this server has Loki port (3022) configured
    const hasLokiPort = selectedServer.ports && selectedServer.ports.includes(3022);
    if (!hasLokiPort) {
      console.warn(`Port 3022 not detected during scan for ${this.app.selectedServerIp}. Loki may not be running or may be on a different system.`);
    }

    // Create modal for log viewer
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = this.createLokiModalHTML();

    document.body.appendChild(modal);
    
    // Show the modal
    modal.style.display = "flex";
    modal.classList.add("show");
    
    this.setupLokiLogViewer(hasLokiPort);
  }

  createLokiModalHTML() {
    return `
      <div class="modal-content log-viewer-modal">
        <div class="modal-header">
          <h3>🗂️ Real-time Log Viewer - ${this.app.selectedServerIp}:3022</h3>
          <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
        </div>
        <div class="modal-body">
          <div class="log-controls">
            <div class="control-group">
              <label for="logQuery">Log Query:</label>
              <select id="logQuerySelect">
                <option value="">Select a common query...</option>
              </select>
              <input type="text" id="logQuery" placeholder='{app=~".+"}' value='{app=~".+"}'>
            </div>
            <div class="control-group">
              <label for="logLimit">Limit:</label>
              <input type="number" id="logLimit" value="100" min="10" max="1000">
            </div>
            <div class="control-group">
              <label for="logSince">Since:</label>
              <select id="logSince">
                <option value="5m">5 minutes</option>
                <option value="15m">15 minutes</option>
                <option value="1h" selected>1 hour</option>
                <option value="3h">3 hours</option>
                <option value="6h">6 hours</option>
                <option value="12h">12 hours</option>
                <option value="24h">24 hours</option>
              </select>
            </div>
            <div class="control-group">
              <button id="queryLogsBtn" class="btn btn-primary">Query Logs</button>
            </div>
          </div>
          
          <div class="log-status">
            <div id="lokiConnectionStatus" class="connection-status unknown">
              <div class="status-indicator"></div>
              <span class="status-text">Connection Status: Unknown</span>
            </div>
            <div id="logStreamStatus" class="stream-status">
              <span class="stream-indicator">⚫</span>
              <span class="stream-text">Stream: Stopped</span>
            </div>
            <div id="logStreamControls">
              <label class="toggle-label">
                <input type="checkbox" id="streamToggle">
                <span class="toggle-switch"></span>
                <span class="toggle-text">Enable Live Streaming</span>
              </label>
            </div>
          </div>

          <div class="log-viewer">
            <div class="log-header">
              <div class="log-stats">
                <span id="logCount">0 logs</span>
                <span id="logTimeRange"></span>
              </div>
              <div class="log-actions">
                <button id="clearLogsBtn" class="btn btn-sm">Clear</button>
                <button id="exportLogsBtn" class="btn btn-sm">Export</button>
                <label class="checkbox-label">
                  <input type="checkbox" id="autoScrollLogs" checked>
                  Auto-scroll
                </label>
              </div>
            </div>
            <div id="logContainer" class="log-container">
              <div class="log-placeholder">
                No logs to display. Click "Query Logs" or "Start Stream" to begin.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async setupLokiLogViewer(hasLokiPort) {
    // Show warning if Loki port not detected
    if (!hasLokiPort) {
      const notification = document.createElement('div');
      notification.className = 'notification warning';
      notification.innerHTML = `
        <div class="notification-content">
          <strong>⚠️ Loki Port Not Detected</strong><br>
          Port 3022 wasn't found during the network scan for this server.<br>
          <small>Loki may be running on a different system or port. You can still try to connect.</small>
        </div>
        <button onclick="this.parentElement.remove()" class="notification-close">×</button>
      `;
      
      const modalBody = document.querySelector('.log-viewer-modal .modal-body');
      if (modalBody) {
        modalBody.insertBefore(notification, modalBody.firstChild);
      }
    }

    // Load common queries
    try {
      const queriesResult = await this.app.api.lokiGetCommonQueries();
      if (queriesResult.success) {
        const select = document.getElementById('logQuerySelect');
        queriesResult.data.forEach(query => {
          const option = document.createElement('option');
          option.value = query.query;
          option.textContent = query.description;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.warn('Failed to load common queries:', error);
    }

    this.bindLokiEvents();
    this.testLokiConnection();
  }

  bindLokiEvents() {
    // Bind events
    document.getElementById('logQuerySelect').addEventListener('change', (e) => {
      if (e.target.value) {
        document.getElementById('logQuery').value = e.target.value;
      }
    });

    const streamToggle = document.getElementById('streamToggle');
    const queryLogsBtn = document.getElementById('queryLogsBtn');
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    const exportLogsBtn = document.getElementById('exportLogsBtn');

    // Add null checks for all elements
    if (streamToggle) {
      streamToggle.addEventListener('change', () => this.toggleLokiStream());
    }
    if (queryLogsBtn) {
      queryLogsBtn.addEventListener('click', () => this.queryLokiLogs());
    }
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => this.clearLogViewer());
    }
    if (exportLogsBtn) {
      exportLogsBtn.addEventListener('click', () => this.exportLogs());
    }

    // Set up event listeners for log updates
    if (this.app.api.isElectron) {
      window.electronAPI.onLokiLogs((logs) => this.displayLogs(logs));
      window.electronAPI.onLokiError((error) => this.displayLogError(error));
      window.electronAPI.onLokiStreamStarted((data) => this.updateStreamStatus(true));
      window.electronAPI.onLokiStreamStopped(() => this.updateStreamStatus(false));
    }
  }

  async testLokiConnection() {
    if (!this.app.selectedServerIp) {
      const statusElement = document.getElementById('lokiConnectionStatus');
      const statusText = statusElement.querySelector('.status-text');
      statusElement.className = 'connection-status error';
      statusText.textContent = 'Error: No server selected';
      return;
    }
    
    const statusElement = document.getElementById('lokiConnectionStatus');
    const statusText = statusElement.querySelector('.status-text');
    
    statusText.textContent = `Testing connection to ${this.app.selectedServerIp}:3022...`;
    statusElement.className = 'connection-status testing';

    try {
      console.log(`Testing Loki connection to: ${this.app.selectedServerIp}`);
      const result = await this.app.api.lokiTestConnection(this.app.selectedServerIp);
      
      console.log('Loki connection test result:', result);
      if (result.success && result.connected) {
        statusElement.className = 'connection-status connected';
        statusText.textContent = `Connected: ${result.message}`;
      } else {
        statusElement.className = 'connection-status error';
        
        let errorMsg = result.message || 'Connection failed';
        let suggestion = '';
        
        if (errorMsg.includes('Connection failed') || errorMsg.includes('ECONNREFUSED')) {
          suggestion = ' • Check if Loki is running on this server';
        } else if (errorMsg.includes('timeout')) {
          suggestion = ' • Check network connectivity and firewall settings';
        } else if (errorMsg.includes('EHOSTUNREACH')) {
          suggestion = ' • Check if the server is reachable';
        }
        
        statusText.textContent = `Error: ${errorMsg}${suggestion}`;
      }
    } catch (error) {
      console.error('Loki connection test error:', error);
      statusElement.className = 'connection-status error';
      statusText.textContent = `Error: ${error.message}`;
    }
  }

  async queryLokiLogs() {
    const query = document.getElementById('logQuery').value || '{app=~".+"}';
    const limit = parseInt(document.getElementById('logLimit').value) || 100;
    const since = document.getElementById('logSince').value || '1h';

    const queryBtn = document.getElementById('queryLogsBtn');
    queryBtn.disabled = true;
    queryBtn.textContent = 'Querying...';

    try {
      const result = await this.app.api.lokiQueryLogs(this.app.selectedServerIp, query, limit, since);
      
      if (result.success) {
        this.displayLogs(result.data);
      } else {
        this.displayLogError(result.error);
      }
    } catch (error) {
      this.displayLogError(error.message);
    } finally {
      queryBtn.disabled = false;
      queryBtn.textContent = 'Query Logs';
    }
  }

  async toggleLokiStream() {
    const streamToggle = document.getElementById('streamToggle');
    const isStreaming = streamToggle.checked;
    
    if (isStreaming) {
      await this.startLokiStream();
    } else {
      await this.stopLokiStream();
    }
  }

  async startLokiStream() {
    const query = document.getElementById('logQuery').value || '{app=~".+"}';
    const refreshInterval = 2000; // 2 seconds

    const streamToggle = document.getElementById('streamToggle');
    const queryBtn = document.getElementById('queryLogsBtn');
    
    streamToggle.disabled = true;

    try {
      const result = await this.app.api.lokiStartStream(this.app.selectedServerIp, query, refreshInterval);
      
      if (result.success) {
        this.updateStreamStatus(true);
        
        if (queryBtn) {
          queryBtn.disabled = true;
        }
        
        streamToggle.checked = true;
        streamToggle.disabled = false;
      } else {
        this.displayLogError(result.error);
        streamToggle.checked = false;
        streamToggle.disabled = false;
      }
    } catch (error) {
      this.displayLogError(error.message);
      streamToggle.checked = false;
      streamToggle.disabled = false;
    }
  }

  async stopLokiStream() {
    const streamToggle = document.getElementById('streamToggle');
    const queryBtn = document.getElementById('queryLogsBtn');
    
    streamToggle.disabled = true;

    try {
      const result = await this.app.api.lokiStopStream(this.app.selectedServerIp);
      
      if (result.success) {
        this.updateStreamStatus(false);
        
        if (queryBtn) {
          queryBtn.disabled = false;
        }
        
        streamToggle.checked = false;
        streamToggle.disabled = false;
      }
    } catch (error) {
      this.displayLogError(error.message);
    } finally {
      if (streamToggle.disabled) {
        streamToggle.disabled = false;
      }
    }
  }

  updateStreamStatus(isStreaming) {
    const statusElement = document.getElementById('logStreamStatus');
    const indicator = statusElement.querySelector('.stream-indicator');
    const text = statusElement.querySelector('.stream-text');
    
    if (isStreaming) {
      indicator.textContent = '🔴';
      text.textContent = 'Stream: Live';
      statusElement.className = 'stream-status streaming';
    } else {
      indicator.textContent = '⚫';
      text.textContent = 'Stream: Stopped';
      statusElement.className = 'stream-status stopped';
    }
  }

  displayLogs(logs) {
    const container = document.getElementById('logContainer');
    const autoScroll = document.getElementById('autoScrollLogs').checked;
    
    // Remove placeholder if it exists
    const placeholder = container.querySelector('.log-placeholder');
    if (placeholder) {
      placeholder.remove();
    }

    // Add new logs
    logs.forEach(log => {
      const logElement = document.createElement('div');
      logElement.className = `log-entry log-${log.level}`;
      
      const timestamp = new Date(log.timestamp).toLocaleTimeString();
      const labels = Object.entries(log.labels || {})
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      
      logElement.innerHTML = `
        <div class="log-timestamp">${timestamp}</div>
        <div class="log-level log-level-${log.level}">${log.level.toUpperCase()}</div>
        <div class="log-source">${log.source}</div>
        <div class="log-message">${this.app.escapeHtml(log.message)}</div>
        ${labels ? `<div class="log-labels">${labels}</div>` : ''}
      `;
      
      container.appendChild(logElement);
    });

    // Limit the number of displayed logs to prevent memory issues
    const maxLogs = 1000;
    const logEntries = container.querySelectorAll('.log-entry');
    if (logEntries.length > maxLogs) {
      for (let i = 0; i < logEntries.length - maxLogs; i++) {
        logEntries[i].remove();
      }
    }

    // Update stats
    this.updateLogStats();

    // Auto-scroll to bottom
    if (autoScroll) {
      container.scrollTop = container.scrollHeight;
    }
  }

  displayLogError(error) {
    const container = document.getElementById('logContainer');
    const errorElement = document.createElement('div');
    errorElement.className = 'log-entry log-error';
    errorElement.innerHTML = `
      <div class="log-timestamp">${new Date().toLocaleTimeString()}</div>
      <div class="log-level log-level-error">ERROR</div>
      <div class="log-source">SYSTEM</div>
      <div class="log-message">Log Error: ${this.app.escapeHtml(error)}</div>
    `;
    container.appendChild(errorElement);
    
    this.updateLogStats();
  }

  updateLogStats() {
    const container = document.getElementById('logContainer');
    const logEntries = container.querySelectorAll('.log-entry:not(.log-error)');
    const countElement = document.getElementById('logCount');
    
    countElement.textContent = `${logEntries.length} logs`;
    
    // Update time range if we have logs
    if (logEntries.length > 0) {
      const firstTimestamp = logEntries[0].querySelector('.log-timestamp').textContent;
      const lastTimestamp = logEntries[logEntries.length - 1].querySelector('.log-timestamp').textContent;
      
      const timeRangeElement = document.getElementById('logTimeRange');
      if (firstTimestamp !== lastTimestamp) {
        timeRangeElement.textContent = `${firstTimestamp} - ${lastTimestamp}`;
      } else {
        timeRangeElement.textContent = firstTimestamp;
      }
    }
  }

  clearLogViewer() {
    const container = document.getElementById('logContainer');
    container.innerHTML = '<div class="log-placeholder">Logs cleared. Click "Query Logs" or "Start Stream" to begin.</div>';
    this.updateLogStats();
  }

  exportLogs() {
    const container = document.getElementById('logContainer');
    const logEntries = container.querySelectorAll('.log-entry:not(.log-error)');
    
    if (logEntries.length === 0) {
      alert('No logs to export');
      return;
    }

    const logs = Array.from(logEntries).map(entry => {
      const timestamp = entry.querySelector('.log-timestamp').textContent;
      const level = entry.querySelector('.log-level').textContent;
      const source = entry.querySelector('.log-source').textContent;
      const message = entry.querySelector('.log-message').textContent;
      const labels = entry.querySelector('.log-labels')?.textContent || '';
      
      return {
        timestamp,
        level,
        source,
        message,
        labels
      };
    });

    const jsonContent = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `watchout-logs-${this.app.selectedServerIp}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LokiLogManager;
} else {
  window.LokiLogManager = LokiLogManager;
}

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {  scanForWatchoutServers: () => ipcRenderer.invoke('scan-for-watchout-servers'),
  clearOfflineServers: () => ipcRenderer.invoke('clear-offline-servers'),
  addManualServer: (serverData) => ipcRenderer.invoke('add-manual-server', serverData),
  updateManualServer: (serverId, serverData) => ipcRenderer.invoke('update-manual-server', serverId, serverData),
  removeManualServer: (serverId) => ipcRenderer.invoke('remove-manual-server', serverId),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    // Settings API
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  saveAppSettings: (settings) => ipcRenderer.invoke('save-app-settings', settings),
  getWebServerStatus: () => ipcRenderer.invoke('get-web-server-status'),
  getCacheFileLocation: () => ipcRenderer.invoke('get-cache-file-location'),
  
  // Web Server Control
  stopWebServer: () => ipcRenderer.invoke('stop-web-server'),
  restartWebServer: () => ipcRenderer.invoke('restart-web-server'),
  // Watchout Commands API
  watchout: {
    testConnection: (serverIp) => ipcRenderer.invoke('watchout-test-connection', serverIp),
    getStatus: (serverIp) => ipcRenderer.invoke('watchout-get-status', serverIp),
    getShow: (serverIp) => ipcRenderer.invoke('watchout-get-show', serverIp),
    saveShow: (serverIp) => ipcRenderer.invoke('watchout-save-show', serverIp),
    uploadShow: (serverIp, showName) => ipcRenderer.invoke('watchout-upload-show', serverIp, showName),
    getTimelines: (serverIp) => ipcRenderer.invoke('watchout-get-timelines', serverIp),
    playTimeline: (serverIp, timelineId) => ipcRenderer.invoke('watchout-play-timeline', serverIp, timelineId),
    pauseTimeline: (serverIp, timelineId) => ipcRenderer.invoke('watchout-pause-timeline', serverIp, timelineId),
    stopTimeline: (serverIp, timelineId) => ipcRenderer.invoke('watchout-stop-timeline', serverIp, timelineId),
    jumpToTime: (serverIp, timelineId, time, state) => ipcRenderer.invoke('watchout-jump-to-time', serverIp, timelineId, time, state),
    jumpToCue: (serverIp, timelineId, cueId, state) => ipcRenderer.invoke('watchout-jump-to-cue', serverIp, timelineId, cueId, state),
    sendInputs: (serverIp, inputs) => ipcRenderer.invoke('watchout-send-inputs', serverIp, inputs),
  getCommonCommands: (serverIp) => ipcRenderer.invoke('watchout-get-common-commands', serverIp),
    sendCustomRequest: (serverIp, endpoint, method, data) => ipcRenderer.invoke('watchout-send-custom-request', serverIp, endpoint, method, data)
  },
  
  // Startup checks API
  performStartupChecks: () => ipcRenderer.invoke('perform-startup-checks'),
  dismissStartupWarning: (warningType) => ipcRenderer.invoke('dismiss-startup-warning', warningType),
    // Event listeners for main process messages
  onStartupWarning: (callback) => {
    ipcRenderer.on('startup-warning', (event, notification) => callback(notification));
  },  onWebServerError: (callback) => {
    ipcRenderer.on('web-server-error', (event, error) => callback(error));
  },
  onWindowStateChanged: (callback) => {
    ipcRenderer.on('window-state-changed', (event, state) => callback(state));
  },
  
  // Window controls API
  windowControls: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    unmaximize: () => ipcRenderer.invoke('window-unmaximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
    onUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
    onMaximizeChange: (callback) => {
      ipcRenderer.on('window-maximized', () => callback(true));
      ipcRenderer.on('window-unmaximized', () => callback(false));
    }
  },
  
  // Test method for startup warnings (remove after testing)
  testStartupWarning: () => ipcRenderer.invoke('test-startup-warning'),

  // For development purposes
  openDevTools: () => ipcRenderer.invoke('open-dev-tools'),

  // Loki Log API
  lokiTestConnection: (serverIp) => ipcRenderer.invoke('loki-test-connection', serverIp),
  lokiQueryLogs: (serverIp, query, limit, since) => ipcRenderer.invoke('loki-query-logs', serverIp, query, limit, since),
  lokiStartStream: (serverIp, query, refreshInterval) => ipcRenderer.invoke('loki-start-stream', serverIp, query, refreshInterval),
  lokiStopStream: () => ipcRenderer.invoke('loki-stop-stream'),
  lokiGetLabels: (serverIp) => ipcRenderer.invoke('loki-get-labels', serverIp),
  lokiGetLabelValues: (serverIp, label) => ipcRenderer.invoke('loki-get-label-values', serverIp, label),
  lokiGetCommonQueries: () => ipcRenderer.invoke('loki-get-common-queries'),

  // Loki event listeners
  onLokiLogs: (callback) => {
    ipcRenderer.on('loki-logs', (event, logs) => callback(logs));
  },
  onLokiError: (callback) => {
    ipcRenderer.on('loki-error', (event, error) => callback(error));
  },
  onLokiStreamStarted: (callback) => {
    ipcRenderer.on('loki-stream-started', (event, data) => callback(data));
  },
  onLokiStreamStopped: (callback) => {
    ipcRenderer.on('loki-stream-stopped', (event) => callback());
  },
});

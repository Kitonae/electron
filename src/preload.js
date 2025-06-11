const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  scanForWatchoutServers: () => ipcRenderer.invoke('scan-for-watchout-servers'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    // Watchout Commands API
  watchout: {
    testConnection: (serverIp) => ipcRenderer.invoke('watchout-test-connection', serverIp),
    getStatus: (serverIp) => ipcRenderer.invoke('watchout-get-status', serverIp),
    getShow: (serverIp) => ipcRenderer.invoke('watchout-get-show', serverIp),
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
  
  // For development purposes
  openDevTools: () => ipcRenderer.invoke('open-dev-tools')
});

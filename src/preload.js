const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  scanForWatchoutServers: () => ipcRenderer.invoke('scan-for-watchout-servers'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // For development purposes
  openDevTools: () => ipcRenderer.invoke('open-dev-tools')
});

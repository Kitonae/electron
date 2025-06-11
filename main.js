const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { findWatchoutServers } = require('./src/network-scanner');
const WatchoutCommands = require('./src/watchout-commands');

let mainWindow;
const watchoutCommands = new WatchoutCommands();

function createWindow() {  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 800,
    minWidth: 1600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'src', 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false
  });

  // Load the app
  mainWindow.loadFile('src/index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('scan-for-watchout-servers', async () => {
  try {
    const servers = await findWatchoutServers();
    return { success: true, servers };
  } catch (error) {
    console.error('Error scanning for Watchout servers:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Watchout Commands IPC handlers
ipcMain.handle('watchout-test-connection', async (event, serverIp) => {
  try {
    return await watchoutCommands.testConnection(serverIp);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-get-status', async (event, serverIp) => {
  try {
    return await watchoutCommands.getPlaybackStatus(serverIp);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-get-show', async (event, serverIp) => {
  try {
    return await watchoutCommands.getCurrentShow(serverIp);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-get-timelines', async (event, serverIp) => {
  try {
    return await watchoutCommands.getTimelines(serverIp);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-play-timeline', async (event, serverIp, timelineId = 0) => {
  try {
    return await watchoutCommands.playTimeline(serverIp, timelineId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-pause-timeline', async (event, serverIp, timelineId = 0) => {
  try {
    return await watchoutCommands.pauseTimeline(serverIp, timelineId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-stop-timeline', async (event, serverIp, timelineId = 0) => {
  try {
    return await watchoutCommands.stopTimeline(serverIp, timelineId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-jump-to-time', async (event, serverIp, timelineId, time, state = 'pause') => {
  try {
    return await watchoutCommands.jumpToTime(serverIp, timelineId, time, state);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-jump-to-cue', async (event, serverIp, timelineId, cueId, state = 'pause') => {
  try {
    return await watchoutCommands.jumpToCue(serverIp, timelineId, cueId, state);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-send-inputs', async (event, serverIp, inputs) => {
  try {
    return await watchoutCommands.sendInputs(serverIp, inputs);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-get-common-commands', async (event, serverIp) => {
  try {
    return { success: true, commands: watchoutCommands.getCommonCommands(serverIp) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('watchout-send-custom-request', async (event, serverIp, endpoint, method, data) => {
  try {
    return await watchoutCommands.sendCustomRequest(serverIp, endpoint, method, data);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

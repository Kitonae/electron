const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { findWatchoutServers, clearOfflineServers } = require('./src/network-scanner');
const WatchoutCommands = require('./src/watchout-commands');
const WebServer = require('./src/web-server');
const StartupChecker = require('./src/startup-checker');

let mainWindow;
let webServer;
let startupChecker;
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
app.whenReady().then(async () => {
  // Initialize startup checker
  startupChecker = new StartupChecker();
  
  createWindow();
  
  // Perform startup checks
  try {
    const checkResult = await startupChecker.performStartupChecks(3080);
    const notification = startupChecker.createStartupNotification(checkResult);
    
    if (notification) {
      // Send startup notification to renderer when window is ready
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('startup-warning', notification);
      });
    }
  } catch (error) {
    console.warn('Startup checks failed:', error);
  }
  
  // Start web server for browser access
  webServer = new WebServer();
  webServer.start().then(() => {
    console.log('Web server started successfully');
  }).catch(error => {
    console.error('Failed to start web server:', error);
    
    // Send web server error to renderer
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('web-server-error', {
        type: 'start-failed',
        message: error.message
      });
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Stop web server when quitting
    if (webServer) {
      webServer.stop();
    }
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

ipcMain.handle('clear-offline-servers', async () => {
  try {
    const result = await clearOfflineServers();
    return result;
  } catch (error) {
    console.error('Error clearing offline servers:', error);
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

// Settings IPC handlers
ipcMain.handle('get-app-settings', async () => {
  try {
    // In a real app, you'd load from a config file or store
    // For now, we'll return default settings
    return {
      enableCacheFromDisk: true,
      enableWebServer: true
    };
  } catch (error) {
    console.error('Error getting app settings:', error);
    return { enableCacheFromDisk: true, enableWebServer: true };
  }
});

ipcMain.handle('save-app-settings', async (event, settings) => {
  try {
    console.log('Saving app settings:', settings);
    
    // Handle web server enable/disable
    if (settings.enableWebServer !== undefined) {
      if (settings.enableWebServer && !webServer.isRunning()) {
        await webServer.start();
        console.log('Web server started due to settings change');
      } else if (!settings.enableWebServer && webServer.isRunning()) {
        await webServer.stop();
        console.log('Web server stopped due to settings change');
      }
    }
    
    // In a real app, you'd save to a config file or store
    // For now, we'll just log the settings
    console.log('Settings saved successfully');
    
    return { success: true };
  } catch (error) {
    console.error('Error saving app settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-web-server-status', async () => {
  try {
    return {
      running: webServer && webServer.isRunning(),
      port: webServer ? webServer.getPort() : null
    };
  } catch (error) {
    console.error('Error getting web server status:', error);
    return { running: false, port: null };
  }
});

ipcMain.handle('get-cache-file-location', async () => {
  try {
    // This would ideally come from the network scanner instance
    // For now, return a placeholder
    const os = require('os');
    const path = require('path');
    return path.join(os.homedir(), 'AppData', 'Roaming', 'watchout-assistant', 'watchout-assistant-cache.json');
  } catch (error) {
    console.error('Error getting cache file location:', error);
    return 'Unknown location';
  }
});

// Web Server Control IPC handlers
ipcMain.handle('stop-web-server', async () => {
  try {
    if (webServer && webServer.isRunning()) {
      await webServer.stop();
      console.log('Web server stopped manually');
      return { success: true };
    } else {
      return { success: false, error: 'Web server is not running' };
    }
  } catch (error) {
    console.error('Error stopping web server:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('restart-web-server', async () => {
  try {
    if (webServer) {
      // Stop if running
      if (webServer.isRunning()) {
        await webServer.stop();
        console.log('Web server stopped for restart');
      }
      
      // Start again
      await webServer.start();
      console.log('Web server restarted manually');
      return { success: true };
    } else {
      // Create new instance if needed
      webServer = new WebServer();
      await webServer.start();
      console.log('Web server started manually');
      return { success: true };
    }
  } catch (error) {
    console.error('Error restarting web server:', error);
    return { success: false, error: error.message };
  }
});

// Startup check IPC handlers
ipcMain.handle('perform-startup-checks', async () => {
  try {
    if (!startupChecker) {
      startupChecker = new StartupChecker();
    }
    const checkResult = await startupChecker.performStartupChecks(3080);
    return { success: true, result: checkResult };
  } catch (error) {
    console.error('Error performing startup checks:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dismiss-startup-warning', async (event, warningType) => {
  try {
    // Log that warning was dismissed
    console.log('Startup warning dismissed:', warningType);
    return { success: true };
  } catch (error) {
    console.error('Error dismissing startup warning:', error);
    return { success: false, error: error.message };
  }
});

// Development helper
ipcMain.handle('open-dev-tools', () => {
  if (mainWindow) {
    mainWindow.webContents.openDevTools();
  }
});

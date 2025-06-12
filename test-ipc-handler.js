// Test IPC handler to force show startup warning
// Add this to main.js temporarily for testing

ipcMain.handle('test-startup-warning', async () => {
  try {
    const testNotification = {
      type: 'watchout-running',
      title: 'TEST: Watchout Software Detected',
      message: 'This is a test warning. The following Watchout processes are running: TestProcess1, TestProcess2. This may interfere with the WATCHOUT Assistant.',
      icon: '⚠️',
      actions: [
        { id: 'refresh', label: 'Refresh Check', primary: true },
        { id: 'continue', label: 'Continue Anyway', secondary: true }
      ],
      severity: 'warning'
    };
    
    console.log('Sending test startup warning to renderer...');
    mainWindow.webContents.send('startup-warning', testNotification);
    return { success: true };
  } catch (error) {
    console.error('Error sending test startup warning:', error);
    return { success: false, error: error.message };
  }
});

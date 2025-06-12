// Test script to trigger startup warning modal
// This can be run in the DevTools console to test the modal

// Test notification data
const testNotification = {
  type: 'watchout-running',
  title: 'Test Startup Warning',
  message: 'This is a test warning to verify the modal is working correctly.',
  icon: '⚠️',
  actions: [
    { id: 'refresh', label: 'Refresh Check', primary: true },
    { id: 'continue', label: 'Continue Anyway', secondary: true }
  ],
  severity: 'warning'
};

// Show the startup warning modal
if (typeof app !== 'undefined' && app.showStartupWarning) {
  app.showStartupWarning(testNotification);
  console.log('Test startup warning modal triggered');
} else {
  console.error('App instance not found or showStartupWarning method not available');
}

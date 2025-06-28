// Global teardown - runs once after all tests
module.exports = async () => {
  console.log('Tearing down test environment...');
  
  // Clean up any global resources
  if (global.gc) {
    global.gc();
  }
};

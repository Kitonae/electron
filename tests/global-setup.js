// Global setup - runs once before all tests
module.exports = async () => {
  console.log('Setting up test environment...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.ELECTRON_IS_DEV = 'true';
  
  // Global setup doesn't have access to jest, mocking will be done in setup.js
};

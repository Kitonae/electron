// Simple test script to simulate a Watchout process
// This helps test the startup warning system

console.log('Simulating Watchout process...');
console.log('Process name:', process.argv[0]);

// Keep the process running
setInterval(() => {
  console.log('Watchout simulation running...');
}, 5000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down Watchout simulation...');
  process.exit(0);
});

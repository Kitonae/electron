/**
 * Module Test Script
 * Tests if all modules can be loaded correctly
 */

console.log('Testing module loading...');

// Test if modules are available
const modules = [
  'BaseApp',
  'EventManager', 
  'ScanManager',
  'UIManager',
  'CommandManager',
  'ModalManager',
  'ServerManager',
  'LokiLogManager',
  'StartupManager'
];

const missingModules = [];
const loadedModules = [];

modules.forEach(moduleName => {
  if (typeof window[moduleName] !== 'undefined') {
    loadedModules.push(moduleName);
    console.log(`✓ ${moduleName} loaded successfully`);
  } else {
    missingModules.push(moduleName);
    console.error(`✗ ${moduleName} not found`);
  }
});

console.log(`\nModule Loading Summary:`);
console.log(`✓ Loaded: ${loadedModules.length}/${modules.length}`);
console.log(`✗ Missing: ${missingModules.length}/${modules.length}`);

if (missingModules.length > 0) {
  console.error('Missing modules:', missingModules);
} else {
  console.log('All modules loaded successfully!');
  
  // Test basic instantiation
  try {
    const baseApp = new BaseApp();
    console.log('✓ BaseApp can be instantiated');
    
    // Test manager instantiation with mock app
    const mockApp = { api: null };
    const eventManager = new EventManager(mockApp);
    console.log('✓ EventManager can be instantiated');
    
    const scanManager = new ScanManager(mockApp);
    console.log('✓ ScanManager can be instantiated');
    
    console.log('\n🎉 Modular architecture test passed!');
  } catch (error) {
    console.error('❌ Module instantiation failed:', error);
  }
}

/**
 * WatchoutServerFinderApp - Refactored main application class
 * This is the main application class that coordinates all the modules
 */
class WatchoutServerFinderApp extends BaseApp {
  constructor() {
    super();
    
    // Don't initialize manager modules in constructor
    // They will be initialized in initializeApp() after DOM is ready
    this.eventManager = null;
    this.scanManager = null;
    this.uiManager = null;
    this.commandManager = null;
    this.modalManager = null;
    this.serverManager = null;
    this.lokiLogManager = null;
    this.startupManager = null;
  }

  // Override the initializeApp method to include module initialization
  async initializeApp() {
    try {
      console.log('Initializing modules...');
      
      // Initialize all manager modules after base app is ready
      this.eventManager = new EventManager(this);
      console.log('EventManager initialized');
      
      this.scanManager = new ScanManager(this);
      console.log('ScanManager initialized');
      
      this.uiManager = new UIManager(this);
      console.log('UIManager initialized');
      
      this.commandManager = new CommandManager(this);
      console.log('CommandManager initialized');
      
      this.modalManager = new ModalManager(this);
      console.log('ModalManager initialized');
      
      this.serverManager = new ServerManager(this);
      console.log('ServerManager initialized');
      
      this.lokiLogManager = new LokiLogManager(this);
      console.log('LokiLogManager initialized');
      
      this.startupManager = new StartupManager(this);
      console.log('StartupManager initialized');
      
      // Call the base class initializeApp
      await super.initializeApp();
      
      console.log('All modules initialized successfully');
      
    } catch (error) {
      console.error('Module initialization failed:', error);
      throw error;
    }
  }

  // Override base class method to include event binding
  bindEvents() {
    if (this.eventManager) {
      this.eventManager.bindEvents();
    }
  }

  // Delegate methods to appropriate managers
  // Scanning Methods
  startBackgroundScanning() {
    if (this.scanManager) {
      this.scanManager.startBackgroundScanning();
    }
  }

  stopBackgroundScanning() {
    if (this.scanManager) {
      this.scanManager.stopBackgroundScanning();
    }
  }

  async performBackgroundScan() {
    if (this.scanManager) {
      return await this.scanManager.performBackgroundScan();
    }
  }

  async startManualScan() {
    if (this.scanManager) {
      return await this.scanManager.startManualScan();
    }
  }

  async clearOfflineServers() {
    if (this.scanManager) {
      return await this.scanManager.clearOfflineServers();
    }
  }

  updateScanButton() {
    if (this.scanManager) {
      this.scanManager.updateScanButton();
    }
  }

  // UI Methods
  updateUI() {
    if (this.uiManager) {
      this.uiManager.updateUI();
    }
  }

  updateServerCounts() {
    if (this.uiManager) {
      this.uiManager.updateServerCounts();
    }
  }

  updateClearOfflineButtonState() {
    if (this.uiManager) {
      this.uiManager.updateClearOfflineButtonState();
    }
  }

  updateScanStatus(message) {
    if (this.uiManager) {
      this.uiManager.updateScanStatus(message);
    }
  }

  updateConnectionStatus(connected, message) {
    if (this.uiManager) {
      this.uiManager.updateConnectionStatus(connected, message);
    }
  }

  updateCommandButtonStates() {
    if (this.uiManager) {
      this.uiManager.updateCommandButtonStates();
    }
  }

  renderStatusVisualization(statusData) {
    if (this.uiManager) {
      return this.uiManager.renderStatusVisualization(statusData);
    }
  }

  // Command Methods
  async executeCommand(commandType) {
    if (this.commandManager) {
      return await this.commandManager.executeCommand(commandType);
    }
  }

  async testApiConnection(server) {
    if (this.commandManager) {
      return await this.commandManager.testApiConnection(server);
    }
  }

  setCommandButtonLoading(commandType, loading) {
    if (this.commandManager) {
      this.commandManager.setCommandButtonLoading(commandType, loading);
    }
  }

  addCommandResponse(type, command, result) {
    if (this.commandManager) {
      this.commandManager.addCommandResponse(type, command, result);
    }
  }

  getCommandDisplayName(command) {
    if (this.commandManager) {
      return this.commandManager.getCommandDisplayName(command);
    }
  }

  clearCommandResponse() {
    if (this.commandManager) {
      this.commandManager.clearCommandResponse();
    }
  }

  getSelectedTimelineId() {
    if (this.commandManager) {
      return this.commandManager.getSelectedTimelineId();
    }
  }

  populateTimelineSelector(timelinesData) {
    if (this.commandManager) {
      this.commandManager.populateTimelineSelector(timelinesData);
    }
  }

  resetTimelineSelector() {
    if (this.commandManager) {
      this.commandManager.resetTimelineSelector();
    }
  }

  onTimelineSelectionChange() {
    if (this.commandManager) {
      this.commandManager.onTimelineSelectionChange();
    }
  }

  // Window Controls Methods
  bindWindowControls() {
    if (this.eventManager) {
      this.eventManager.bindWindowControls();
    }
  }

  async updateMaximizeButton() {
    if (this.eventManager) {
      return await this.eventManager.updateMaximizeButton();
    }
  }

  updateMaximizeButtonState(isMaximized) {
    if (this.eventManager) {
      this.eventManager.updateMaximizeButtonState(isMaximized);
    }
  }

  bindCommandEvents() {
    if (this.eventManager) {
      this.eventManager.bindCommandEvents();
    }
  }

  // Modal Methods
  showSettingsDialog() {
    if (this.modalManager) {
      this.modalManager.showSettingsDialog();
    }
  }

  showAddServerDialog() {
    if (this.modalManager) {
      this.modalManager.showAddServerDialog();
    }
  }

  bindAddServerModal() {
    if (this.modalManager) {
      this.modalManager.bindAddServerModal();
    }
  }

  showCustomCommandDialog() {
    if (this.modalManager) {
      this.modalManager.showCustomCommandDialog();
    }
  }

  bindCustomCommandModal() {
    if (this.modalManager) {
      this.modalManager.bindCustomCommandModal();
    }
  }

  async executeCustomCommand() {
    if (this.modalManager) {
      return await this.modalManager.executeCustomCommand();
    }
  }

  async sendCustomWatchoutRequest(endpoint, method, data) {
    if (this.modalManager) {
      return await this.modalManager.sendCustomWatchoutRequest(endpoint, method, data);
    }
  }

  // Server Management Methods
  async selectServer(serverId, serverIp) {
    if (this.serverManager) {
      return await this.serverManager.selectServer(serverId, serverIp);
    }
  }

  updateCommandsPanelHeader(serverId) {
    if (this.serverManager) {
      this.serverManager.updateCommandsPanelHeader(serverId);
    }
  }

  async addManualServer() {
    if (this.serverManager) {
      return await this.serverManager.addManualServer();
    }
  }

  async updateManualServer(serverId) {
    if (this.serverManager) {
      return await this.serverManager.updateManualServer(serverId);
    }
  }

  editManualServer(serverId) {
    if (this.serverManager) {
      this.serverManager.editManualServer(serverId);
    }
  }

  async removeManualServer(serverId) {
    if (this.serverManager) {
      return await this.serverManager.removeManualServer(serverId);
    }
  }

  hideStatusInformation() {
    if (this.serverManager) {
      this.serverManager.hideStatusInformation();
    }
  }

  updateServerDetailsWithStatus(statusResult) {
    if (this.serverManager) {
      this.serverManager.updateServerDetailsWithStatus(statusResult);
    }
  }

  // Loki Log Management Methods
  showLokiLogViewer() {
    if (this.lokiLogManager) {
      this.lokiLogManager.showLokiLogViewer();
    }
  }

  // Startup Management Methods
  initializeStartupWarnings() {
    if (this.startupManager) {
      this.startupManager.initializeStartupWarnings();
    }
  }

  showStartupWarning(notification) {
    if (this.startupManager) {
      this.startupManager.showStartupWarning(notification);
    }
  }

  async handleStartupWarningAction(actionId, notification) {
    if (this.startupManager) {
      return await this.startupManager.handleStartupWarningAction(actionId, notification);
    }
  }

  hideStartupWarning() {
    if (this.startupManager) {
      this.startupManager.hideStartupWarning();
    }
  }

  async performStartupChecksManually() {
    if (this.startupManager) {
      return await this.startupManager.performStartupChecksManually();
    }
  }

  async performStartupDiagnostics() {
    if (this.startupManager) {
      return await this.startupManager.performStartupDiagnostics();
    }
  }

  // Cleanup method
  cleanup() {
    this.stopBackgroundScanning();
    
    // Cancel any ongoing connection tests
    if (this.connectionTestAbortController) {
      this.connectionTestAbortController.abort();
    }
    
    // Clear any timeouts
    if (this.connectionTestTimeoutId) {
      clearTimeout(this.connectionTestTimeoutId);
    }
    
    if (this.statusUpdateTimeout) {
      clearTimeout(this.statusUpdateTimeout);
    }
  }
}

// Initialize the app when DOM is ready
let app;

document.addEventListener('DOMContentLoaded', () => {
  try {
    console.log('DOM loaded, initializing app...');
    app = new WatchoutServerFinderApp();
    console.log('WatchoutServerFinderApp constructor completed');
    
    // Initialize the app after construction
    app.initializeApp().then(() => {
      console.log('WatchoutServerFinderApp initialized successfully');
      // Export for global access after successful initialization
      window.app = app;
    }).catch(error => {
      console.error('App initialization failed:', error);
      app.handleInitializationError(error);
    });
    
  } catch (error) {
    console.error('Failed to create WatchoutServerFinderApp:', error);
    // Show error message to user
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: fixed; top: 20px; left: 20px; background: #ff4444; color: white; padding: 10px; border-radius: 5px; z-index: 9999;';
    errorDiv.textContent = 'Application failed to start. Please restart the application.';
    document.body.appendChild(errorDiv);
  }
});

// Handle app cleanup on window unload
window.addEventListener('beforeunload', () => {
  if (app && typeof app.cleanup === 'function') {
    app.cleanup();
  }
});

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

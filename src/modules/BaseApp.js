/**
 * BaseApp - Core application initialization and lifecycle management
 */
class BaseApp {
  constructor() {
    this.servers = [];
    this.isScanning = false;
    this.scanInterval = null;
    this.backgroundScanEnabled = true;
    this.scanIntervalMs = 30000; // 30 seconds
    this.selectedServerId = null;
    this.selectedServerIp = null;
    this.apiConnectionStatus = false;
    this.serverCommandStates = new Map();
    this.availableTimelines = [];
    this.connectionTestTimeout = 8000;
    this.connectionTestAbortController = null;
    this.lastServerSelectTime = null;
    this.connectionTestTimeoutId = null;
    this.statusUpdateTimeout = null;

    // Initialize API adapter
    try {
      this.api = new ApiAdapter();
    } catch (error) {
      console.error('Failed to initialize API adapter:', error);
      this.api = null;
    }
  }

  async initializeApp() {
    try {
      console.log('Starting app initialization...');
      
      // Step 1: Bind basic events first
      this.bindEvents();
      console.log('Events bound successfully');

      // Step 2: Load app version (with timeout)
      try {
        await Promise.race([
          this.loadAppVersion(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        console.log('App version loaded');
      } catch (error) {
        console.warn('Failed to load app version:', error);
      }

      // Step 3: Initialize startup warnings
      this.initializeStartupWarnings();

      // Step 4: Ensure UI elements are ready
      await this.waitForDOMElements();

      // Step 5: Setup UI with delays
      setTimeout(() => {
        this.ensureFooterVisibility();
      }, 100);

      setTimeout(() => {
        this.bindWindowControls();
        this.updateMaximizeButton();
      }, 200);

      // Step 6: Update UI and start scanning
      this.updateUI();
      
      // Step 7: Start background scanning (with delay)
      setTimeout(() => {
        this.startBackgroundScanning();
      }, 500);

      console.log('App initialization completed successfully');
    } catch (error) {
      console.error('App initialization failed:', error);
      throw error;
    }
  }

  async loadAppVersion() {
    try {
      if (this.api) {
        const version = await this.api.getAppVersion();
        const versionElement = document.getElementById("appVersion");
        if (versionElement && version) {
          versionElement.textContent = `v${version}`;
        }
      }
    } catch (error) {
      console.error("Error loading app version:", error);
    }
  }

  ensureFooterVisibility() {
    const footer = document.querySelector(".footer");
    if (footer) {
      footer.style.display = "flex";
      footer.style.justifyContent = "space-between";
      footer.style.alignItems = "center";
      footer.style.padding = "10px 20px";
      footer.style.backgroundColor = "#2d2d30";
      footer.style.borderTop = "1px solid #3e3e42";
      footer.style.position = "fixed";
      footer.style.bottom = "0";
      footer.style.left = "0";
      footer.style.right = "0";
      footer.style.zIndex = "1000";

      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.style.paddingBottom = "60px";
      }

      const appMain = document.querySelector(".app-main");
      if (appMain) {
        appMain.style.paddingBottom = "60px";
      }
    }
  }

  async waitForDOMElements() {
    const requiredElements = [
      'scanButton',
      'serverList',
      'serversContainer',
      'settingsButton'
    ];

    const maxAttempts = 50; // 5 seconds total
    let attempts = 0;

    while (attempts < maxAttempts) {
      const missingElements = requiredElements.filter(id => !document.getElementById(id));
      
      if (missingElements.length === 0) {
        console.log('All required DOM elements found');
        return;
      }

      console.log(`Waiting for DOM elements: ${missingElements.join(', ')}`);
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    throw new Error(`Required DOM elements not found: ${requiredElements.filter(id => !document.getElementById(id)).join(', ')}`);
  }

  handleInitializationError(error) {
    // Show error message in UI
    const container = document.getElementById('serversContainer');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #ff4444;">
          <h3>Application Startup Error</h3>
          <p>The application failed to initialize properly.</p>
          <p>Error: ${error.message}</p>
          <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px;">
            Restart Application
          </button>
        </div>
      `;
    }
  }

  cleanup() {
    // Override in subclasses
  }

  // Utility methods
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getServerId(server) {
    return `${server.ip}_${server.ports?.join('_') || 'no_ports'}`;
  }

  getSimplifiedServerType(server) {
    // Simplify server types for sidebar display
    if (server.type.includes("Production")) return "Production";
    if (server.type.includes("Director")) return "Director";
    if (server.type.includes("Display")) return "Display";
    if (server.type.includes("Asset Manager")) return "Asset Manager";
    if (server.type.includes("Watchout")) return "Watchout Server";
    return "Server";
  }

  isValidIpAddress(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaseApp;
} else {
  window.BaseApp = BaseApp;
}

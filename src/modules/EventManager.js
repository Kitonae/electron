/**
 * EventManager - Handles all event binding and window controls
 */
class EventManager {
  constructor(app) {
    this.app = app;
  }

  bindEvents() {
    try {
      this.bindScanEvents();
      this.bindServerEvents();
      this.bindCommandEvents();
      this.bindModalEvents();
      console.log('All events bound successfully');
    } catch (error) {
      console.error('Error binding events:', error);
    }
  }

  bindScanEvents() {
    const scanButton = document.getElementById("scanButton");
    if (scanButton) {
      scanButton.addEventListener("click", () => this.app.startManualScan());
    }

    const clearOfflineButton = document.getElementById("clearOfflineButton");
    if (clearOfflineButton) {
      clearOfflineButton.addEventListener("click", () => this.app.clearOfflineServers());
    }
  }

  bindServerEvents() {
    const addServerButton = document.getElementById("addServerButton");
    if (addServerButton) {
      addServerButton.addEventListener("click", () => this.app.showAddServerDialog());
    }
  }

  bindCommandEvents() {
    const timelineSelector = document.getElementById('timelineSelector');
    if (timelineSelector) {
      timelineSelector.addEventListener('change', () => this.app.onTimelineSelectionChange());
    }

    // Bind command buttons - support both Tailwind and Modular HTML versions
    const commandButtons = [
      // Tailwind version IDs
      { id: 'playBtn', command: 'run' },
      { id: 'pauseBtn', command: 'pause' },
      { id: 'stopBtn', command: 'halt' },
      { id: 'statusBtn', command: 'getStatus' },
      { id: 'timelinesBtn', command: 'getTimelines' },
      // Modular version IDs
      { id: 'startTimelineBtn', command: 'run' },
      { id: 'pauseTimelineBtn', command: 'pause' },
      { id: 'stopTimelineBtn', command: 'halt' },
      { id: 'standByBtn', command: 'standBy' },
      { id: 'onlineBtn', command: 'online' },
      { id: 'loadBtn', command: 'load' },
      { id: 'gotoTimeBtn', command: 'gotoTime' },
      { id: 'getTimelinesBtn', command: 'getTimelines' },
      { id: 'customBtn', command: 'custom' },
      { id: 'lokiLogViewerBtn', command: 'lokiLogViewer' }
    ];

    commandButtons.forEach(({ id, command }) => {
      const button = document.getElementById(id);
      if (button) {
        if (command === "custom") {
          button.addEventListener("click", () => this.app.showCustomCommandDialog());
        } else if (command === "lokiLogViewer") {
          button.addEventListener("click", () => this.app.showLokiLogViewer());
        } else {
          button.addEventListener('click', (e) => {
            e.preventDefault();
            this.app.executeCommand(command);
          });
        }
        console.log(`Bound event for ${id}`);
      } else {
        console.log(`Button with ID ${id} not found (this is normal if using different HTML version)`);
      }
    });

    // Bind clear response button
    const clearResponseBtn = document.getElementById('clearResponseBtn');
    if (clearResponseBtn) {
      clearResponseBtn.addEventListener('click', () => this.app.clearCommandResponse());
    }
  }

  bindModalEvents() {
    const settingsButton = document.getElementById("settingsButton");
    if (settingsButton) {
      settingsButton.addEventListener("click", () => this.app.showSettingsDialog());
    }

    // Settings modal buttons
    const saveSettingsButton = document.getElementById("saveSettingsButton");
    if (saveSettingsButton) {
      saveSettingsButton.addEventListener("click", () => {
        // Save settings logic would go here
        console.log("Save settings clicked");
      });
    }

    const cancelSettingsButton = document.getElementById("cancelSettingsButton");
    if (cancelSettingsButton) {
      cancelSettingsButton.addEventListener("click", () => {
        document.getElementById("settingsModal").classList.add("hidden");
      });
    }

    // Add server modal buttons
    const addServerSubmitButton = document.getElementById("addServerSubmitButton");
    if (addServerSubmitButton) {
      addServerSubmitButton.addEventListener("click", () => this.app.addManualServer());
    }

    const cancelAddServerButton = document.getElementById("cancelAddServerButton");
    if (cancelAddServerButton) {
      cancelAddServerButton.addEventListener("click", () => {
        document.getElementById("addServerModal").classList.add("hidden");
      });
    }

    // Custom command modal buttons
    const executeCustomCommandButton = document.getElementById("executeCustomCommandButton");
    if (executeCustomCommandButton) {
      executeCustomCommandButton.addEventListener("click", () => this.app.executeCustomCommand());
    }

    const cancelCustomCommandButton = document.getElementById("cancelCustomCommandButton");
    if (cancelCustomCommandButton) {
      cancelCustomCommandButton.addEventListener("click", () => {
        document.getElementById("customCommandModal").classList.add("hidden");
      });
    }

    const testStartupWarningButton = document.getElementById("testStartupWarningButton");
    if (testStartupWarningButton) {
      testStartupWarningButton.addEventListener("click", async () => {
        try {
          if (this.app.api && this.app.api.testStartupWarning) {
            await this.app.api.testStartupWarning();
          }
        } catch (error) {
          console.error('Error testing startup warning:', error);
        }
      });
    }
  }

  bindWindowControls() {
    // Minimize button
    const minimizeBtn = document.getElementById("minimizeBtn");
    if (minimizeBtn) {
      minimizeBtn.addEventListener("click", () => {
        if (window.electronAPI && window.electronAPI.windowControls) {
          window.electronAPI.windowControls.minimize();
        }
      });
    }

    // Maximize/Restore button
    const maximizeBtn = document.getElementById("maximizeBtn");
    if (maximizeBtn) {
      maximizeBtn.addEventListener("click", async () => {
        if (window.electronAPI && window.electronAPI.windowControls) {
          const isMaximized = await window.electronAPI.windowControls.isMaximized();
          if (isMaximized) {
            window.electronAPI.windowControls.unmaximize();
          } else {
            window.electronAPI.windowControls.maximize();
          }
          this.app.updateMaximizeButtonState(!isMaximized);
        }
      });
    }

    // Close button
    const closeBtn = document.getElementById("closeBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (window.electronAPI && window.electronAPI.windowControls) {
          window.electronAPI.windowControls.close();
        }
      });
    }

    // Listen for window state changes
    if (window.electronAPI && window.electronAPI.windowControls) {
      window.electronAPI.windowControls.onMaximizeChange((isMaximized) => {
        this.app.updateMaximizeButtonState(isMaximized);
      });
    }
  }

  async updateMaximizeButton() {
    if (window.electronAPI && window.electronAPI.windowControls) {
      const maximizeBtn = document.getElementById("maximizeBtn");
      if (maximizeBtn) {
        try {
          const isMaximized = await window.electronAPI.windowControls.isMaximized();
          this.app.updateMaximizeButtonState(isMaximized);
        } catch (error) {
          console.error('Error checking maximize state:', error);
        }
      }
    }
  }

  updateMaximizeButtonState(isMaximized) {
    const maximizeBtn = document.getElementById("maximizeBtn");
    if (maximizeBtn) {
      if (isMaximized) {
        maximizeBtn.classList.add("maximized");
      } else {
        maximizeBtn.classList.remove("maximized");
      }
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EventManager;
} else {
  window.EventManager = EventManager;
}

/**
 * StartupManager - Handles startup warnings and diagnostics
 */
class StartupManager {
  constructor(app) {
    this.app = app;
  }

  initializeStartupWarnings() {
    try {
      console.log("Renderer: Initializing startup warnings...");
      
      if (this.app.api && this.app.api.onStartupWarning) {
        console.log("Renderer: Setting up startup warning listener...");
        this.app.api.onStartupWarning((notification) => {
          console.log('Renderer: Received startup warning:', notification);
          this.showStartupWarning(notification);
        });
        
        console.log("Startup warning listeners initialized");
      } else {
        console.log("Startup warnings not available (probably in web mode)");
      }
    } catch (error) {
      console.error('Error initializing startup warnings:', error);
    }
  }

  showStartupWarning(notification) {
    try {
      const modal = document.getElementById('startupWarningModal');
      const titleElement = document.getElementById('startupWarningTitle');
      const iconElement = document.getElementById('startupWarningIcon');
      const messageElement = document.getElementById('startupWarningMessage');
      const actionsContainer = document.getElementById('startupWarningActions');

      if (!modal || !titleElement || !iconElement || !messageElement || !actionsContainer) {
        console.error('Startup warning modal elements not found');
        return;
      }

      // Set modal content
      titleElement.textContent = notification.title || 'Startup Warning';
      iconElement.textContent = notification.icon || '⚠️';
      messageElement.textContent = notification.message || 'An issue was detected during startup.';

      // Clear existing actions
      actionsContainer.innerHTML = '';

      // Create action buttons
      if (notification.actions && Array.isArray(notification.actions)) {
        notification.actions.forEach(action => {
          const button = document.createElement('button');
          button.className = `warning-action-btn ${action.primary ? 'primary' : 'secondary'}`;
          button.textContent = action.label;
          button.onclick = () => this.handleStartupWarningAction(action.id, notification);
          actionsContainer.appendChild(button);
        });
      } else {
        // Default OK button
        const okButton = document.createElement('button');
        okButton.className = 'warning-action-btn primary';
        okButton.textContent = 'OK';
        okButton.onclick = () => this.hideStartupWarning();
        actionsContainer.appendChild(okButton);
      }

      // Show the modal with animation
      modal.style.display = 'flex';
      modal.offsetHeight; // Force reflow
      modal.classList.add('show');

      // Add event listener for overlay click to close
      const overlay = modal.querySelector('.modal-overlay');
      if (overlay) {
        overlay.onclick = () => this.hideStartupWarning();
      }

      console.log('Startup warning modal displayed');
    } catch (error) {
      console.error('Error showing startup warning:', error);
    }
  }

  async handleStartupWarningAction(actionId, notification) {
    try {
      console.log('Handling startup warning action:', actionId, notification.type);

      switch (actionId) {
        case 'refresh':
          this.hideStartupWarning();
          await this.performStartupChecksManually();
          break;
          
        case 'retry':
          this.hideStartupWarning();
          await this.performStartupChecksManually();
          break;
          
        case 'continue':
          this.hideStartupWarning();
          if (this.app.api && this.app.api.dismissStartupWarning) {
            await this.app.api.dismissStartupWarning(notification.type);
          }
          break;
          
        case 'ok':
        default:
          this.hideStartupWarning();
          if (this.app.api && this.app.api.dismissStartupWarning) {
            await this.app.api.dismissStartupWarning(notification.type);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling startup warning action:', error);
      this.hideStartupWarning();
    }
  }

  async performStartupChecksManually() {
    try {
      if (this.app.api && this.app.api.performStartupChecks) {
        const result = await this.app.api.performStartupChecks();
        if (result.success && result.result) {
          if (result.result.warnings && result.result.warnings.length > 0) {
            const notification = this.createNotificationFromCheck(result.result);
            if (notification) {
              this.showStartupWarning(notification);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error performing manual startup checks:', error);
    }
  }

  createNotificationFromCheck(checkResult) {
    if (!checkResult.warnings || checkResult.warnings.length === 0) {
      return null;
    }

    // Prioritize Watchout running warning
    const watchoutWarning = checkResult.warnings.find(w => w.type === 'watchout-running');
    if (watchoutWarning) {
      return {
        type: 'watchout-running',
        title: watchoutWarning.title,
        message: watchoutWarning.message,
        icon: '⚠️',
        actions: [
          { id: 'refresh', label: 'Refresh Check', primary: true },
          { id: 'continue', label: 'Continue Anyway', secondary: true }
        ],
        severity: 'warning'
      };
    }

    // Handle port conflicts
    const portWarning = checkResult.warnings.find(w => w.type === 'port-occupied');
    if (portWarning) {
      return {
        type: 'port-occupied',
        title: portWarning.title,
        message: portWarning.message,
        icon: '🔌',
        actions: [
          { id: 'retry', label: 'Retry', primary: true },
          { id: 'continue', label: 'Continue', secondary: true }
        ],
        severity: 'warning'
      };
    }

    // Handle multicast port warnings
    const multicastWarning = checkResult.warnings.find(w => w.type === 'multicast-port-occupied');
    if (multicastWarning) {
      return {
        type: 'multicast-port-occupied',
        title: multicastWarning.title,
        message: multicastWarning.message,
        icon: '🔌',
        actions: [
          { id: 'ok', label: 'OK', primary: true }
        ],
        severity: 'info'
      };
    }

    // Handle other warnings
    if (checkResult.warnings.length > 0) {
      const warning = checkResult.warnings[0];
      return {
        type: warning.type,
        title: warning.title,
        message: warning.message,
        icon: '⚠️',
        actions: [
          { id: 'ok', label: 'OK', primary: true }
        ],
        severity: warning.severity || 'info'
      };
    }

    return null;
  }

  hideStartupWarning() {
    try {
      const modal = document.getElementById('startupWarningModal');
      if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
          modal.style.display = 'none';
          modal.style.visibility = 'hidden';
          modal.style.opacity = '0';
        }, 300);
        console.log('Startup warning modal hidden');
      }
    } catch (error) {
      console.error('Error hiding startup warning:', error);
    }
  }

  async performStartupDiagnostics() {
    console.log('=== Startup Diagnostics ===');
    console.log('Document ready state:', document.readyState);
    console.log('Window loaded:', document.readyState === 'complete');
    
    // Check for required DOM elements
    const requiredElements = [
      'scanButton', 'serverList', 'serversContainer', 'settingsButton',
      'minimizeBtn', 'maximizeBtn', 'closeBtn'
    ];
    
    requiredElements.forEach(id => {
      const element = document.getElementById(id);
      console.log(`Element ${id}:`, element ? 'Found' : 'Missing');
    });

    // Check API availability
    console.log('Window electronAPI:', typeof window.electronAPI);
    console.log('ApiAdapter available:', typeof ApiAdapter !== 'undefined');
    
    // Check for JavaScript errors
    window.addEventListener('error', (event) => {
      console.error('JavaScript error during startup:', event.error);
    });

    console.log('=== End Diagnostics ===');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StartupManager;
} else {
  window.StartupManager = StartupManager;
}

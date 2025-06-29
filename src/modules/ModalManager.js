/**
 * ModalManager - Handles all modal dialogs (Settings, Add Server, Custom Commands, etc.)
 */
class ModalManager {
  constructor(app) {
    this.app = app;
  }

  // Settings Modal Methods
  showSettingsDialog() {
    const modal = document.getElementById("settingsModal");
    modal.style.display = "flex";
    modal.classList.add("show");

    this.loadCurrentSettings();
    this.bindSettingsModal();

    // Focus on first input
    setTimeout(() => {
      const firstInput = modal.querySelector('input');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  async loadCurrentSettings() {
    try {
      if (this.app.api) {
        const settings = await this.app.api.getAppSettings();
        
        const enableCacheFromDisk = document.getElementById("enableCacheFromDisk");
        const enableWebServer = document.getElementById("enableWebServer");

        if (enableCacheFromDisk && settings.enableCacheFromDisk !== undefined) {
          enableCacheFromDisk.checked = settings.enableCacheFromDisk;
        }

        if (enableWebServer && settings.enableWebServer !== undefined) {
          enableWebServer.checked = settings.enableWebServer;
        }

        this.updateWebServerStatus();
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  }

  async updateWebServerStatus() {
    try {
      if (this.app.api) {
        const status = await this.app.api.getWebServerStatus();
        const statusElement = document.getElementById("webServerStatus");
        
        if (statusElement) {
          if (status.running) {
            statusElement.innerHTML = `<span class="status-indicator online"></span> Running on port ${status.port}`;
            statusElement.className = "web-server-status running";
          } else {
            statusElement.innerHTML = '<span class="status-indicator offline"></span> Not running';
            statusElement.className = "web-server-status stopped";
          }
        }
      }
    } catch (error) {
      console.error("Error getting web server status:", error);
    }
  }

  bindSettingsModal() {
    const modal = document.getElementById("settingsModal");
    const closeBtn = document.getElementById("closeSettingsModal");
    const cancelBtn = document.getElementById("cancelSettings");
    const saveBtn = document.getElementById("saveSettings");

    const closeModal = () => {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.style.display = "none";
      }, 300);
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    // Close on overlay click
    modal.onclick = (e) => {
      if (e.target === modal) {
        closeModal();
      }
    };

    // Save settings
    if (saveBtn) {
      saveBtn.onclick = async () => {
        await this.saveSettings();
        closeModal();
      };
    }

    // Update web server status when checkbox changes
    const enableWebServer = document.getElementById("enableWebServer");
    if (enableWebServer) {
      enableWebServer.onchange = () => {
        setTimeout(() => this.updateWebServerStatus(), 500);
      };
    }
  }

  async saveSettings() {
    try {
      const enableCacheFromDisk = document.getElementById("enableCacheFromDisk");
      const enableWebServer = document.getElementById("enableWebServer");

      const settings = {
        enableCacheFromDisk: enableCacheFromDisk ? enableCacheFromDisk.checked : true,
        enableWebServer: enableWebServer ? enableWebServer.checked : true,
      };

      await this.app.api.saveAppSettings(settings);

      setTimeout(() => {
        this.updateWebServerStatus();
      }, 500);

      console.log("Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  }

  // Add Server Modal Methods
  showAddServerDialog() {
    try {
      console.log('showAddServerDialog called');
      const modal = document.getElementById("addServerModal");
      if (!modal) {
        console.error('Add server modal not found');
        return;
      }

      console.log('Setting modal display to flex and adding show class');
      modal.style.display = "flex";
      modal.classList.add("show");

      this.bindAddServerModal();

      // Clear previous values
      const serverIpInput = document.getElementById("serverIp");
      const serverNameInput = document.getElementById("serverName");
      const serverTypeSelect = document.getElementById("serverType");
      
      if (serverIpInput) serverIpInput.value = "";
      if (serverNameInput) serverNameInput.value = "";
      if (serverTypeSelect) serverTypeSelect.value = "Manual Entry";

      // Add listener for server type changes to auto-configure server names
      if (serverTypeSelect) {
        serverTypeSelect.addEventListener('change', (e) => {
          const selectedType = e.target.value;
          if (serverNameInput && !serverNameInput.value) {
            if (selectedType !== "Manual Entry") {
              serverNameInput.value = selectedType;
            }
          }
        });
      }

      // Focus on IP input
      setTimeout(() => {
        if (serverIpInput) serverIpInput.focus();
      }, 100);
      
      console.log('Add server dialog opened successfully');
    } catch (error) {
      console.error('Error opening add server dialog:', error);
    }
  }

  bindAddServerModal() {
    const modal = document.getElementById("addServerModal");
    const closeBtn = document.getElementById("closeAddServerModal");
    const cancelBtn = document.getElementById("cancelAddServer");
    const saveBtn = document.getElementById("saveAddServer");

    // Remove any existing event listeners to prevent duplicates
    if (closeBtn && closeBtn._boundCloseHandler) {
      closeBtn.removeEventListener('click', closeBtn._boundCloseHandler);
    }
    if (cancelBtn && cancelBtn._boundCancelHandler) {
      cancelBtn.removeEventListener('click', cancelBtn._boundCancelHandler);
    }
    if (saveBtn && saveBtn._boundSaveHandler) {
      saveBtn.removeEventListener('click', saveBtn._boundSaveHandler);
    }
    if (modal && modal._boundOverlayHandler) {
      modal.removeEventListener('click', modal._boundOverlayHandler);
    }

    const closeModal = () => {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.style.display = "none";
        // Reset modal state
        delete modal.dataset.editingServerId;
        const modalTitle = modal.querySelector(".modal-header h3");
        if (modalTitle) modalTitle.textContent = "Add New Server";
        if (saveBtn) saveBtn.textContent = "Add Server";
      }, 300);
    };

    // Bind new event handlers and store references
    if (closeBtn) {
      closeBtn._boundCloseHandler = closeModal;
      closeBtn.onclick = closeModal;
    }
    
    if (cancelBtn) {
      cancelBtn._boundCancelHandler = closeModal;
      cancelBtn.onclick = closeModal;
    }

    // Close on overlay click
    if (modal) {
      modal._boundOverlayHandler = (e) => {
        if (e.target === modal) {
          closeModal();
        }
      };
      modal.onclick = modal._boundOverlayHandler;
    }
    
    // Save server
    if (saveBtn) {
      saveBtn._boundSaveHandler = async () => {
        const editingServerId = modal?.dataset.editingServerId;
        if (editingServerId) {
          await this.app.updateManualServer(editingServerId);
        } else {
          await this.app.addManualServer();
        }
        closeModal();
      };
      saveBtn.onclick = saveBtn._boundSaveHandler;
    }

    // Add server on Enter key in IP field
    const serverIpInput = document.getElementById("serverIp");
    if (serverIpInput) {
      if (serverIpInput._boundEnterHandler) {
        serverIpInput.removeEventListener('keydown', serverIpInput._boundEnterHandler);
      }
      
      serverIpInput._boundEnterHandler = (e) => {
        if (e.key === 'Enter') {
          if (saveBtn) saveBtn.click();
        }
      };
      serverIpInput.onkeydown = serverIpInput._boundEnterHandler;
    }
  }

  // Custom Command Modal Methods
  showCustomCommandDialog() {
    document.getElementById("customData").value = "";

    // Focus on endpoint input
    setTimeout(() => {
      const endpointInput = document.getElementById("customEndpoint");
      if (endpointInput) endpointInput.focus();
    }, 100);
  }

  bindCustomCommandModal() {
    const modal = document.getElementById("customCommandModal");
    const closeBtn = document.getElementById("closeCustomModal");
    const cancelBtn = document.getElementById("cancelCustomCommand");
    const executeBtn = document.getElementById("executeCustomCommand");
    const examplesSelect = document.getElementById("endpointExamples");
    const endpointInput = document.getElementById("customEndpoint");
    const methodSelect = document.getElementById("customMethod");

    // Handle example selection
    if (examplesSelect) {
      examplesSelect.onchange = () => {
        if (examplesSelect.value && endpointInput) {
          endpointInput.value = examplesSelect.value;
        }
      };
    }

    // Close modal handlers
    const closeModal = () => {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.style.display = "none";
      }, 300);
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    // Close on overlay click
    modal.onclick = (e) => {
      if (e.target === modal) {
        closeModal();
      }
    };

    // Execute custom command
    if (executeBtn) {
      executeBtn.onclick = () => {
        this.app.executeCustomCommand();
        closeModal();
      };
    }

    // Execute on Enter key in endpoint field
    if (endpointInput) {
      endpointInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          this.app.executeCustomCommand();
          closeModal();
        }
      };
    }
  }

  async executeCustomCommand() {
    if (!this.app.selectedServerIp) {
      alert('Please select a server first.');
      return;
    }

    const endpoint = document.getElementById("customEndpoint").value.trim();
    const method = document.getElementById("customMethod").value;
    const dataText = document.getElementById("customData").value.trim();

    if (!endpoint) {
      alert('Please enter an endpoint.');
      return;
    }

    let requestData = null;
    if (dataText && method !== "GET") {
      try {
        requestData = JSON.parse(dataText);
      } catch (error) {
        alert('Invalid JSON data. Please check your input.');
        return;
      }
    }

    try {
      const result = await this.sendCustomWatchoutRequest(endpoint, method, requestData);
      this.app.addCommandResponse('custom', `Custom ${method} ${endpoint}`, result);
    } catch (error) {
      console.error('Custom command error:', error);
      this.app.addCommandResponse('custom', `Custom ${method} ${endpoint}`, {
        success: false,
        error: error.message
      });
    }
  }

  async sendCustomWatchoutRequest(endpoint, method, data) {
    try {
      const result = await this.app.api.sendCustomWatchoutRequest(
        this.app.selectedServerIp,
        endpoint,
        method,
        data
      );
      return result;
    } catch (error) {
      console.error('Error sending custom request:', error);
      throw error;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModalManager;
} else {
  window.ModalManager = ModalManager;
}

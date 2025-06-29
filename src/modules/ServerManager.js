/**
 * ServerManager - Handles server selection, manual server management, and server operations
 */
class ServerManager {
  constructor(app) {
    this.app = app;
  }

  async selectServer(serverId, serverIp = null) {
    try {
      // Throttle server selection to prevent rapid switching
      const now = Date.now();
      if (this.app.lastServerSelectTime && now - this.app.lastServerSelectTime < 500) {
        return;
      }
      this.app.lastServerSelectTime = now;

      // Find the selected server to get its IP if not provided
      const selectedServer = this.app.servers.find(
        (server) => this.app.getServerId(server) === serverId
      );

      if (!selectedServer) {
        console.error('Selected server not found:', serverId);
        return;
      }

      // Use provided serverIp or derive from selected server
      const actualServerIp = serverIp || selectedServer.ip;

      console.log(`Selecting server: ${serverId} (${actualServerIp})`);

      // Update selection state
      this.app.selectedServerId = serverId;
      this.app.selectedServerIp = actualServerIp;

      // Update UI to show selection
      this.updateServerSelection();

      // Update commands panel header
      this.app.updateCommandsPanelHeader(serverId);

      // Load server command UI state
      this.loadServerCommandsUI(serverId);

      // Update commands visibility
      this.app.commandManager.updateCommandsVisibility();

      // Render the selected server details in the main content area
      this.app.uiManager.renderMainContent();

      // Clear previous timeline selection and status
      this.app.resetTimelineSelector();
      this.app.hideStatusInformation();

      // Test API connection (with debouncing)
      if (this.app.statusUpdateTimeout) {
        clearTimeout(this.app.statusUpdateTimeout);
      }

      this.app.statusUpdateTimeout = setTimeout(() => {
        this.app.testApiConnection(selectedServer);
      }, 300);

    } catch (error) {
      console.error('Error selecting server:', error);
    }
  }

  updateServerSelection() {
    // Update visual selection in server list
    const serverItems = document.querySelectorAll('.server-item');
    serverItems.forEach(item => {
      if (item.dataset.serverId === this.app.selectedServerId) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }

  updateCommandsPanelHeader(serverId) {
    const server = this.app.servers.find(s => this.app.getServerId(s) === serverId);
    if (server) {
      const serverName = server.hostRef || server.hostname || server.ip;
      
      // Update the panel title to include server name
      const panelTitle = document.querySelector('#commandsPanel .panel-header h3');
      if (panelTitle) {
        panelTitle.textContent = `Server Commands - ${serverName}`;
      }
    }
  }

  async addManualServer() {
    try {
      const modal = document.getElementById("addServerModal");
      const editingServerId = modal?.dataset.editingServerId;
      const isEditing = !!editingServerId;

      const serverIp = document.getElementById("serverIp").value.trim();
      const serverName = document.getElementById("serverName").value.trim();
      const serverType = document.getElementById("serverType").value;

      // Validate IP address
      if (!this.app.isValidIpAddress(serverIp)) {
        alert('Please enter a valid IP address.');
        return;
      }

      if (isEditing) {
        await this.updateManualServer(editingServerId);
        return;
      }

      // Create server object (ports will be set by backend)
      const manualServer = {
        ip: serverIp,
        hostname: serverName || serverIp,
        type: serverType,
        ports: [3040, 3041, 3042, 3022],
        discoveryMethod: "manual",
        status: "online",
        isManual: true,
        discoveredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        firstDiscoveredAt: new Date().toISOString(),
      };

      // Check if server already exists
      const serverId = this.app.getServerId(manualServer);
      const existingServer = this.app.servers.find(
        (server) => this.app.getServerId(server) === serverId
      );

      if (existingServer) {
        alert('A server with this IP address already exists.');
        return;
      } else {
        // Add to servers array
        this.app.servers.push(manualServer);
      }

      // Save to backend cache (optional - manual servers persist in memory)
      try {
        await this.app.api.addManualServer(manualServer);
      } catch (error) {
        console.warn('Failed to save manual server to backend:', error);
      }

      // Update UI
      this.app.updateUI();

      // Auto-select the newly added server
      this.app.selectedServerId = serverId;
      this.app.selectedServerIp = serverIp;

      console.log("Manual server added successfully:", manualServer);
    } catch (error) {
      console.error("Error adding manual server:", error);
      alert("Failed to add server. Please check the details and try again.");
    }
  }

  async updateManualServer(serverId) {
    try {
      const serverIp = document.getElementById("serverIp").value.trim();
      const serverName = document.getElementById("serverName").value.trim();
      const serverType = document.getElementById("serverType").value;

      // Validate IP address
      if (!this.app.isValidIpAddress(serverIp)) {
        alert('Please enter a valid IP address.');
        return;
      }

      const updatedServerData = {
        ip: serverIp,
        hostname: serverName || serverIp,
        type: serverType,
        discoveryMethod: "manual",
        status: "online",
        isManual: true,
      };

      // Update server in backend
      const result = await this.app.api.updateManualServer(serverId, updatedServerData);

      if (result.success) {
        // Update local server data
        const serverIndex = this.app.servers.findIndex(s => this.app.getServerId(s) === serverId);
        if (serverIndex !== -1) {
          this.app.servers[serverIndex] = { ...this.app.servers[serverIndex], ...updatedServerData };
        }

        // Update UI
        this.app.updateUI();

        this.app.updateScanStatus(`Server updated: ${serverName || serverIp}`);
        console.log("Manual server updated successfully");
      } else {
        alert("Failed to update server: " + result.error);
      }
    } catch (error) {
      console.error("Error updating manual server:", error);
      alert("Failed to update server. Please check the details and try again.");
    }
  }

  editManualServer(serverId) {
    // Find the server to edit
    const server = this.app.servers.find((s) => this.app.getServerId(s) === serverId);
    if (!server || !server.isManual) {
      console.error("Server not found or not a manual server:", serverId);
      return;
    }

    try {
      console.log('editManualServer called for serverId:', serverId);
      const modal = document.getElementById("addServerModal");
      if (!modal) {
        console.error('Add server modal not found');
        return;
      }

      // Set modal to editing mode
      modal.dataset.editingServerId = serverId;

      // Update modal title and button text for editing
      const modalTitle = modal.querySelector(".modal-header h3");
      if (modalTitle) modalTitle.textContent = "Edit Server";
      
      const saveBtn = document.getElementById("saveAddServer");
      if (saveBtn) saveBtn.textContent = "Update Server";

      // Populate form fields with existing server data
      const serverIpInput = document.getElementById("serverIp");
      const serverNameInput = document.getElementById("serverName");
      const serverTypeSelect = document.getElementById("serverType");
      
      if (serverIpInput) serverIpInput.value = server.ip || "";
      if (serverNameInput) serverNameInput.value = server.hostname || "";
      if (serverTypeSelect) serverTypeSelect.value = server.type || "Manual Entry";

      // Show the modal
      modal.style.display = "flex";
      modal.classList.add("show");

      // Bind modal events
      this.app.bindAddServerModal();

      // Focus on IP input
      setTimeout(() => {
        if (serverIpInput) {
          serverIpInput.focus();
        }
      }, 100);
      
      console.log('Edit server dialog opened successfully for server:', server);
    } catch (error) {
      console.error('Error opening edit server dialog:', error);
    }
  }

  async removeManualServer(serverId) {
    // Find the server to remove
    const server = this.app.servers.find((s) => this.app.getServerId(s) === serverId);
    if (!server || !server.isManual) {
      console.error("Server not found or not a manual server:", serverId);
      return;
    }

    // Confirm removal
    const serverName = server.hostname || server.ip;
    if (!confirm(`Are you sure you want to remove the manual server "${serverName}"?`)) {
      return;
    }

    try {
      // Remove from backend
      const result = await this.app.api.removeManualServer(serverId);

      if (result.success) {
        // Remove from local servers array
        this.app.servers = this.app.servers.filter(
          (s) => this.app.getServerId(s) !== serverId
        );

        // Clear selection if removed server was selected
        if (this.app.selectedServerId === serverId) {
          this.app.selectedServerId = null;
          this.app.selectedServerIp = null;
          this.app.apiConnectionStatus = false;
          this.app.resetTimelineSelector();
          this.app.hideStatusInformation();
        }

        // Update UI
        this.app.updateUI();

        this.app.updateScanStatus(`Removed manual server: ${serverName}`);
        console.log("Manual server removed successfully:", serverName);
      } else {
        console.error("Failed to remove manual server:", result.error);
        alert("Failed to remove server: " + result.error);
      }
    } catch (error) {
      console.error("Error removing manual server:", error);
      alert("Failed to remove server. Please try again.");
    }
  }

  hideStatusInformation() {
    const statusInformationArea = document.getElementById('statusInformationArea');
    if (statusInformationArea) {
      statusInformationArea.style.display = 'none';
    }
  }

  updateServerDetailsWithStatus(statusResult) {
    if (!this.app.selectedServerId || !statusResult.success || !statusResult.data) {
      return;
    }

    // Find the status information area in the commands panel
    const statusInformationArea = document.getElementById('statusInformationArea');
    const statusContent = document.getElementById('statusContent');
    
    if (!statusInformationArea || !statusContent) {
      return;
    }

    // Show the status information area
    statusInformationArea.style.display = 'block';

    // Generate the status visualization
    const statusVisualization = this.app.renderStatusVisualization(statusResult);
    
    if (statusVisualization) {
      // Clear existing content and add new visualization
      statusContent.innerHTML = '';
      statusContent.appendChild(statusVisualization);
    }
  }

  loadServerCommandsUI(serverId) {
    const commandState = this.getServerCommandState(serverId);

    // Update connection status
    this.app.updateConnectionStatus(
      commandState.connectionStatus,
      commandState.connectionMessage
    );

    // Update command history
    this.renderCommandHistory(commandState.commandHistory);
  }

  getServerCommandState(serverId) {
    if (!this.app.serverCommandStates) {
      this.app.serverCommandStates = new Map();
    }
    
    if (!this.app.serverCommandStates.has(serverId)) {
      this.app.serverCommandStates.set(serverId, {
        connectionStatus: false,
        connectionMessage: "Not connected",
        commandHistory: [],
        lastConnectionTest: null,
      });
    }
    return this.app.serverCommandStates.get(serverId);
  }

  updateServerCommandState(serverId, updates) {
    const state = this.getServerCommandState(serverId);
    Object.assign(state, updates);
    this.app.serverCommandStates.set(serverId, state);
  }

  renderCommandHistory(history) {
    const responseContent = document.getElementById("responseContent");
    if (!responseContent) return;

    // Clear existing content
    responseContent.innerHTML = "";

    if (history.length === 0) {
      const noResponse = document.createElement("div");
      noResponse.className = "no-response";
      noResponse.textContent = "No commands executed yet";
      responseContent.appendChild(noResponse);
      return;
    }

    // Add each response item
    history.forEach((item) => {
      const responseItem = document.createElement("div");
      responseItem.className = `response-item ${item.type}`;

      // Standard response display
      responseItem.innerHTML = `
        <div class="response-timestamp">${item.timestamp}</div>
        <div class="response-command">${item.commandName}</div>
        <div class="response-data">${this.app.escapeHtml(item.result)}</div>
      `;

      responseContent.appendChild(responseItem);
    });
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServerManager;
} else {
  window.ServerManager = ServerManager;
}

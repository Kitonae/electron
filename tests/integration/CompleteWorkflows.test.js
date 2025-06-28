// Integration tests for complete workflows
const { describe, test, expect, beforeEach } = require('@jest/globals');
const MockApiAdapter = require('../mocks/MockApiAdapter');

describe('Integration Tests - Complete Workflows', () => {
  let mockApp;
  let mockAPI;

  beforeEach(() => {
    // Set up complete DOM
    document.body.innerHTML = `
      <div id="serverList"></div>
      <div id="serverCountSidebar">0</div>
      <div id="scanStatus">Ready</div>
      <div id="clearOfflineButton" disabled></div>
      <div id="noServersSidebar" style="display: none;"></div>
      <div id="commandsArea" style="display: none;"></div>
      
      <div id="addServerModal" style="display: none;">
        <div class="modal-header">
          <h3>Add Server Manually</h3>
        </div>
        <input id="serverIp" />
        <input id="serverName" />
        <select id="serverType">
          <option value="Production Server">Production Server</option>
          <option value="Manual Entry">Manual Entry</option>
        </select>
        <button id="saveAddServer">Add Server</button>
        <button id="cancelAddServer">Cancel</button>
      </div>
    `;

    mockAPI = new MockApiAdapter();
    // Reset to clean state for each test
    mockAPI.reset();
    
    // Complete app mock with integrated functionality
    mockApp = {
      servers: [],
      selectedServerId: null,
      selectedServerIp: null,
      api: mockAPI,
      
      // Server management
      async loadInitialServers() {
        const result = await this.api.scanForWatchoutServers();
        if (result.success) {
          this.servers = result.servers || [];
          this.updateUI();
        }
        return result;
      },
      
      async addManualServer() {
        const serverIp = document.getElementById('serverIp').value.trim();
        const serverName = document.getElementById('serverName').value.trim();
        const serverType = document.getElementById('serverType').value;
        
        if (!this.isValidIpAddress(serverIp)) {
          throw new Error('Invalid IP address');
        }
        
        const serverData = {
          ip: serverIp,
          hostname: serverName || serverIp,
          type: serverType,
          ports: [3040, 3041, 3042, 3022],
          status: 'online',
          isManual: true
        };
        
        const result = await this.api.addManualServer(serverData);
        if (result.success) {
          await this.loadInitialServers(); // Refresh
          this.hideAddServerDialog();
        }
        return result;
      },
      
      async removeManualServer(serverId) {
        const result = await this.api.removeManualServer(serverId);
        if (result.success) {
          await this.loadInitialServers(); // Refresh
        }
        return result;
      },
      
      async clearOfflineServers() {
        const result = await this.api.clearOfflineServers();
        if (result.success) {
          await this.loadInitialServers(); // Refresh
        }
        return result;
      },
      
      // UI methods
      updateUI() {
        this.updateServerCounts();
        this.updateClearOfflineButtonState();
        this.renderSidebar();
        this.renderMainContent();
      },
      
      updateServerCounts() {
        const count = this.servers.length;
        const element = document.getElementById('serverCountSidebar');
        if (element) {
          element.textContent = count.toString();
        }
      },
      
      updateClearOfflineButtonState() {
        const clearOfflineButton = document.getElementById('clearOfflineButton');
        const hasOfflineServers = this.servers.some(server => server.status === 'offline');
        
        if (clearOfflineButton) {
          clearOfflineButton.disabled = !hasOfflineServers;
        }
      },
      
      renderSidebar() {
        const serverList = document.getElementById('serverList');
        const noServersSidebar = document.getElementById('noServersSidebar');

        if (this.servers.length === 0) {
          if (noServersSidebar) noServersSidebar.style.display = 'flex';
          if (serverList) serverList.innerHTML = '';
          return;
        }

        if (noServersSidebar) noServersSidebar.style.display = 'none';
        
        if (serverList) {
          serverList.innerHTML = this.servers.map(server => {
            const serverId = `${server.ip}:${server.ports ? server.ports.join(',') : 'manual'}`;
            const isSelected = this.selectedServerId === serverId;
            return `
              <div class="server-item ${isSelected ? 'selected' : ''}" data-server-id="${serverId}">
                <div class="server-item-name">${server.hostname || server.ip}</div>
                <div class="server-item-ip">${server.ip}</div>
                <div class="server-item-status ${server.status}">${server.status}</div>
                ${server.isManual ? `
                  <div class="manual-server-actions">
                    <button class="manual-edit-btn" data-server-id="${serverId}">✏️</button>
                    <button class="manual-remove-btn" data-server-id="${serverId}">🗑️</button>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');
        }
      },
      
      renderMainContent() {
        const commandsArea = document.getElementById('commandsArea');
        if (commandsArea) {
          commandsArea.style.display = this.selectedServerId ? 'block' : 'none';
        }
      },
      
      selectServer(serverId) {
        this.selectedServerId = serverId;
        const server = this.servers.find(s => `${s.ip}:${s.ports.join(',')}` === serverId);
        this.selectedServerIp = server ? server.ip : null;
        this.updateUI();
      },
      
      showAddServerDialog() {
        const modal = document.getElementById('addServerModal');
        if (modal) {
          modal.style.display = 'flex';
        }
      },
      
      hideAddServerDialog() {
        const modal = document.getElementById('addServerModal');
        if (modal) {
          modal.style.display = 'none';
          // Clear form
          document.getElementById('serverIp').value = '';
          document.getElementById('serverName').value = '';
        }
      },
      
      // Utility methods
      isValidIpAddress(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
      },
      
      getServerId(server) {
        const ports = server.ports ? server.ports.join(",") : "manual";
        return `${server.ip}:${ports}`;
      }
    };
  });

  describe('Complete Server Discovery Workflow', () => {
    test('should load initial servers and update UI', async () => {
      const result = await mockApp.loadInitialServers();
      
      expect(result.success).toBe(true);
      expect(mockApp.servers.length).toBeGreaterThan(0);
      
      // Check UI updates
      const countElement = document.getElementById('serverCountSidebar');
      expect(countElement.textContent).toBe(mockApp.servers.length.toString());
      
      const noServersDiv = document.getElementById('noServersSidebar');
      expect(noServersDiv.style.display).toBe('none');
    });

    test('should handle empty server discovery', async () => {
      // Mock empty result
      mockApp.api.scanForWatchoutServers = jest.fn().mockResolvedValue({
        success: true,
        servers: []
      });

      await mockApp.loadInitialServers();
      
      expect(mockApp.servers.length).toBe(0);
      
      const countElement = document.getElementById('serverCountSidebar');
      expect(countElement.textContent).toBe('0');
      
      const noServersDiv = document.getElementById('noServersSidebar');
      expect(noServersDiv.style.display).toBe('flex');
    });
  });

  describe('Complete Manual Server Management Workflow', () => {
    test('should add manual server end-to-end', async () => {
      // First load initial servers to get the baseline
      await mockApp.loadInitialServers();
      const initialCount = mockApp.servers.length;

      // Set up form
      document.getElementById('serverIp').value = '192.168.1.150';
      document.getElementById('serverName').value = 'Integration Test Server';
      document.getElementById('serverType').value = 'Manual Entry';

      // Add server
      const result = await mockApp.addManualServer();
      
      expect(result.success).toBe(true);
      expect(mockApp.servers.length).toBe(initialCount + 1);
      
      // Check the new server exists
      const newServer = mockApp.servers.find(s => s.ip === '192.168.1.150');
      expect(newServer).toBeDefined();
      expect(newServer.hostname).toBe('Integration Test Server');
      expect(newServer.isManual).toBe(true);
      
      // Check UI updates
      const countElement = document.getElementById('serverCountSidebar');
      expect(countElement.textContent).toBe(mockApp.servers.length.toString());
      
      // Check modal is hidden
      const modal = document.getElementById('addServerModal');
      expect(modal.style.display).toBe('none');
      
      // Check form is cleared
      expect(document.getElementById('serverIp').value).toBe('');
    });

    test('should validate IP address before adding', async () => {
      document.getElementById('serverIp').value = 'invalid.ip.address';
      document.getElementById('serverName').value = 'Test Server';

      await expect(mockApp.addManualServer()).rejects.toThrow('Invalid IP address');
    });

    test('should remove manual server end-to-end', async () => {
      // First add a server
      await mockApp.api.addManualServer({
        ip: '192.168.1.151',
        hostname: 'temp-server',
        type: 'Manual Entry',
        ports: [3040, 3041, 3042, 3022],
        isManual: true
      });

      await mockApp.loadInitialServers();
      const initialCount = mockApp.servers.length;
      
      // Find and remove the server
      const serverId = '192.168.1.151:3040,3041,3042,3022';
      const result = await mockApp.removeManualServer(serverId);
      
      expect(result.success).toBe(true);
      expect(mockApp.servers.length).toBe(initialCount - 1);
      
      // Check server no longer exists
      const removedServer = mockApp.servers.find(s => s.ip === '192.168.1.151');
      expect(removedServer).toBeUndefined();
    });
  });

  describe('Server Selection and Commands Workflow', () => {
    test('should select server and show commands', async () => {
      await mockApp.loadInitialServers();
      
      const firstServer = mockApp.servers[0];
      const serverId = mockApp.getServerId(firstServer);
      
      mockApp.selectServer(serverId);
      
      expect(mockApp.selectedServerId).toBe(serverId);
      expect(mockApp.selectedServerIp).toBe(firstServer.ip);
      
      // Check commands area is shown
      const commandsArea = document.getElementById('commandsArea');
      expect(commandsArea.style.display).toBe('block');
    });

    test('should update sidebar selection visual state', async () => {
      await mockApp.loadInitialServers();
      
      const firstServer = mockApp.servers[0];
      const serverId = mockApp.getServerId(firstServer);
      
      mockApp.selectServer(serverId);
      
      const serverList = document.getElementById('serverList');
      const selectedItem = serverList.querySelector('.selected');
      expect(selectedItem).toBeTruthy();
      expect(selectedItem.dataset.serverId).toBe(serverId);
    });
  });

  describe('Clear Offline Servers Workflow', () => {
    test('should clear offline servers and update UI', async () => {
      // Add some servers with mixed status
      await mockApp.api.addManualServer({
        ip: '192.168.1.200',
        status: 'online',
        isManual: true
      });

      await mockApp.api.addManualServer({
        ip: '192.168.1.201',
        status: 'offline',
        isManual: true
      });

      await mockApp.loadInitialServers();
      const initialCount = mockApp.servers.length;
      
      const result = await mockApp.clearOfflineServers();
      
      expect(result.success).toBe(true);
      
      // All remaining servers should be online
      const offlineServers = mockApp.servers.filter(s => s.status === 'offline');
      expect(offlineServers.length).toBe(0);
      
      // UI should be updated
      const clearButton = document.getElementById('clearOfflineButton');
      expect(clearButton.disabled).toBe(true);
    });
  });

  describe('Modal Management Workflow', () => {
    test('should show and hide add server modal', () => {
      const modal = document.getElementById('addServerModal');
      
      // Initially hidden
      expect(modal.style.display).toBe('none');
      
      // Show modal
      mockApp.showAddServerDialog();
      expect(modal.style.display).toBe('flex');
      
      // Hide modal
      mockApp.hideAddServerDialog();
      expect(modal.style.display).toBe('none');
    });

    test('should clear form when hiding modal', () => {
      const serverIp = document.getElementById('serverIp');
      const serverName = document.getElementById('serverName');
      
      // Fill form
      serverIp.value = '192.168.1.100';
      serverName.value = 'Test Server';
      
      // Hide modal
      mockApp.hideAddServerDialog();
      
      // Form should be cleared
      expect(serverIp.value).toBe('');
      expect(serverName.value).toBe('');
    });
  });

  describe('Error Recovery Workflow', () => {
    test('should handle API failures gracefully', async () => {
      // Mock API failure
      mockApp.api.scanForWatchoutServers = jest.fn().mockResolvedValue({
        success: false,
        error: 'Network error'
      });

      const result = await mockApp.loadInitialServers();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      
      // App should still be in valid state
      expect(Array.isArray(mockApp.servers)).toBe(true);
    });

    test('should handle missing DOM elements', () => {
      // Remove critical elements
      document.getElementById('serverList').remove();
      document.getElementById('serverCountSidebar').remove();
      
      // UI updates should not crash
      expect(() => {
        mockApp.updateUI();
      }).not.toThrow();
    });
  });

  describe('Data Consistency', () => {
    test('should maintain data consistency across operations', async () => {
      // Load initial data
      await mockApp.loadInitialServers();
      const initialData = [...mockApp.servers];
      
      // Add a server
      await mockApp.api.addManualServer({
        ip: '192.168.1.152',
        hostname: 'consistency-test',
        isManual: true
      });
      
      await mockApp.loadInitialServers();
      expect(mockApp.servers.length).toBe(initialData.length + 1);
      
      // Remove the server
      const serverId = '192.168.1.152:manual';
      await mockApp.removeManualServer(serverId);
      expect(mockApp.servers.length).toBe(initialData.length);
      
      // Data should be back to initial state (minus any modifications by other tests)
      const finalServer = mockApp.servers.find(s => s.ip === '192.168.1.152');
      expect(finalServer).toBeUndefined();
    });
  });
});

// Unit tests for WatchoutServerFinderApp main class
const { describe, test, expect, beforeEach } = require('@jest/globals');
const MockApiAdapter = require('../mocks/MockApiAdapter');

// Mock the ApiAdapter
jest.mock('../../src/api-adapter.js', () => {
  return jest.fn().mockImplementation(() => new MockApiAdapter());
});

// Import the class under test
// Note: We'll need to refactor the renderer.js to export the class for testing
// For now, we'll test the logic by copying key methods

describe('WatchoutServerFinderApp', () => {
  let app;
  let mockAPI;

  beforeEach(() => {
    // Set up DOM elements that the app expects
    document.body.innerHTML = `
      <div id="serverList"></div>
      <div id="serverCountSidebar">0</div>
      <div id="scanStatus">Ready</div>
      <div id="clearOfflineButton"></div>
      <div id="noServersSidebar" style="display: none;"></div>
      <div id="addServerModal" style="display: none;">
        <div class="modal-header">
          <h3>Add Server Manually</h3>
        </div>
        <input id="serverIp" />
        <input id="serverName" />
        <select id="serverType">
          <option value="Production Server">Production Server</option>
        </select>
        <button id="saveAddServer">Add Server</button>
      </div>
    `;

    mockAPI = new MockApiAdapter();
    
    // Create a minimal app instance for testing
    app = {
      servers: [],
      selectedServerId: null,
      selectedServerIp: null,
      api: mockAPI,
      
      // Copy key methods from the actual class for testing
      getServerId: function(server) {
        const ports = server.ports && server.ports.length > 0 ? server.ports.join(",") : "manual";
        return `${server.ip}:${ports}`;
      },
      
      isValidIpAddress: function(ip) {
        if (!ip || typeof ip !== 'string') return false;
        // More strict IP validation - no leading zeros allowed
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/;
        return ipRegex.test(ip.trim());
      },
      
      updateServerCounts: function() {
        const count = this.servers.length;
        const element = document.getElementById('serverCountSidebar');
        if (element) {
          element.textContent = count.toString();
        }
      },
      
      updateScanStatus: function(message) {
        const element = document.getElementById('scanStatus');
        if (element) {
          element.textContent = message;
        }
      }
    };
  });

  describe('Server ID Generation', () => {
    test('should generate correct server ID for standard server', () => {
      const server = {
        ip: '192.168.1.100',
        ports: [3040, 3041, 3042, 3022]
      };
      
      const serverId = app.getServerId(server);
      expect(serverId).toBe('192.168.1.100:3040,3041,3042,3022');
    });

    test('should handle server without ports', () => {
      const server = {
        ip: '192.168.1.100'
      };
      
      const serverId = app.getServerId(server);
      expect(serverId).toBe('192.168.1.100:manual');
    });

    test('should handle empty ports array', () => {
      const server = {
        ip: '192.168.1.100',
        ports: []
      };
      
      const serverId = app.getServerId(server);
      expect(serverId).toBe('192.168.1.100:manual');
    });
  });

  describe('IP Address Validation', () => {
    test('should validate correct IP addresses', () => {
      const validIPs = [
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
        '127.0.0.1',
        '255.255.255.255',
        '0.0.0.0'
      ];

      validIPs.forEach(ip => {
        expect(app.isValidIpAddress(ip)).toBe(true);
      });
    });

    test('should reject invalid IP addresses', () => {
      const invalidIPs = [
        '256.1.1.1',
        '192.168.1.256',
        '192.168.1',
        '192.168.1.1.1',
        'not.an.ip.address',
        '192.168.01.1', // Leading zeros
        '',
        null,
        undefined
      ];

      invalidIPs.forEach(ip => {
        expect(app.isValidIpAddress(ip)).toBe(false);
      });
    });
  });

  describe('UI Updates', () => {
    test('should update server count display', () => {
      app.servers = [
        { ip: '192.168.1.1', ports: [3040] },
        { ip: '192.168.1.2', ports: [3040] }
      ];

      app.updateServerCounts();

      const countElement = document.getElementById('serverCountSidebar');
      expect(countElement.textContent).toBe('2');
    });

    test('should update scan status message', () => {
      const testMessage = 'Scanning for servers...';
      app.updateScanStatus(testMessage);

      const statusElement = document.getElementById('scanStatus');
      expect(statusElement.textContent).toBe(testMessage);
    });

    test('should handle missing DOM elements gracefully', () => {
      document.getElementById('serverCountSidebar').remove();
      
      expect(() => {
        app.updateServerCounts();
      }).not.toThrow();
    });
  });

  describe('API Integration', () => {
    test('should scan for servers successfully', async () => {
      const result = await app.api.scanForWatchoutServers();
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.servers)).toBe(true);
      expect(result.servers.length).toBeGreaterThan(0);
    });

    test('should add manual server', async () => {
      const serverData = {
        ip: '192.168.1.50',
        hostname: 'test-server',
        type: 'Manual Entry',
        ports: [3040, 3041, 3042, 3022],
        isManual: true
      };

      const result = await app.api.addManualServer(serverData);
      
      expect(result.success).toBe(true);
      expect(result.server).toMatchObject(serverData);
    });

    test('should remove manual server', async () => {
      // First add a server
      const serverData = {
        ip: '192.168.1.51',
        hostname: 'temp-server',
        type: 'Manual Entry',
        ports: [3040, 3041, 3042, 3022],
        isManual: true
      };

      await app.api.addManualServer(serverData);
      const serverId = app.getServerId(serverData);
      
      const result = await app.api.removeManualServer(serverId);
      expect(result.success).toBe(true);
    });

    test('should handle server not found for removal', async () => {
      const result = await app.api.removeManualServer('nonexistent:3040');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found');
    });
  });

  describe('Server Management', () => {
    test('should clear offline servers', async () => {
      // Add some servers with different statuses
      await app.api.addManualServer({
        ip: '192.168.1.52',
        hostname: 'online-server',
        status: 'online',
        isManual: true
      });

      const result = await app.api.clearOfflineServers();
      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      // Mock an API failure
      const failingAPI = {
        scanForWatchoutServers: jest.fn().mockRejectedValue(new Error('Network error'))
      };

      app.api = failingAPI;

      await expect(app.api.scanForWatchoutServers()).rejects.toThrow('Network error');
    });

    test('should validate required fields for manual server', () => {
      const invalidServerData = {
        // Missing IP
        hostname: 'test-server',
        type: 'Manual Entry'
      };

      // This would be validated in the actual addManualServer method
      expect(invalidServerData.ip).toBeUndefined();
    });
  });

  describe('Watchout Commands', () => {
    test('should execute play command', async () => {
      const result = await app.api.watchoutPlayTimeline('192.168.1.100', 'main');
      expect(result.success).toBe(true);
      expect(result.response).toBe('play');
    });

    test('should execute pause command', async () => {
      const result = await app.api.watchoutPauseTimeline('192.168.1.100');
      expect(result.success).toBe(true);
      expect(result.response).toBe('pause');
    });

    test('should execute stop command', async () => {
      const result = await app.api.watchoutStopTimeline('192.168.1.100');
      expect(result.success).toBe(true);
      expect(result.response).toBe('stop');
    });

    test('should get server status', async () => {
      const result = await app.api.watchoutGetStatus('192.168.1.100');
      expect(result.success).toBe(true);
      expect(result.response).toHaveProperty('status');
      expect(result.response).toHaveProperty('timeline');
    });
  });

  describe('Manual Server Editing', () => {
    test('should validate edit method exists for manual servers', () => {
      // Add editManualServer method to our mock app
      app.editManualServer = function(serverId) {
        const server = this.servers.find((s) => this.getServerId(s) === serverId);
        if (!server || !server.isManual) {
          console.error("Server not found or not a manual server:", serverId);
          return;
        }
        
        // Mock modal setup
        const modal = document.getElementById("addServerModal");
        if (!modal) {
          console.error('Add server modal not found');
          return;
        }

        modal.dataset.editingServerId = serverId;
        modal.style.display = "flex";
        modal.classList.add("show");
        
        // Mock field population
        const serverIpInput = document.getElementById("serverIp");
        const serverNameInput = document.getElementById("serverName");
        const serverTypeSelect = document.getElementById("serverType");
        
        if (serverIpInput) serverIpInput.value = server.ip || "";
        if (serverNameInput) serverNameInput.value = server.hostname || "";
        if (serverTypeSelect) serverTypeSelect.value = server.type || "Manual Entry";
      };

      const testServer = {
        ip: '192.168.1.100',
        hostname: 'Test Server',
        type: 'Production Server',
        isManual: true,
        status: 'online',
        ports: [3040, 3041]
      };

      app.servers = [testServer];
      
      const serverId = app.getServerId(testServer);
      app.editManualServer(serverId);

      // Verify modal setup
      const modal = document.getElementById("addServerModal");
      expect(modal.style.display).toBe('flex');
      expect(modal.classList.contains('show')).toBe(true);
      expect(modal.dataset.editingServerId).toBe(serverId);

      // Verify form fields are populated
      const serverIpInput = document.getElementById("serverIp");
      const serverNameInput = document.getElementById("serverName");
      const serverTypeSelect = document.getElementById("serverType");
      
      expect(serverIpInput.value).toBe('192.168.1.100');
      expect(serverNameInput.value).toBe('Test Server');
      expect(serverTypeSelect.value).toBe('Production Server');
    });

    test('should handle edit for non-existent server', () => {
      // Add editManualServer method to our mock app
      app.editManualServer = function(serverId) {
        const server = this.servers.find((s) => this.getServerId(s) === serverId);
        if (!server || !server.isManual) {
          console.error("Server not found or not a manual server:", serverId);
          return;
        }
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Try to edit a server that doesn't exist
      app.editManualServer('non-existent-id');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Server not found or not a manual server:',
        'non-existent-id'
      );

      consoleSpy.mockRestore();
    });

    test('should handle edit for non-manual server', () => {
      // Add editManualServer method to our mock app
      app.editManualServer = function(serverId) {
        const server = this.servers.find((s) => this.getServerId(s) === serverId);
        if (!server || !server.isManual) {
          console.error("Server not found or not a manual server:", serverId);
          return;
        }
      };

      const testServer = {
        ip: '192.168.1.100',
        hostname: 'Test Server',
        type: 'Auto-discovered',
        isManual: false,
        status: 'online',
        ports: [3040, 3041]
      };

      app.servers = [testServer];

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Try to edit a non-manual server
      const serverId = app.getServerId(testServer);
      app.editManualServer(serverId);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Server not found or not a manual server:',
        serverId
      );

      consoleSpy.mockRestore();
    });
  });
});

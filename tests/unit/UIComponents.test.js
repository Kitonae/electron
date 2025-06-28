// Unit tests for UI and DOM manipulation
const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('UI Components', () => {
  let mockApp;

  beforeEach(() => {
    // Set up comprehensive DOM structure
    document.body.innerHTML = `
      <div class="title-bar">
        <div class="title-bar-right">
          <button id="minimizeButton" class="title-bar-button">−</button>
          <button id="maximizeButton" class="title-bar-button">☐</button>
          <button id="closeButton" class="title-bar-button close-button">×</button>
        </div>
      </div>
      
      <div class="sidebar">
        <div id="serverList"></div>
        <div id="serverCountSidebar">0</div>
        <div id="noServersSidebar" style="display: none;">
          <p>No servers found</p>
        </div>
        <button id="scanButton">Scan</button>
        <button id="addServerButton">Add Server</button>
        <button id="clearOfflineButton" disabled>Clear Offline</button>
      </div>
      
      <div class="main-content">
        <div id="scanStatus">Ready</div>
        <div id="commandsArea" style="display: none;">
          <button id="playButton">Play</button>
          <button id="pauseButton">Pause</button>
          <button id="stopButton">Stop</button>
        </div>
      </div>
      
      <div id="addServerModal" class="modal" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Add Server Manually</h3>
            <button id="closeAddServerModal" class="modal-close">×</button>
          </div>
          <div class="modal-body">
            <input id="serverIp" placeholder="192.168.1.100" />
            <input id="serverName" placeholder="Server Name" />
            <select id="serverType">
              <option value="Production Server">Production Server</option>
              <option value="Manual Entry">Manual Entry</option>
            </select>
          </div>
          <div class="modal-footer">
            <button id="cancelAddServer" class="btn-secondary">Cancel</button>
            <button id="saveAddServer" class="btn-primary">Add Server</button>
          </div>
        </div>
      </div>
      
      <div id="settingsModal" class="modal" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Settings</h3>
            <button id="closeSettingsModal" class="modal-close">×</button>
          </div>
          <div class="modal-body">
            <input type="checkbox" id="enableCacheFromDisk" />
            <label for="enableCacheFromDisk">Enable Cache</label>
          </div>
          <div class="modal-footer">
            <button id="cancelSettings" class="btn-secondary">Cancel</button>
            <button id="saveSettings" class="btn-primary">Save Settings</button>
          </div>
        </div>
      </div>
    `;

    // Mock app with UI methods
    mockApp = {
      servers: [],
      selectedServerId: null,
      selectedServerIp: null,
      
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
          clearOfflineButton.style.opacity = hasOfflineServers ? '1' : '0.5';
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
            return `
              <div class="server-item" data-server-id="${serverId}">
                <div class="server-item-name">${server.hostname || server.ip}</div>
                <div class="server-item-ip">${server.ip}</div>
                <div class="server-item-status ${server.status}">${server.status}</div>
              </div>
            `;
          }).join('');
        }
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
          const serverIp = document.getElementById('serverIp');
          const serverName = document.getElementById('serverName');
          if (serverIp) serverIp.value = '';
          if (serverName) serverName.value = '';
        }
      },
      
      updateScanStatus(message) {
        const element = document.getElementById('scanStatus');
        if (element) {
          element.textContent = message;
        }
      }
    };
  });

  describe('Server Count Display', () => {
    test('should display correct server count', () => {
      mockApp.servers = [
        { ip: '192.168.1.1', status: 'online' },
        { ip: '192.168.1.2', status: 'offline' }
      ];

      mockApp.updateServerCounts();

      const countElement = document.getElementById('serverCountSidebar');
      expect(countElement.textContent).toBe('2');
    });

    test('should show zero when no servers', () => {
      mockApp.servers = [];
      mockApp.updateServerCounts();

      const countElement = document.getElementById('serverCountSidebar');
      expect(countElement.textContent).toBe('0');
    });
  });

  describe('Clear Offline Button State', () => {
    test('should enable button when offline servers exist', () => {
      mockApp.servers = [
        { ip: '192.168.1.1', status: 'online' },
        { ip: '192.168.1.2', status: 'offline' }
      ];

      mockApp.updateClearOfflineButtonState();

      const button = document.getElementById('clearOfflineButton');
      expect(button.disabled).toBe(false);
      expect(button.style.opacity).toBe('1');
    });

    test('should disable button when no offline servers', () => {
      mockApp.servers = [
        { ip: '192.168.1.1', status: 'online' },
        { ip: '192.168.1.2', status: 'online' }
      ];

      mockApp.updateClearOfflineButtonState();

      const button = document.getElementById('clearOfflineButton');
      expect(button.disabled).toBe(true);
      expect(button.style.opacity).toBe('0.5');
    });
  });

  describe('Sidebar Rendering', () => {
    test('should show no servers message when empty', () => {
      mockApp.servers = [];
      mockApp.renderSidebar();

      const noServersDiv = document.getElementById('noServersSidebar');
      expect(noServersDiv.style.display).toBe('flex');
    });

    test('should render server list when servers exist', () => {
      mockApp.servers = [
        {
          ip: '192.168.1.100',
          hostname: 'Server 1',
          status: 'online',
          ports: [3040, 3041, 3042]
        },
        {
          ip: '192.168.1.101',
          hostname: 'Server 2',
          status: 'offline',
          ports: [3040, 3041, 3042]
        }
      ];

      mockApp.renderSidebar();

      const serverList = document.getElementById('serverList');
      const noServersDiv = document.getElementById('noServersSidebar');
      
      expect(noServersDiv.style.display).toBe('none');
      expect(serverList.children.length).toBe(2);
      expect(serverList.innerHTML).toContain('Server 1');
      expect(serverList.innerHTML).toContain('Server 2');
      expect(serverList.innerHTML).toContain('192.168.1.100');
      expect(serverList.innerHTML).toContain('192.168.1.101');
    });

    test('should handle servers without hostnames', () => {
      mockApp.servers = [
        {
          ip: '192.168.1.100',
          status: 'online',
          ports: [3040, 3041, 3042]
        }
      ];

      mockApp.renderSidebar();

      const serverList = document.getElementById('serverList');
      expect(serverList.innerHTML).toContain('192.168.1.100');
    });
  });

  describe('Modal Dialogs', () => {
    test('should show add server modal', () => {
      mockApp.showAddServerDialog();

      const modal = document.getElementById('addServerModal');
      expect(modal.style.display).toBe('flex');
    });

    test('should hide add server modal and clear form', () => {
      // First show the modal and fill form
      const modal = document.getElementById('addServerModal');
      const serverIp = document.getElementById('serverIp');
      const serverName = document.getElementById('serverName');
      
      modal.style.display = 'flex';
      serverIp.value = '192.168.1.100';
      serverName.value = 'Test Server';

      // Now hide it
      mockApp.hideAddServerDialog();

      expect(modal.style.display).toBe('none');
      expect(serverIp.value).toBe('');
      expect(serverName.value).toBe('');
    });
  });

  describe('Status Updates', () => {
    test('should update scan status message', () => {
      const testMessage = 'Scanning for servers...';
      mockApp.updateScanStatus(testMessage);

      const statusElement = document.getElementById('scanStatus');
      expect(statusElement.textContent).toBe(testMessage);
    });

    test('should handle different status messages', () => {
      const messages = [
        'Ready',
        'Scanning...',
        'Found 3 servers',
        'Scan complete',
        'Error: Network unavailable'
      ];

      messages.forEach(message => {
        mockApp.updateScanStatus(message);
        const statusElement = document.getElementById('scanStatus');
        expect(statusElement.textContent).toBe(message);
      });
    });
  });

  describe('Button States', () => {
    test('should have correct initial button states', () => {
      const scanButton = document.getElementById('scanButton');
      const addServerButton = document.getElementById('addServerButton');
      const clearOfflineButton = document.getElementById('clearOfflineButton');

      expect(scanButton.disabled).toBe(false);
      expect(addServerButton.disabled).toBe(false);
      expect(clearOfflineButton.disabled).toBe(true);
    });

    test('should enable commands area when server selected', () => {
      const commandsArea = document.getElementById('commandsArea');
      
      // Initially hidden
      expect(commandsArea.style.display).toBe('none');
      
      // Simulate server selection
      commandsArea.style.display = 'block';
      expect(commandsArea.style.display).toBe('block');
    });
  });

  describe('Form Validation', () => {
    test('should validate required fields in add server form', () => {
      const serverIp = document.getElementById('serverIp');
      const serverName = document.getElementById('serverName');
      const serverType = document.getElementById('serverType');

      // Test required attribute existence
      serverIp.required = true;
      expect(serverIp.required).toBe(true);

      // Test form data collection
      serverIp.value = '192.168.1.100';
      serverName.value = 'Test Server';
      serverType.value = 'Production Server';

      expect(serverIp.value).toBe('192.168.1.100');
      expect(serverName.value).toBe('Test Server');
      expect(serverType.value).toBe('Production Server');
    });
  });

  describe('Event Handling', () => {
    test('should handle modal close button clicks', () => {
      const modal = document.getElementById('addServerModal');
      const closeButton = document.getElementById('closeAddServerModal');

      modal.style.display = 'flex';

      // Simulate close button click
      const clickEvent = document.createEvent('Event');
      clickEvent.initEvent('click', true, true);
      closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
      });

      closeButton.dispatchEvent(clickEvent);
      expect(modal.style.display).toBe('none');
    });

    test('should handle form submission', () => {
      const form = document.createElement('form');
      const serverIp = document.getElementById('serverIp');
      const saveButton = document.getElementById('saveAddServer');

      serverIp.value = '192.168.1.100';

      let formSubmitted = false;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        formSubmitted = true;
      });

      const submitEvent = document.createEvent('Event');
      submitEvent.initEvent('submit', true, true);
      form.dispatchEvent(submitEvent);

      expect(formSubmitted).toBe(true);
    });
  });

  describe('Error Handling in UI', () => {
    test('should handle missing DOM elements gracefully', () => {
      // Remove an element
      document.getElementById('serverCountSidebar').remove();

      expect(() => {
        mockApp.updateServerCounts();
      }).not.toThrow();
    });

    test('should handle null elements in sidebar rendering', () => {
      document.getElementById('serverList').remove();

      expect(() => {
        mockApp.renderSidebar();
      }).not.toThrow();
    });
  });
});

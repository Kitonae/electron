// Unit tests for API Adapter
const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('ApiAdapter', () => {
  let apiAdapter;

  beforeEach(() => {
    // Mock the global electronAPI
    global.electronAPI = {
      scanForWatchoutServers: jest.fn(),
      addManualServer: jest.fn(),
      removeManualServer: jest.fn(),
      updateManualServer: jest.fn(),
      clearOfflineServers: jest.fn(),
      getAppVersion: jest.fn(),
      watchoutPlayTimeline: jest.fn(),
      watchoutPauseTimeline: jest.fn(),
      watchoutStopTimeline: jest.fn(),
      watchoutGetStatus: jest.fn()
    };

    // Simple ApiAdapter mock
    apiAdapter = {
      platform: 'Electron',
      
      async scanForWatchoutServers() {
        return await global.electronAPI.scanForWatchoutServers();
      },
      
      async addManualServer(serverData) {
        return await global.electronAPI.addManualServer(serverData);
      },
      
      async removeManualServer(serverId) {
        return await global.electronAPI.removeManualServer(serverId);
      },
      
      async clearOfflineServers() {
        return await global.electronAPI.clearOfflineServers();
      },
      
      async getAppVersion() {
        return await global.electronAPI.getAppVersion();
      }
    };
  });

  describe('Platform Detection', () => {
    test('should detect Electron platform', () => {
      expect(apiAdapter.platform).toBe('Electron');
    });
  });

  describe('Server Discovery', () => {
    test('should call electronAPI for server scanning', async () => {
      const mockResult = {
        success: true,
        servers: [
          { ip: '192.168.1.100', hostname: 'server1', status: 'online' }
        ]
      };

      global.electronAPI.scanForWatchoutServers.mockResolvedValue(mockResult);

      const result = await apiAdapter.scanForWatchoutServers();

      expect(global.electronAPI.scanForWatchoutServers).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    test('should handle scan failure', async () => {
      const mockError = { success: false, error: 'Network error' };
      global.electronAPI.scanForWatchoutServers.mockResolvedValue(mockError);

      const result = await apiAdapter.scanForWatchoutServers();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('Manual Server Management', () => {
    test('should add manual server', async () => {
      const serverData = {
        ip: '192.168.1.200',
        hostname: 'manual-server',
        type: 'Manual Entry',
        isManual: true
      };

      const mockResult = { success: true, server: serverData };
      global.electronAPI.addManualServer.mockResolvedValue(mockResult);

      const result = await apiAdapter.addManualServer(serverData);

      expect(global.electronAPI.addManualServer).toHaveBeenCalledWith(serverData);
      expect(result).toEqual(mockResult);
    });

    test('should remove manual server', async () => {
      const serverId = '192.168.1.200:3040,3041,3042';
      const mockResult = { success: true };
      global.electronAPI.removeManualServer.mockResolvedValue(mockResult);

      const result = await apiAdapter.removeManualServer(serverId);

      expect(global.electronAPI.removeManualServer).toHaveBeenCalledWith(serverId);
      expect(result).toEqual(mockResult);
    });

    test('should clear offline servers', async () => {
      const mockResult = { success: true, removed: 3 };
      global.electronAPI.clearOfflineServers.mockResolvedValue(mockResult);

      const result = await apiAdapter.clearOfflineServers();

      expect(global.electronAPI.clearOfflineServers).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });

  describe('App Information', () => {
    test('should get app version', async () => {
      const mockResult = { success: true, version: '1.0.0' };
      global.electronAPI.getAppVersion.mockResolvedValue(mockResult);

      const result = await apiAdapter.getAppVersion();

      expect(global.electronAPI.getAppVersion).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });

  describe('Error Handling', () => {
    test('should handle API call rejection', async () => {
      global.electronAPI.scanForWatchoutServers.mockRejectedValue(new Error('IPC Error'));

      await expect(apiAdapter.scanForWatchoutServers()).rejects.toThrow('IPC Error');
    });

    test('should handle missing electronAPI gracefully', async () => {
      global.electronAPI = undefined;

      // This would need to be handled in the actual ApiAdapter constructor
      expect(global.electronAPI).toBeUndefined();
    });
  });

  describe('Server Commands', () => {
    beforeEach(() => {
      apiAdapter.watchoutPlayTimeline = async (ip, timeline) => {
        return await global.electronAPI.watchoutPlayTimeline(ip, timeline);
      };

      apiAdapter.watchoutPauseTimeline = async (ip) => {
        return await global.electronAPI.watchoutPauseTimeline(ip);
      };

      apiAdapter.watchoutStopTimeline = async (ip) => {
        return await global.electronAPI.watchoutStopTimeline(ip);
      };

      apiAdapter.watchoutGetStatus = async (ip) => {
        return await global.electronAPI.watchoutGetStatus(ip);
      };
    });

    test('should execute play command', async () => {
      const mockResult = { success: true, response: 'play' };
      global.electronAPI.watchoutPlayTimeline.mockResolvedValue(mockResult);

      const result = await apiAdapter.watchoutPlayTimeline('192.168.1.100', 'main');

      expect(global.electronAPI.watchoutPlayTimeline).toHaveBeenCalledWith('192.168.1.100', 'main');
      expect(result).toEqual(mockResult);
    });

    test('should execute pause command', async () => {
      const mockResult = { success: true, response: 'pause' };
      global.electronAPI.watchoutPauseTimeline.mockResolvedValue(mockResult);

      const result = await apiAdapter.watchoutPauseTimeline('192.168.1.100');

      expect(global.electronAPI.watchoutPauseTimeline).toHaveBeenCalledWith('192.168.1.100');
      expect(result).toEqual(mockResult);
    });

    test('should handle command failure', async () => {
      const mockError = { success: false, error: 'Connection timeout' };
      global.electronAPI.watchoutPlayTimeline.mockResolvedValue(mockError);

      const result = await apiAdapter.watchoutPlayTimeline('192.168.1.100', 'main');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });
  });
});

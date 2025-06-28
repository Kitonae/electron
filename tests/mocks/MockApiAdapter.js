// Mock API Adapter for testing
class MockApiAdapter {
  constructor() {
    this.platform = 'test';
    this.reset();
  }

  reset() {
    this.servers = [
      {
        ip: '192.168.1.100',
        hostname: 'test-server-1',
        ports: [3040, 3041, 3042, 3022],
        type: 'Production Server',
        status: 'online',
        isManual: false,
        discoveryMethod: 'multicast'
      },
      {
        ip: '127.0.0.1',
        hostname: 'localhost',
        ports: [3040, 3041, 3042, 3022],
        type: 'Manual Entry',
        status: 'online',
        isManual: true,
        discoveryMethod: 'manual'
      }
    ];
  }

  async scanForWatchoutServers() {
    return {
      success: true,
      servers: [...this.servers]
    };
  }

  async addManualServer(serverData) {
    const newServer = {
      ...serverData,
      discoveredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      firstDiscoveredAt: new Date().toISOString()
    };
    this.servers.push(newServer);
    return { success: true, server: newServer };
  }

  async updateManualServer(serverId, serverData) {
    const index = this.servers.findIndex(s => {
      const ports = s.ports && s.ports.length > 0 ? s.ports.join(',') : 'manual';
      return `${s.ip}:${ports}` === serverId;
    });
    if (index !== -1) {
      this.servers[index] = { ...this.servers[index], ...serverData };
      return { success: true, server: this.servers[index] };
    }
    return { success: false, error: 'Server not found' };
  }

  async removeManualServer(serverId) {
    const index = this.servers.findIndex(s => {
      const ports = s.ports && s.ports.length > 0 ? s.ports.join(',') : 'manual';
      return `${s.ip}:${ports}` === serverId;
    });
    if (index !== -1) {
      this.servers.splice(index, 1);
      return { success: true };
    }
    return { success: false, error: 'Server not found' };
  }

  async clearOfflineServers() {
    const beforeCount = this.servers.length;
    this.servers = this.servers.filter(s => s.status === 'online');
    return { 
      success: true, 
      removed: beforeCount - this.servers.length 
    };
  }

  async getAppVersion() {
    return { success: true, version: '1.0.0-test' };
  }

  async watchoutPlayTimeline(ip, timeline) {
    return { success: true, response: 'play' };
  }

  async watchoutPauseTimeline(ip) {
    return { success: true, response: 'pause' };
  }

  async watchoutStopTimeline(ip) {
    return { success: true, response: 'stop' };
  }

  async watchoutGetStatus(ip) {
    return { 
      success: true, 
      response: {
        status: 'idle',
        timeline: 'main',
        position: '00:00:00:00'
      }
    };
  }
}

module.exports = MockApiAdapter;

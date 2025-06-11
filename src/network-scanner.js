const nmap = require('node-nmap');
const dgram = require('dgram');

// Try to load bonjour-service, fall back gracefully if not available
let bonjour;
try {
  bonjour = require('bonjour-service')();
} catch (error) {
  console.warn('Bonjour service not available:', error.message);
  bonjour = null;
}

// Watchout 7 discovery configuration
// Multicast Discovery Protocol:
// - Multicast IP: 239.2.2.2
// - Query Port: 3011 (send discovery requests)
// - Response Port: 3012 (receive discovery responses)
// - Operational Ports: 3040, 3041, 3042 (main Watchout services)
const WATCHOUT_PORTS = [3040, 3041, 3042]; // Common Watchout operational ports
const WATCHOUT_MULTICAST_IP = '239.2.2.2'; // Watchout multicast discovery IP
const WATCHOUT_QUERY_PORT = 3011; // Watchout discovery query port
const WATCHOUT_RESPONSE_PORT = 3012; // Watchout discovery response port
const TIMEOUT_MS = 5000;

class WatchoutServerFinder {
  constructor() {
    this.servers = new Map();
  }  async findWatchoutServers() {
    console.log('Starting Watchout server discovery...');
    
    const discoveryMethods = [
      this.scanNetworkPorts(),
      this.listenForMulticast(),
      this.bonjourDiscovery()
    ];

    try {
      await Promise.allSettled(discoveryMethods);
      return Array.from(this.servers.values());
    } catch (error) {
      console.error('Error during server discovery:', error);
      throw error;
    }
  }  async scanNetworkPorts() {
    return new Promise((resolve) => {
      // Check if nmap is available
      try {
        // Get local network range (simplified - assumes 192.168.x.x)
        const networkRange = '192.168.1.1-254';
        
        // Include both operational and discovery ports
        const allWatchoutPorts = [...WATCHOUT_PORTS, WATCHOUT_QUERY_PORT, WATCHOUT_RESPONSE_PORT];
        
        nmap.nmapLocation = 'nmap'; // Assumes nmap is in PATH
        
        const nmapScan = new nmap.NmapScan(networkRange, '-p ' + allWatchoutPorts.join(','));
        
        nmapScan.on('complete', (data) => {
          data.forEach(host => {
            if (host.openPorts && host.openPorts.length > 0) {
              const watchoutPorts = host.openPorts.filter(port => 
                allWatchoutPorts.includes(parseInt(port.port))
              );
              
              if (watchoutPorts.length > 0) {
                const foundPorts = watchoutPorts.map(p => parseInt(p.port));
                let serverType = 'Watchout Server (Port Scan)';
                
                // Determine server type based on ports
                if (foundPorts.includes(WATCHOUT_QUERY_PORT) || foundPorts.includes(WATCHOUT_RESPONSE_PORT)) {
                  serverType = 'Watchout Server with Discovery (Port Scan)';
                }
                
                this.addServer({
                  ip: host.ip,
                  hostname: host.hostname || host.ip,
                  ports: foundPorts,
                  type: serverType,
                  discoveryMethod: 'port-scan'
                });
              }
            }
          });
          resolve();
        });

        nmapScan.on('error', (error) => {
          console.warn('Nmap scan failed:', error.message);
          console.log('Note: Install nmap for port scanning functionality');
          resolve(); // Don't reject, just continue with other methods
        });

        nmapScan.startScan();
      } catch (error) {
        console.warn('Nmap not available:', error.message);
        console.log('Port scanning will be skipped. Install nmap for this functionality.');
        resolve();
      }
    });
  }  async listenForMulticast() {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');

      socket.on('message', (message, remote) => {
        const messageStr = message.toString();
        
        // Try to parse as JSON first (Watchout response format)
        try {
          const jsonResponse = JSON.parse(messageStr);
          if (this.isWatchoutJsonResponse(jsonResponse)) {
            this.addWatchoutServerFromJson(jsonResponse, remote);
            return;
          }
        } catch (error) {
          // Not JSON, check for other Watchout identifiers
        }
        
        // Fallback to text-based identification
        if (this.isWatchoutMessage(messageStr)) {
          this.addServer({
            ip: remote.address,
            hostname: remote.address,
            ports: [remote.port],
            type: 'Watchout Server (Multicast)',
            discoveryMethod: 'multicast',
            message: messageStr
          });
        }
      });

      socket.on('error', (error) => {
        console.warn('Multicast listen failed:', error.message);
        resolve();
      });

      try {
        // Bind to Watchout response port and join multicast group
        socket.bind(WATCHOUT_RESPONSE_PORT, () => {
          try {
            socket.addMembership(WATCHOUT_MULTICAST_IP);
            console.log(`Listening for Watchout multicast on ${WATCHOUT_MULTICAST_IP}:${WATCHOUT_RESPONSE_PORT}`);
            
            // Send discovery query to Watchout multicast address
            this.sendWatchoutDiscoveryQuery(socket);
          } catch (membershipError) {
            console.warn('Failed to join Watchout multicast group:', membershipError.message);
          }
        });
      } catch (error) {
        console.warn('Failed to bind to Watchout discovery port:', error.message);
        resolve();
      }

      // Stop listening after timeout
      setTimeout(() => {
        try {
          socket.close();
        } catch (error) {
          // Socket may already be closed
        }
        resolve();
      }, TIMEOUT_MS);
    });
  }
  sendWatchoutDiscoveryQuery(socket) {
    try {
      // Send the official Watchout 7 discovery message
      const discoveryMessage = Buffer.from('discovery_ping', 'ascii');
      
      socket.send(discoveryMessage, WATCHOUT_QUERY_PORT, WATCHOUT_MULTICAST_IP, (error) => {
        if (error) {
          console.warn('Failed to send Watchout discovery query:', error.message);
        } else {
          console.log(`Sent Watchout discovery query 'discovery_ping' to ${WATCHOUT_MULTICAST_IP}:${WATCHOUT_QUERY_PORT}`);
        }
      });
    } catch (error) {
      console.warn('Error sending Watchout discovery query:', error.message);
    }
  }
  async bonjourDiscovery() {
    return new Promise((resolve) => {
      // Skip if bonjour is not available
      if (!bonjour) {
        console.log('Skipping Bonjour discovery - service not available');
        resolve();
        return;
      }

      // Look for any service that might be Watchout-related
      const browser = bonjour.find({ type: 'tcp' });

      browser.on('up', (service) => {
        if (this.isWatchoutService(service)) {
          this.addServer({
            ip: service.addresses?.[0] || service.host,
            hostname: service.name || service.host,
            ports: [service.port],
            type: 'Watchout Server (Bonjour)',
            discoveryMethod: 'bonjour',
            service: service
          });
        }
      });      // Stop discovery after timeout
      setTimeout(() => {
        if (bonjour && browser) {
          browser.stop();
        }
        resolve();
      }, TIMEOUT_MS);
    });
  }
  isWatchoutMessage(message) {
    const watchoutIdentifiers = [
      'watchout',
      'dataton',
      'production',
      'display'
    ];
    
    const lowerMessage = message.toLowerCase();
    return watchoutIdentifiers.some(identifier => 
      lowerMessage.includes(identifier)
    );
  }
  isWatchoutJsonResponse(jsonObj) {
    // Check if the JSON object has the expected Watchout response structure
    // Support both underscore and camelCase field names
    return jsonObj && 
           (jsonObj.hostRef !== undefined || jsonObj.host_ref !== undefined ||
            jsonObj.machineId !== undefined || jsonObj.machine_id !== undefined ||
            jsonObj.services !== undefined ||
            jsonObj.version !== undefined ||
            jsonObj.wo7 !== undefined ||
            jsonObj.wo6 !== undefined);
  }
  addWatchoutServerFromJson(jsonResponse, remote) {
    // Extract detailed information from the JSON response
    // Map underscore fields to camelCase for consistency
    const hostRef = jsonResponse.host_ref || jsonResponse.hostRef;
    const machineId = jsonResponse.machine_id || jsonResponse.machineId;
    const dirShow = jsonResponse.dir_show || jsonResponse.dirShow;
    const runShow = jsonResponse.run_show || jsonResponse.runShow;
    const woTime = jsonResponse.wo_time || jsonResponse.woTime;
    
    const serverInfo = {
      ip: remote.address,
      hostname: hostRef || remote.address,
      ports: [remote.port],
      type: this.determineServerType(jsonResponse),
      discoveryMethod: 'multicast-json',
      
      // Watchout-specific details (normalized to camelCase)
      hostRef: hostRef,
      machineId: machineId,
      services: jsonResponse.services || [],
      version: jsonResponse.version,
      dirShow: dirShow,
      runShow: runShow,
      woTime: woTime,
      interfaces: jsonResponse.interfaces || [],
      capabilities: {
        artnet: jsonResponse.artnet,
        osc: jsonResponse.osc,
        webui: jsonResponse.webui,
        wo7: jsonResponse.wo7,
        wo6: jsonResponse.wo6
      },
      licensed: jsonResponse.licensed,
      rawResponse: jsonResponse
    };

    this.addServer(serverInfo);
  }

  determineServerType(jsonResponse) {
    const services = jsonResponse.services || [];
    const hasDirector = services.includes('Director');
    const hasAssetManager = services.includes('AssetManager');
    const hasDisplay = services.includes('Display');
    
    if (hasDirector && hasAssetManager) {
      return 'Watchout Production Server (JSON)';
    } else if (hasDirector) {
      return 'Watchout Director Server (JSON)';
    } else if (hasDisplay) {
      return 'Watchout Display Server (JSON)';
    } else if (hasAssetManager) {
      return 'Watchout Asset Manager (JSON)';
    } else {
      return `Watchout Server v${jsonResponse.version || 'Unknown'} (JSON)`;
    }
  }
  isWatchoutService(service) {
    const serviceName = (service.name || '').toLowerCase();
    const serviceType = (service.type || '').toLowerCase();
    
    const watchoutIdentifiers = [
      'watchout',
      'dataton',
      'production'
    ];
    
    // Check for Watchout identifiers in service name/type or known Watchout ports
    const allWatchoutPorts = [...WATCHOUT_PORTS, WATCHOUT_QUERY_PORT, WATCHOUT_RESPONSE_PORT];
    
    return watchoutIdentifiers.some(identifier => 
      serviceName.includes(identifier) || serviceType.includes(identifier)
    ) || allWatchoutPorts.includes(service.port);
  }

  addServer(serverInfo) {
    const key = `${serverInfo.ip}:${serverInfo.ports.join(',')}`;
    
    if (!this.servers.has(key)) {
      serverInfo.discoveredAt = new Date().toISOString();
      this.servers.set(key, serverInfo);
      console.log('Found Watchout server:', serverInfo);
    } else {
      // Update existing server with additional info
      const existing = this.servers.get(key);
      this.servers.set(key, { ...existing, ...serverInfo });
    }
  }
}

const finder = new WatchoutServerFinder();

module.exports = {
  findWatchoutServers: () => finder.findWatchoutServers()
};

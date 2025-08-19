const dgram = require('dgram');
const http = require('http');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { Logger } = require('./logger');

// Try to load node-nmap, fall back gracefully if not available
let nmap;
try {
  nmap = require('node-nmap');
} catch (error) {
  // Logger not available yet at module level, will log later in class
  nmap = null;
}

// Try to load bonjour-service, fall back gracefully if not available
let bonjour;
try {
  bonjour = require('bonjour-service')();
} catch (error) {
  // Logger not available yet at module level, will log later in class
  bonjour = null;
}

// Watchout 7 discovery configuration
// Multicast Discovery Protocol:
// - Multicast IP: 239.2.2.2
// - Query Port: 3011 (send discovery requests)
// - Response Port: 3012 (receive discovery responses)
// - Operational Ports: 3040, 3041, 3042 (main Watchout services)
// - Loki Log Port: 3022 (log aggregation service)
const WATCHOUT_PORTS = [3040, 3041, 3042, 3022]; // Common Watchout operational ports + Loki
const WATCHOUT_MULTICAST_IP = '239.2.2.2'; // Watchout multicast discovery IP
const WATCHOUT_QUERY_PORT = 3011; // Watchout discovery query port
const WATCHOUT_RESPONSE_PORT = 3012; // Watchout discovery response port
const TIMEOUT_MS = 5000;
// Optional HTTP discovery endpoint (used when local conflicts prevent scanning)
const WATCHOUT_HTTP_DISCOVERY_URL = process.env.WATCHOUT_DISCOVERY_URL || 'http://localhost:3017/v0/discovered';

// Cache configuration
const CACHE_FILE_NAME = 'watchout-assistant-cache.json';
const CACHE_EXPIRY_HOURS = 24; // Cache servers for 24 hours

class WatchoutAssistant {
  constructor() {
    this.logger = new Logger({ component: 'NET-SCANNER' });
    this.servers = new Map();
    this.serverCache = new Map(); // Cache to track all discovered servers
    this.lastScanTime = null;
    this.cacheFilePath = null;
    this.missedScans = new Map(); // Track missed scan counts per server
    
    // Log module availability
    if (!nmap) {
      this.logger.warn('node-nmap package not available - nmap scanning disabled');
    }
    if (!bonjour) {
      this.logger.warn('Bonjour service not available - service discovery limited');
    }
    
    this.initializeCachePath();
  }

  async initializeCachePath() {
    try {
      // Use userData directory for cache file
      const { app } = require('electron');
      const userDataPath = app.getPath('userData');
      
      // Ensure the directory exists
      await fs.mkdir(userDataPath, { recursive: true });
      
      this.cacheFilePath = path.join(userDataPath, CACHE_FILE_NAME);
      this.logger.info('Cache file path initialized', { path: this.cacheFilePath });
      
      // Test write permissions
      try {
        await fs.access(userDataPath, fs.constants.W_OK);
      } catch (permissionError) {
        console.warn('No write permission for userData directory, using fallback');
        throw permissionError;
      }
      
      // Load existing cache on startup
      await this.loadCacheFromFile();
    } catch (error) {
      console.error('Error initializing cache path:', error);
      // Fallback to local directory
      try {
        const fallbackDir = path.join(__dirname, '..', 'cache');
        await fs.mkdir(fallbackDir, { recursive: true });
        this.cacheFilePath = path.join(fallbackDir, CACHE_FILE_NAME);
        this.logger.info('Using fallback cache path', { path: this.cacheFilePath });
        await this.loadCacheFromFile();
      } catch (fallbackError) {
        this.logger.error('Failed to create fallback cache directory', { error: fallbackError.message });
        this.cacheFilePath = null; // Disable caching
      }
    }
  }
  async loadCacheFromFile() {
    try {
      if (!this.cacheFilePath) {
        this.logger.debug('No cache file path available, skipping cache load');
        return;
      }
      
      // Check if cache file exists
      try {
        await fs.access(this.cacheFilePath);
      } catch (accessError) {
        this.logger.debug('Cache file does not exist yet, will create on first save');
        return;
      }
      
      const cacheData = await fs.readFile(this.cacheFilePath, 'utf8');
      const parsedCache = JSON.parse(cacheData);
      
      // Validate and load cache entries
      if (parsedCache && parsedCache.servers && Array.isArray(parsedCache.servers)) {
        const now = new Date();
        let loadedCount = 0;
        
        for (const serverData of parsedCache.servers) {
          // Check if cache entry is not expired
          const lastSeen = new Date(serverData.lastSeenAt);
          const hoursSinceLastSeen = (now - lastSeen) / (1000 * 60 * 60);
          
          if (hoursSinceLastSeen < CACHE_EXPIRY_HOURS) {
            const serverId = this.getServerId(serverData);
            serverData.status = 'offline'; // Mark cached servers as offline initially
            this.serverCache.set(serverId, serverData);
            loadedCount++;
          }
        }
        
        // Load missed scan counts if available
        if (parsedCache.missedScans && typeof parsedCache.missedScans === 'object') {
          this.missedScans = new Map(Object.entries(parsedCache.missedScans));
          this.logger.debug('Loaded missed scan counts', { serverCount: this.missedScans.size });
        }
        
        this.logger.info('Cache loaded successfully', { serverCount: loadedCount });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading cache from file:', error);
      }
    }
  }
  async saveCacheToFile() {
    try {
      if (!this.cacheFilePath) {
        this.logger.debug('No cache file path available, skipping cache save');
        return;
      }
      
      const cacheData = {
        lastUpdated: new Date().toISOString(),
        servers: Array.from(this.serverCache.values()),
        missedScans: Object.fromEntries(this.missedScans)
      };
      
      // Ensure directory exists before writing
      const cacheDir = path.dirname(this.cacheFilePath);
      await fs.mkdir(cacheDir, { recursive: true });
      
      await fs.writeFile(this.cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
      this.logger.debug('Cache saved successfully', { serverCount: cacheData.servers.length });
    } catch (error) {
      console.error('Error saving cache to file:', error);
      // If writing to cache fails, try to disable caching to prevent future errors
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        console.warn('Cache write permission denied, disabling cache for this session');
        this.cacheFilePath = null;
      }
    }
  }

  getServerId(server) {
    // Create a unique identifier for the server
    return `${server.ip}:${server.ports.join(',')}`;
  }

  async findWatchoutServers() {
    this.logger.info('Starting Watchout server discovery...');
    
    // Clear current scan results but keep cache
    this.servers.clear();
    this.lastScanTime = new Date().toISOString();
      const discoveryMethods = [
      this.scanNetworkPorts().catch(err => {
        this.logger.debug('Port scanning skipped', { reason: err?.message || 'Nmap not available' });
        return [];
      }),
      this.listenForMulticast().catch(err => {
        console.warn('Multicast scan failed:', err?.message || 'Unknown multicast error');
        return [];
      }),
      this.bonjourDiscovery().catch(err => {
        console.warn('Bonjour scan failed:', err?.message || 'Bonjour service not available');
        return [];
      }),
      // HTTP fallback discovery: tolerate failures silently and just continue
      this.httpDiscovery().catch(err => {
        this.logger.debug('HTTP discovery skipped', { reason: err?.message || 'Endpoint unavailable' });
        return [];
      })
    ];try {
      await Promise.allSettled(discoveryMethods);

      // Merge duplicates from multiple discovery paths, prefer richer data
      this.coalesceServersByIp();
        // Process cached servers and mark offline ones
      this.processCachedServers();
      
      // Save updated cache to file
      await this.saveCacheToFile();
      
      const totalServers = Array.from(this.servers.values());
      const onlineServers = totalServers.filter(s => s.status === 'online');
      const offlineServers = totalServers.filter(s => s.status === 'offline');
      
      this.logger.info('Discovery complete', { 
        online: onlineServers.length, 
        offline: offlineServers.length,
        source: 'cached'
      });
      
      return totalServers;    } catch (error) {
      console.error('Error during server discovery:', error?.message || 'Unknown discovery error');
      throw error;
    }
  }  async scanNetworkPorts() {
    return new Promise(async (resolve) => {
      // Check if nmap package is available
      if (!nmap) {
        this.logger.warn('Nmap package not installed - skipping port scan');
        resolve();
        return;
      }

      // Check if nmap executable is available
      const nmapAvailable = await this.checkNmapAvailability();
      if (!nmapAvailable) {
        this.logger.warn('Nmap executable not found - skipping port scan');
        this.logger.info('Note: Install nmap from https://nmap.org/download.html for enhanced server discovery');
        resolve();
        return;
      }

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
          const errorMsg = error?.message || error?.toString() || 'Unknown nmap error';
          console.warn('Nmap scan failed:', errorMsg);
          console.log('Note: Install nmap for enhanced port scanning functionality');
          resolve(); // Don't reject, just continue with other methods
        });

        nmapScan.startScan();
      } catch (error) {
        const errorMsg = error?.message || error?.toString() || 'Unknown error initializing nmap';
        this.logger.warn('Nmap scan skipped', { reason: errorMsg });
        this.logger.info('Note: Install nmap from https://nmap.org/download.html for enhanced server discovery');
        resolve();
      }
    });
  }async listenForMulticast() {
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
            this.logger.debug('Listening for Watchout multicast', { 
              ip: WATCHOUT_MULTICAST_IP, 
              port: WATCHOUT_RESPONSE_PORT 
            });
            
            // Send discovery query to Watchout multicast address
            this.sendWatchoutDiscoveryQuery(socket);
          } catch (membershipError) {
            this.logger.warn('Failed to join Watchout multicast group', { error: membershipError.message });
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

  /**
   * HTTP-based discovery fallback
   * Attempts to fetch discovery JSON from a local helper service.
   */
  async httpDiscovery() {
    return new Promise(async (resolve) => {
      try {
        const url = WATCHOUT_HTTP_DISCOVERY_URL;
        this.logger.debug('Attempting HTTP discovery', { url });

        const data = await this.fetchJson(url);
        if (!data) {
          this.logger.debug('No data from HTTP discovery');
          resolve();
          return;
        }

        // Normalize possible container shapes
        const candidates = Array.isArray(data)
          ? data
          : Array.isArray(data.servers)
            ? data.servers
            : Array.isArray(data.discovered)
              ? data.discovered
              : Array.isArray(data.items)
                ? data.items
                : Array.isArray(data.data)
                  ? data.data
                  : [];

        for (const item of candidates) {
          try {
            const serverInfo = this.normalizeHttpDiscoveredItem(item);
            if (serverInfo) {
              this.addServer(serverInfo);
            }
          } catch (e) {
            this.logger.debug('Failed to normalize HTTP discovery item', { error: e?.message });
          }
        }
      } catch (error) {
        // Swallow errors to keep this as a true fallback
        this.logger.debug('HTTP discovery failed', { error: error?.message || String(error) });
      } finally {
        resolve();
      }
    });
  }

  /**
   * Coalesce multiple discovered entries for the same IP into a single rich record.
   * Prefers entries with Watchout-specific fields and merges ports/services/capabilities.
   */
  coalesceServersByIp() {
    try {
      const byIp = new Map();
      for (const server of this.servers.values()) {
        const ip = server.ip;
        if (!ip) continue;
        if (!byIp.has(ip)) {
          byIp.set(ip, { ...server, ports: [...new Set(server.ports || [])] });
          continue;
        }

        const existing = byIp.get(ip);

        // Merge arrays with uniqueness
        const mergeUnique = (a = [], b = []) => Array.from(new Set([...(a || []), ...(b || [])]));

        const mergedPorts = mergeUnique(existing.ports, server.ports);
        const mergedServices = mergeUnique(existing.services, server.services);

        // Capabilities: merge truthy booleans
        const mergedCaps = Object.assign({}, existing.capabilities || {}, server.capabilities || {});

        // Choose more specific type if services available
        let type = existing.type;
        if (mergedServices.length > 0) {
          type = this.determineServerType({ services: mergedServices, version: server.version || existing.version });
        }

        // Status: online if any entry is online
        const status = (existing.status === 'online' || server.status === 'online') ? 'online' : (server.status || existing.status || 'online');

        // Prefer more detailed identity fields when available
        const hostRef = server.hostRef || existing.hostRef;
        const machineId = server.machineId || existing.machineId;
        const version = server.version || existing.version;
        const dirShow = server.dirShow || existing.dirShow;
        const runShow = server.runShow || existing.runShow;
        const woTime = (server.woTime !== undefined ? server.woTime : existing.woTime);

        // Interfaces: merge
        const interfaces = mergeUnique(existing.interfaces, server.interfaces);

        // Timestamps
        const discoveredAt = existing.discoveredAt && server.discoveredAt ? (new Date(existing.discoveredAt) <= new Date(server.discoveredAt) ? existing.discoveredAt : server.discoveredAt) : (existing.discoveredAt || server.discoveredAt);
        const lastSeenAt = existing.lastSeenAt && server.lastSeenAt ? (new Date(existing.lastSeenAt) >= new Date(server.lastSeenAt) ? existing.lastSeenAt : server.lastSeenAt) : (existing.lastSeenAt || server.lastSeenAt);
        const firstDiscoveredAt = existing.firstDiscoveredAt || server.firstDiscoveredAt || discoveredAt;
        const offlineSince = existing.offlineSince || server.offlineSince;

        byIp.set(ip, {
          ...existing,
          ...server,
          ip,
          ports: mergedPorts,
          services: mergedServices,
          capabilities: mergedCaps,
          type,
          status,
          hostRef,
          machineId,
          version,
          dirShow,
          runShow,
          woTime,
          interfaces,
          discoveredAt,
          lastSeenAt,
          firstDiscoveredAt,
          offlineSince
        });
      }

      // Replace servers map with coalesced entries keyed by ip:ports
      const merged = new Map();
      for (const server of byIp.values()) {
        const key = `${server.ip}:${(server.ports || []).join(',')}`;
        merged.set(key, server);
      }
      this.servers = merged;
    } catch (e) {
      this.logger.debug('Failed to coalesce servers by IP', { error: e?.message });
    }
  }

  /**
   * Fetch JSON helper with http/https support
   */
  fetchJson(urlStr) {
    return new Promise((resolve, reject) => {
      try {
        const u = new URL(urlStr);
        const mod = u.protocol === 'https:' ? https : http;
        const req = mod.get(u, (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          let raw = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(raw);
              resolve(json);
            } catch (e) {
              reject(new Error('Invalid JSON from HTTP discovery'));
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(TIMEOUT_MS, () => {
          req.destroy(new Error('HTTP discovery timeout'));
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Attempt to normalize a single record from HTTP discovery into serverInfo shape.
   */
  normalizeHttpDiscoveredItem(item) {
    if (!item || typeof item !== 'object') return null;
    const about = item.about && typeof item.about === 'object' ? item.about : {};

    // Try to derive IP/host
    const ip = item.ip || item.address || item.ipv4 ||
               (about.interfaces && Array.isArray(about.interfaces) && about.interfaces[0] && (Array.isArray(about.interfaces[0]) ? about.interfaces[0][0] : (about.interfaces[0].ip || about.interfaces[0].address))) ||
               (item.interfaces && Array.isArray(item.interfaces) && item.interfaces[0] && (Array.isArray(item.interfaces[0]) ? item.interfaces[0][0] : (item.interfaces[0].ip || item.interfaces[0].address))) ||
               item.host || item.hostname;
    if (!ip) return null;

    const hostRef = about.host_ref || item.host_ref || item.hostRef || item.name || item.hostname || item.machine_name || ip;

    // Services: allow alternate shapes or booleans
    let services = [];
    if (Array.isArray(about.services)) {
      services = about.services;
    } else if (Array.isArray(item.services)) {
      services = item.services;
    } else if (Array.isArray(item.roles)) {
      services = item.roles;
    } else {
      const svc = [];
      if (item.director || item.isDirector) svc.push('Director');
      if (item.display || item.isDisplay) svc.push('Display');
      if (item.assetManager || item.isAssetManager) svc.push('AssetManager');
      if (svc.length) services = svc;
    }

    // Ports: prefer explicit array, else infer from services, else defaults
    let ports = [];
    if (Array.isArray(item.ports)) {
      ports = item.ports.map((p) => parseInt(p, 10)).filter((n) => Number.isFinite(n));
    } else if (item.ports && typeof item.ports === 'object') {
      // Normalize object of port name -> number
      ports = Object.values(item.ports).map((p) => parseInt(p, 10)).filter((n) => Number.isFinite(n));
    }
    if (ports.length === 0) {
      // Try common Watchout ports if any hints exist
      ports = [...WATCHOUT_PORTS];
    }

    // Normalize interfaces to [[ip, mac], ...]
    let interfaces = [];
    if (Array.isArray(about.interfaces)) {
      interfaces = about.interfaces.map((iface) => {
        if (Array.isArray(iface)) return [iface[0], iface[1]];
        if (iface && typeof iface === 'object') return [iface.ip || iface.address || '', iface.mac || iface.macAddress || ''];
        return [String(iface || ''), ''];
      }).filter((pair) => pair[0]);
    } else if (Array.isArray(item.interfaces)) {
      interfaces = item.interfaces.map((iface) => {
        if (Array.isArray(iface)) return [iface[0], iface[1]];
        if (iface && typeof iface === 'object') return [iface.ip || iface.address || '', iface.mac || iface.macAddress || ''];
        return [String(iface || ''), ''];
      }).filter((pair) => pair[0]);
    }

    // Capabilities merging from flat booleans and nested object
    const flatCaps = {
      wo7: about.wo7 ?? item.wo7,
      wo6: about.wo6 ?? item.wo6,
      artnet: about.artnet ?? item.artnet,
      osc: about.osc ?? item.osc,
      webui: (about.webui ?? about.webUi) ?? (item.webui || item.webUi),
    };
    const capabilities = Object.assign({}, item.capabilities || {}, flatCaps);

    // Version allow nested shapes
    const version = about.version || item.version || (item.wo && item.wo.version) || (item.watchout && item.watchout.version);

    // Show info
    const dirShow = about.dir_show || item.dir_show || item.dirShow || (item.director && item.director.show) || item.show;
    const runShow = about.run_show || item.run_show || item.runShow || (item.runtime && item.runtime.show);

    // Time sync
    const woTime = about.wo_time || item.wo_time || item.woTime || item.timeSync;

    // Machine ID
    const machineId = about.machine_id || item.machine_id || item.machineId || item.machineID;

    // Status
    const status = item.status === 'offline' || item.online === false ? 'offline' : (item.status === 'online' || item.online === true ? 'online' : undefined);

    // Timestamps
    const lastSeenAt = (item.last_seen_js_date ? new Date(item.last_seen_js_date).toISOString() : undefined) || item.last_seen_at || item.lastSeenAt || item.lastSeen || item.seenAt;
    const firstDiscoveredAt = item.first_discovered_at || item.firstDiscoveredAt || item.firstSeenAt;
    const offlineSince = item.offline_since || item.offlineSince;

    const serverInfo = {
      ip,
      hostname: hostRef,
      ports,
      type: services.length ? this.determineServerType({ services, version }) : 'Watchout Server (HTTP)',
      discoveryMethod: 'http',
      services,
      version,
      hostRef,
      machineId,
      dirShow,
      runShow,
      woTime,
      interfaces,
      capabilities,
      licensed: item.licensed ?? item.isLicensed,
      isLocal: item.is_local,
      status,
      lastSeenAt,
      firstDiscoveredAt,
      offlineSince,
      rawResponse: item
    };

    return serverInfo;
  }
  sendWatchoutDiscoveryQuery(socket) {
    try {
      // Send the official Watchout 7 discovery message
      const discoveryMessage = Buffer.from('discovery_ping', 'ascii');
      
      socket.send(discoveryMessage, WATCHOUT_QUERY_PORT, WATCHOUT_MULTICAST_IP, (error) => {
        if (error) {
          this.logger.warn('Failed to send Watchout discovery query', { error: error.message });
        } else {
          this.logger.debug('Sent Watchout discovery query', { 
            query: 'discovery_ping',
            target: `${WATCHOUT_MULTICAST_IP}:${WATCHOUT_QUERY_PORT}`
          });
        }
      });
    } catch (error) {
      this.logger.warn('Error sending Watchout discovery query', { error: error.message });
    }
  }
  async bonjourDiscovery() {
    return new Promise((resolve) => {
      // Skip if bonjour is not available
      if (!bonjour) {
        this.logger.debug('Skipping Bonjour discovery - service not available');
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
  }  addServer(serverInfo) {
    const key = `${serverInfo.ip}:${serverInfo.ports.join(',')}`;
    
    // Add timestamp for this discovery
    serverInfo.discoveredAt = serverInfo.discoveredAt || new Date().toISOString();
    serverInfo.lastSeenAt = serverInfo.lastSeenAt || serverInfo.discoveredAt;
    if (serverInfo.status === undefined) serverInfo.status = 'online';
    
    // Reset missed scan count when server is found
    this.missedScans.delete(key);
    
    // Add to current scan results
    if (!this.servers.has(key)) {
      this.servers.set(key, serverInfo);
      this.logger.debug('Found Watchout server', serverInfo);
    } else {
      // Update existing server with additional info
      const existing = this.servers.get(key);
      this.servers.set(key, { ...existing, ...serverInfo });
    }
    
    // Update cache with latest information
    if (this.serverCache.has(key)) {
      const cached = this.serverCache.get(key);
      // Preserve first discovery time but update last seen
      serverInfo.firstDiscoveredAt = cached.firstDiscoveredAt;
      serverInfo.lastSeenAt = serverInfo.discoveredAt;
    } else {
      // New server - set first discovery time
      serverInfo.firstDiscoveredAt = serverInfo.discoveredAt;
    }
    
    this.serverCache.set(key, { ...serverInfo });
  }  processCachedServers() {
    const currentTime = new Date().toISOString();
    const currentServerKeys = new Set(this.servers.keys());
    const currentIps = new Set(Array.from(this.servers.values()).map(s => s.ip));
    
    // Check all cached servers
    for (const [key, cachedServer] of this.serverCache.entries()) {
      if (!currentServerKeys.has(key)) {
        // If we already have a discovered server with the same IP, skip cached entry
        if (currentIps.has(cachedServer.ip)) {
          continue;
        }
        // Check if this is a manual server - manual servers are always online
        if (cachedServer.isManual) {
          // Manual servers always stay online and skip availability checks
          const manualServer = {
            ...cachedServer,
            status: 'online',
            lastSeenAt: currentTime, // Update last seen time for manual servers
            type: cachedServer.type
          };
          
          // Add manual server to current results (always online)
          this.servers.set(key, manualServer);
          this.logger.debug('Manual server kept online (skips discovery)', { 
            server: manualServer.hostname || manualServer.ip 
          });
        } else {
          // Regular discovered servers - increment missed scan count
          const currentMissedCount = this.missedScans.get(key) || 0;
          const newMissedCount = currentMissedCount + 1;
          this.missedScans.set(key, newMissedCount);
            if (newMissedCount >= 10) {
            // Mark as offline only after 10 consecutive missed scans
            const offlineServer = {
              ...cachedServer,
              status: 'offline',
              lastSeenAt: cachedServer.lastSeenAt,
              offlineSince: this.lastScanTime,
              type: cachedServer.type + ' (Offline)'
            };
            
            // Add offline server to current results
            this.servers.set(key, offlineServer);
            this.logger.info('Server marked offline after missed scans', {
              server: offlineServer.hostRef || offlineServer.ip,
              missedCount: newMissedCount
            });
          } else {
            // Keep server as online but track missed scans
            const onlineServer = {
              ...cachedServer,
              status: 'online',
              lastSeenAt: cachedServer.lastSeenAt,
              type: cachedServer.type
            };
            
            // Add server to current results (still online)
            this.servers.set(key, onlineServer);
            this.logger.debug('Server missed scans, keeping online', {
              server: onlineServer.hostRef || onlineServer.ip,
              missedCount: newMissedCount,
              maxMissed: 10
            });
          }
        }
      }
    }
  }
  async clearOfflineServers() {
    let removedCount = 0;
    
    try {
      // Remove offline servers from both cache and current scan results
      const keysToRemove = [];
      
      // Check cache for offline servers
      for (const [key, server] of this.serverCache.entries()) {
        if (server.status === 'offline') {
          keysToRemove.push(key);
          removedCount++;
        }
      }
      
      // Also check current scan results for offline servers
      for (const [key, server] of this.servers.entries()) {
        if (server.status === 'offline' && !keysToRemove.includes(key)) {
          keysToRemove.push(key);
          removedCount++;
        }
      }
      
      // Remove the servers from both cache and current results
      keysToRemove.forEach(key => {
        this.serverCache.delete(key);
        this.servers.delete(key);
        this.missedScans.delete(key); // Also clear missed scan counts
      });
      
      // Save updated cache to file
      await this.saveCacheToFile();
      
      console.log(`Cleared ${removedCount} offline servers from cache`);
      
      return { success: true, removedCount };
    } catch (error) {
      console.error('Error clearing offline servers:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if nmap is available on the system
   * @returns {Promise<boolean>}
   */
  async checkNmapAvailability() {
    return new Promise((resolve) => {
      exec('nmap --version', (error) => {
        resolve(!error);
      });
    });
  }
  /**
   * Add a manual server to the cache
   * Manual servers are always considered online and skip availability checks
   * @param {Object} serverData - The server data to add
   * @returns {Promise<Object>} - Result object with success status
   */
  async addManualServer(serverData) {
    try {
      // Validate required fields (only IP is required now)
      if (!serverData.ip) {
        return { success: false, error: 'Invalid server data: IP address is required' };
      }

      // Create server entry with hardcoded ports
      const manualServer = {
        ...serverData,
        ports: WATCHOUT_PORTS, // Always use hardcoded ports (3040, 3041, 3042, 3022)
        discoveryMethod: 'manual',
        status: 'online', // Manual servers are always online
        isManual: true,
        discoveredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        firstDiscoveredAt: serverData.firstDiscoveredAt || new Date().toISOString()
      };

      const key = this.getServerId(manualServer);
      
      // Add to cache
      this.serverCache.set(key, manualServer);
      
      // Also add to current scan results if we're running
      this.servers.set(key, manualServer);
      
      // Clear missed scan count for this server
      this.missedScans.delete(key);
      
      // Save to cache file
      await this.saveCacheToFile();
      
      console.log('Manual server added to cache:', manualServer);
      
      return { success: true, server: manualServer };
    } catch (error) {
      console.error('Error adding manual server:', error);      return { success: false, error: error.message };
    }
  }

  /**
   * Update a manual server in the cache
   * @param {string} serverId - The unique identifier for the server
   * @param {Object} serverData - The updated server data
   * @returns {Promise<Object>} - Result object with success status
   */
  async updateManualServer(serverId, serverData) {
    try {
      // Check if server exists and is manual
      const existingServer = this.serverCache.get(serverId);
      if (!existingServer || !existingServer.isManual) {
        return { success: false, error: 'Manual server not found or not a manual server' };
      }      // Validate required fields (only IP is required now)
      if (!serverData.ip) {
        return { success: false, error: 'Invalid server data: IP address is required' };
      }

      // Update server entry with hardcoded ports
      const updatedServer = {
        ...existingServer,
        ...serverData,
        ports: WATCHOUT_PORTS, // Always use hardcoded ports (3040, 3041, 3042, 3022)
        discoveryMethod: 'manual',
        status: 'online', // Manual servers are always online
        isManual: true,
        lastSeenAt: new Date().toISOString()
      };

      // Update in cache
      this.serverCache.set(serverId, updatedServer);
      
      // Also update in current scan results if present
      if (this.servers.has(serverId)) {
        this.servers.set(serverId, updatedServer);
      }
      
      // Save to cache file
      await this.saveCacheToFile();
      
      console.log('Manual server updated in cache:', updatedServer);
      
      return { success: true, server: updatedServer };
    } catch (error) {
      console.error('Error updating manual server:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove a manual server from the cache
   * @param {string} serverId - The unique identifier for the server
   * @returns {Promise<Object>} - Result object with success status
   */
  async removeManualServer(serverId) {
    try {
      // Check if server exists and is manual
      const existingServer = this.serverCache.get(serverId);
      if (!existingServer || !existingServer.isManual) {
        return { success: false, error: 'Manual server not found or not a manual server' };
      }

      // Remove from cache
      this.serverCache.delete(serverId);
      
      // Also remove from current scan results if present
      this.servers.delete(serverId);
      
      // Clear missed scan count for this server
      this.missedScans.delete(serverId);
      
      // Save to cache file
      await this.saveCacheToFile();
      
      console.log('Manual server removed from cache:', existingServer.hostname || existingServer.ip);
      
      return { success: true, server: existingServer };
    } catch (error) {
      console.error('Error removing manual server:', error);
      return { success: false, error: error.message };
    }
  }
}

const finder = new WatchoutAssistant();

module.exports = {
  findWatchoutServers: () => finder.findWatchoutServers(),
  clearOfflineServers: () => finder.clearOfflineServers(),
  addManualServer: (serverData) => finder.addManualServer(serverData),
  updateManualServer: (serverId, serverData) => finder.updateManualServer(serverId, serverData),
  removeManualServer: (serverId) => finder.removeManualServer(serverId)
};

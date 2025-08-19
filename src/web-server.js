const express = require('express');
const path = require('path');
const http = require('http');
const multer = require('multer');
const { findWatchoutServers, clearOfflineServers } = require('./network-scanner');
const WatchoutCommands = require('./watchout-commands');
const { Logger } = require('./logger');

class WebServer {
  constructor() {
    this.logger = new Logger({ component: 'WEB-SERVER' });
    this.app = express();
    this.server = null;
    this.port = 3080; // Default port for web server
    this.watchoutCommands = new WatchoutCommands();
    
    // Configure multer for file uploads
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
      },
      fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.watch', '.json'];
        const fileExt = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(fileExt)) {
          cb(null, true);
        } else {
          cb(new Error('Only .watch and .json files are allowed'), false);
        }
      }
    });
    
    try {
      this.setupMiddleware();
      this.setupRoutes();
      this.logger.info('Web server initialized successfully');
    } catch (error) {
      this.logger.error('Error setting up web server', { error: error.message });
      throw error;
    }
  }

  setupMiddleware() {
    // Serve static files from src directory
    this.app.use(express.static(path.join(__dirname)));
    this.app.use(express.json());
    
    // CORS middleware for cross-origin requests
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }
  setupRoutes() {
    // Serve the web version HTML file
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'web.html'));
    });

    // Fullscreen playback updates view
    this.app.get('/updates', (req, res) => {
      res.sendFile(path.join(__dirname, 'updates.html'));
    });

    // Serve static assets
    this.app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
    this.app.use(express.static(__dirname)); // Serve JS, CSS files from src directory

    // SSE proxy to avoid CORS issues from 3019 -> 3080
    this.app.get('/api/sse', (req, res) => {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.flushHeaders?.();

      const upstream = http.request({
        hostname: 'localhost',
        port: 3019,
        path: '/v1/sse',
        method: 'GET',
        headers: { Accept: 'text/event-stream' }
      }, (up) => {
        up.on('data', (chunk) => {
          res.write(chunk);
        });
        up.on('end', () => {
          // Notify client and end
          res.write('event: end\n');
          res.write('data: upstream closed\n\n');
          res.end();
        });
      });

      upstream.on('error', (err) => {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: err.message })}\n\n`);
        res.end();
      });

      upstream.end();

      // Heartbeat to keep proxies from closing the stream
      const hb = setInterval(() => {
        try { res.write(': ping\n\n'); } catch {}
      }, 25000);

      // Close upstream when client disconnects
      req.on('close', () => {
        try { upstream.destroy(); } catch {}
        clearInterval(hb);
      });
    });

    // API Routes that mirror the Electron IPC handlers
    
    // Server discovery
    this.app.get('/api/scan-servers', async (req, res) => {
      try {
        const servers = await findWatchoutServers();
        res.json({ success: true, servers });
      } catch (error) {
        console.error('Error scanning for servers:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Clear offline servers
    this.app.delete('/api/offline-servers', async (req, res) => {
      try {
        const result = await clearOfflineServers();
        res.json(result);
      } catch (error) {
        console.error('Error clearing offline servers:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Watchout Commands API
    this.app.post('/api/watchout/:serverIp/test-connection', async (req, res) => {
      try {
        const result = await this.watchoutCommands.testConnection(req.params.serverIp);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/watchout/:serverIp/status', async (req, res) => {
      try {
        const result = await this.watchoutCommands.getPlaybackStatus(req.params.serverIp);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });    this.app.get('/api/watchout/:serverIp/show', async (req, res) => {
      try {
        const result = await this.watchoutCommands.getCurrentShow(req.params.serverIp);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/watchout/:serverIp/upload-show', this.upload.single('showFile'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const file = req.file;
        const fileExt = path.extname(file.originalname).toLowerCase();
        const showName = req.body.showName || path.parse(file.originalname).name;

        let fileData;
        if (fileExt === '.json') {
          try {
            // Verify JSON is valid
            const jsonContent = file.buffer.toString('utf8');
            JSON.parse(jsonContent); // This will throw if invalid
            fileData = jsonContent;
          } catch (parseError) {
            return res.status(400).json({ success: false, error: `Invalid JSON file: ${parseError.message}` });
          }
        } else {
          // For .watch files, use raw buffer
          fileData = file.buffer;
        }

        const result = await this.watchoutCommands.loadShowFromFile(req.params.serverIp, showName, fileData);
        
        if (result.success) {
          res.json({
            success: true,
            message: `Show "${showName}" uploaded successfully from ${file.originalname}`,
            fileName: file.originalname,
            showName: showName,
            data: result.data
          });
        } else {
          res.status(500).json(result);
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/watchout/:serverIp/timelines', async (req, res) => {
      try {
        const result = await this.watchoutCommands.getTimelines(req.params.serverIp);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/watchout/:serverIp/play/:timelineId?', async (req, res) => {
      try {
        const timelineId = req.params.timelineId ? parseInt(req.params.timelineId) : 0;
        const result = await this.watchoutCommands.playTimeline(req.params.serverIp, timelineId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/watchout/:serverIp/pause/:timelineId?', async (req, res) => {
      try {
        const timelineId = req.params.timelineId ? parseInt(req.params.timelineId) : 0;
        const result = await this.watchoutCommands.pauseTimeline(req.params.serverIp, timelineId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/watchout/:serverIp/stop/:timelineId?', async (req, res) => {
      try {
        const timelineId = req.params.timelineId ? parseInt(req.params.timelineId) : 0;
        const result = await this.watchoutCommands.stopTimeline(req.params.serverIp, timelineId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/watchout/:serverIp/custom', async (req, res) => {
      try {
        const { endpoint, method, data } = req.body;
        const result = await this.watchoutCommands.sendCustomRequest(
          req.params.serverIp, 
          endpoint, 
          method, 
          data
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // App version
    this.app.get('/api/version', (req, res) => {
      const packageJson = require('../package.json');
      res.json({ version: packageJson.version });
    });
    
    // ==================== LOKI LOG ENDPOINTS ====================
    
    // Test Loki connection
    this.app.post('/api/loki/:serverIp/test-connection', async (req, res) => {
      try {
        const result = await this.watchoutCommands.testLokiConnection(req.params.serverIp);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Query Loki logs
    this.app.get('/api/loki/:serverIp/query', async (req, res) => {
      try {
        const { query, limit, since } = req.query;        const result = await this.watchoutCommands.queryLokiLogs(
          req.params.serverIp,
          query || '{app=~".+"}',
          parseInt(limit) || 100,
          since || '1h'
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Start Loki log stream
    this.app.post('/api/loki/:serverIp/stream/start', async (req, res) => {
      try {
        const { query, refreshInterval } = req.body;        const result = await this.watchoutCommands.startLokiLogStream(
          req.params.serverIp,
          query || '{app=~".+"}',
          refreshInterval || 2000
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Stop Loki log stream
    this.app.post('/api/loki/:serverIp/stream/stop', async (req, res) => {
      try {
        const result = this.watchoutCommands.stopLokiLogStream();
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get Loki labels
    this.app.get('/api/loki/:serverIp/labels', async (req, res) => {
      try {
        const result = await this.watchoutCommands.getLokiLabels(req.params.serverIp);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get Loki label values
    this.app.get('/api/loki/:serverIp/labels/:label/values', async (req, res) => {
      try {
        const result = await this.watchoutCommands.getLokiLabelValues(
          req.params.serverIp,
          req.params.label
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get common Loki queries
    this.app.get('/api/loki/common-queries', (req, res) => {
      try {
        const queries = this.watchoutCommands.getLokiCommonQueries();
        res.json({ success: true, data: queries });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Express error:', error);
      if (res.headersSent) {
        return next(error);
      }
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Internal server error' 
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ 
        success: false, 
        error: 'Endpoint not found' 
      });
    });
  }

  async start(port = this.port) {
    return new Promise((resolve, reject) => {
      this.logger.info('Starting web server...', { port });
      
      this.server = this.app.listen(port, (err) => {
        if (err) {
          this.logger.error('Failed to start web server', { port, error: err.message });
          reject(err);
        } else {
          this.port = port;
          this.logger.info('Web server started successfully', { 
            port: this.port, 
            url: `http://localhost:${this.port}` 
          });
          resolve(this.port);
        }
      });

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.logger.warn('Port in use, trying next port', { currentPort: port, nextPort: port + 1 });
          this.start(port + 1).then(resolve).catch(reject);
        } else {
          this.logger.error('Server error', { error: err.message });
          reject(err);
        }
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.logger.info('Web server stopped');
    }
  }

  isRunning() {
    return this.server !== null;
  }

  getPort() {
    return this.port;
  }
}

module.exports = WebServer;

// Loki Log Reader for Watchout 7 Systems
// Real-time log streaming from Loki server

const http = require('http');
const { EventEmitter } = require('events');

class LokiLogReader extends EventEmitter {
    constructor() {
        super();
        this.defaultPort = 3022; // Loki server port
        this.timeout = 30000; // 30 second timeout for streaming
        this.isStreaming = false;
        this.streamRequest = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000; // 2 seconds
        this.lastQueryTime = null;
    }    // Query Loki for recent logs
    async queryLogs(serverIp, query = '{app=~".+"}', limit = 100, since = '1h') {
        const targetPort = this.defaultPort;
        
        // Calculate proper time range for Loki API
        const now = new Date();
        const start = new Date(now.getTime() - this.parseDuration(since));
        
        const params = new URLSearchParams({
            query: query,
            limit: limit.toString(),
            start: (start.getTime() * 1000000).toString(), // Convert to nanoseconds
            end: (now.getTime() * 1000000).toString(), // Convert to nanoseconds
            direction: 'backward'
        });
        
        const url = `http://${serverIp}:${targetPort}/loki/api/v1/query_range?${params}`;
        
        return new Promise((resolve, reject) => {
            const req = http.request(url, {
                method: 'GET',
                timeout: this.timeout,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'WATCHOUT-Assistant/1.0'
                }
            }, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const parsedData = JSON.parse(responseData);
                            const logs = this.parseLokiResponse(parsedData);
                            resolve({
                                success: true,
                                statusCode: res.statusCode,
                                data: logs,
                                headers: res.headers
                            });
                        } else {
                            resolve({
                                success: false,
                                statusCode: res.statusCode,
                                error: `HTTP ${res.statusCode}: ${responseData}`,
                                headers: res.headers
                            });
                        }
                    } catch (error) {
                        reject({
                            success: false,
                            error: `Failed to parse response: ${error.message}`,
                            data: responseData
                        });
                    }
                });
            });

            req.on('error', (error) => {
                reject({
                    success: false,
                    error: this.formatConnectionError(error, serverIp),
                    code: error.code
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject({
                    success: false,
                    error: `Connection timed out after ${this.timeout}ms`,
                    code: 'TIMEOUT'
                });
            });

            req.end();
        });
    }

    // Parse duration string (e.g., "1h", "30m", "5s") to milliseconds
    parseDuration(duration) {
        const match = duration.match(/^(\d+)([smh])$/);
        if (!match) return 3600000; // Default to 1 hour
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        switch (unit) {
            case 's': return value * 1000;
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            default: return 3600000;
        }
    }

    // Start real-time log streaming using tail-like functionality
    async startLogStream(serverIp, query = '{app=~".+"}', refreshInterval = 2000) {
        if (this.isStreaming) {
            console.log('Log stream already active');
            return;
        }

        this.isStreaming = true;
        this.reconnectAttempts = 0;
        this.lastQueryTime = Math.floor(Date.now() / 1000) - 60; // Start from 1 minute ago
        
        console.log(`Starting Loki log stream for ${serverIp}:${this.defaultPort}`);
        this.emit('streamStarted', { serverIp, query });

        // Initial query to get recent logs
        try {
            const initialLogs = await this.queryLogs(serverIp, query, 50, '5m');
            if (initialLogs.success && initialLogs.data.length > 0) {
                this.emit('logs', initialLogs.data);
                // Update last query time based on the latest log
                const latestLog = initialLogs.data[initialLogs.data.length - 1];
                if (latestLog && latestLog.timestamp) {
                    this.lastQueryTime = Math.floor(new Date(latestLog.timestamp).getTime() / 1000);
                }
            }
        } catch (error) {
            console.warn('Failed to get initial logs:', error);
        }

        // Start polling for new logs
        this.startPolling(serverIp, query, refreshInterval);
    }

    // Poll for new logs since last query
    startPolling(serverIp, query, refreshInterval) {
        if (!this.isStreaming) return;

        const poll = async () => {
            if (!this.isStreaming) return;

            try {
                // Query for logs since last query time
                const sinceTime = new Date(this.lastQueryTime * 1000).toISOString();
                const params = new URLSearchParams({
                    query: query,
                    limit: '100',
                    start: sinceTime
                });
                
                const url = `http://${serverIp}:${this.defaultPort}/loki/api/v1/query_range?${params}`;
                
                const result = await this.makeRequest(url);
                
                if (result.success) {
                    const logs = this.parseLokiResponse(result.data);
                    if (logs.length > 0) {
                        this.emit('logs', logs);
                        // Update last query time
                        const latestLog = logs[logs.length - 1];
                        if (latestLog && latestLog.timestamp) {
                            this.lastQueryTime = Math.floor(new Date(latestLog.timestamp).getTime() / 1000);
                        }
                    }
                    this.reconnectAttempts = 0; // Reset on success
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.warn('Log polling error:', error.message);
                this.emit('error', error);
                
                // Handle reconnection
                this.reconnectAttempts++;
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    console.log(`Retrying in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    setTimeout(poll, this.reconnectDelay);
                    return;
                } else {
                    console.error('Max reconnection attempts reached, stopping stream');
                    this.stopLogStream();
                    return;
                }
            }

            // Schedule next poll
            if (this.isStreaming) {
                setTimeout(poll, refreshInterval);
            }
        };

        // Start first poll
        setTimeout(poll, refreshInterval);
    }

    // Make HTTP request helper
    makeRequest(url) {
        return new Promise((resolve, reject) => {
            const req = http.request(url, { method: 'GET', timeout: 10000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            resolve({
                                success: true,
                                data: JSON.parse(data),
                                statusCode: res.statusCode
                            });
                        } else {
                            resolve({
                                success: false,
                                error: `HTTP ${res.statusCode}: ${data}`,
                                statusCode: res.statusCode
                            });
                        }
                    } catch (error) {
                        reject(new Error(`Parse error: ${error.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    // Stop log streaming
    stopLogStream() {
        if (!this.isStreaming) return;

        this.isStreaming = false;
        
        if (this.streamRequest) {
            this.streamRequest.destroy();
            this.streamRequest = null;
        }

        console.log('Loki log stream stopped');
        this.emit('streamStopped');
    }

    // Parse Loki API response to extract log entries
    parseLokiResponse(response) {
        const logs = [];
        
        if (response && response.data && response.data.result) {
            response.data.result.forEach(stream => {
                if (stream.values && Array.isArray(stream.values)) {
                    stream.values.forEach(entry => {
                        if (Array.isArray(entry) && entry.length >= 2) {
                            const timestamp = new Date(parseInt(entry[0]) / 1000000); // Convert nanoseconds to milliseconds
                            const message = entry[1];
                            const labels = stream.stream || {};
                              logs.push({
                                timestamp: timestamp.toISOString(),
                                message: message,
                                labels: labels,
                                level: this.extractLogLevel(message),
                                source: labels.app || labels.job || 'unknown'
                            });
                        }
                    });
                }
            });
        }

        // Sort logs by timestamp (newest first)
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return logs;
    }

    // Extract log level from message
    extractLogLevel(message) {
        const upperMessage = message.toUpperCase();
        if (upperMessage.includes('ERROR') || upperMessage.includes('ERR')) return 'error';
        if (upperMessage.includes('WARN') || upperMessage.includes('WARNING')) return 'warn';
        if (upperMessage.includes('INFO')) return 'info';
        if (upperMessage.includes('DEBUG')) return 'debug';
        return 'info'; // default
    }    // Test connection to Loki server
    async testConnection(serverIp) {
        try {
            const url = `http://${serverIp}:${this.defaultPort}/ready`;
            const result = await this.makeRequestWithDetails(url);
            
            if (result.success) {
                return {
                    success: true,
                    connected: true,
                    message: 'Loki server is ready'
                };
            } else {
                // Try alternative endpoint
                const altUrl = `http://${serverIp}:${this.defaultPort}/metrics`;
                const altResult = await this.makeRequestWithDetails(altUrl);
                
                return {
                    success: altResult.success,
                    connected: altResult.success,
                    message: altResult.success ? 'Loki server is accessible' : 'Loki server not responding'
                };
            }
        } catch (error) {
            return {
                success: false,
                connected: false,
                message: this.formatConnectionError(error, serverIp)
            };
        }
    }

    // Get available labels/jobs from Loki
    async getLabels(serverIp) {
        try {
            const url = `http://${serverIp}:${this.defaultPort}/loki/api/v1/labels`;
            const result = await this.makeRequest(url);
            
            if (result.success) {
                return {
                    success: true,
                    data: result.data.data || []
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            return {
                success: false,
                error: this.formatConnectionError(error, serverIp)
            };
        }
    }

    // Get label values for a specific label
    async getLabelValues(serverIp, label) {
        try {
            const url = `http://${serverIp}:${this.defaultPort}/loki/api/v1/label/${encodeURIComponent(label)}/values`;
            const result = await this.makeRequest(url);
            
            if (result.success) {
                return {
                    success: true,
                    data: result.data.data || []
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            return {
                success: false,
                error: this.formatConnectionError(error, serverIp)
            };
        }
    }

    // Format connection error messages
    formatConnectionError(error, serverIp) {
        const message = error.message || error.toString();
        const code = error.code;
        
        if (code === 'ECONNREFUSED') {
            return `Cannot connect to Loki server`;
        } else if (code === 'ENOTFOUND') {
            return `Cannot reach Loki server - host not found`;
        } else if (code === 'EHOSTUNREACH') {
            return `Cannot reach Loki server - host unreachable`;
        } else if (code === 'ENETUNREACH') {
            return `Cannot reach Loki server - network unreachable`;
        } else if (code === 'ECONNRESET') {
            return `Connection to Loki server was reset`;
        } else if (code === 'TIMEOUT') {
            return `Connection to Loki server timed out`;
        } else {
            return `Connection to Loki server failed: ${message.split(' ').slice(-1)[0] || 'Unknown error'}`;
        }
    }    // Get common log queries for Watchout systems
    getCommonQueries() {
        return [
            {
                name: 'All Applications',
                query: '{app=~".+"}',
                description: 'Show logs from all Watchouts'
            },
            {
                name: 'Director Logs',
                query: '{app="Director"}',
                description: 'Show logs from Watchout Director'
            },
            {
                name: 'Visual Renderer Logs',
                query: '{app="VisualRenderer"}',
                description: 'Show logs from Visual Renderer'
            },
            {
                name: 'Audio Renderer Logs',
                query: '{app="AudioRenderer"}',
                description: 'Show logs from Audio Renderer'
            },
            {
                name: 'Operative Logs',
                query: '{app="Operative"}',
                description: 'Show logs from Operative'
            },
            {
                name: 'Runner Logs',
                query: '{app="Runner"}',
                description: 'Show logs from Runner'
            },
            {
                name: 'System Logs',
                query: '{app="sys"}',
                description: 'Show system-level logs'
            },
            {
                name: 'Error Messages',
                query: '{app=~".+"} |~ "(?i)error|err|exception|fail"',
                description: 'Show error messages from alls'
            },
            {
                name: 'Warning Messages',
                query: '{app=~".+"} |~ "(?i)warn|warning|alert"',
                description: 'Show warning messages from alls'
            },
            {
                name: 'Timeline Operations',
                query: '{app=~".+"} |~ "(?i)timeline|play|pause|stop|cue|seek"',
                description: 'Show timeline and playback related logs'
            },
            {
                name: 'Network & Connection',
                query: '{app=~".+"} |~ "(?i)connect|disconnect|network|tcp|udp|socket"',
                description: 'Show network and connection related logs'
            },
            {
                name: 'Performance & Stats',
                query: '{app=~".+"} |~ "(?i)performance|fps|frame|render|cpu|memory|gpu"',
                description: 'Show performance and statistics logs'
            }
        ];
    }

    // Comprehensive test suite for debugging
    async runDiagnostics(serverIp) {
        console.log(`\n=== Loki Server Diagnostics for ${serverIp}:${this.defaultPort} ===`);
        const results = {
            serverIp,
            port: this.defaultPort,
            timestamp: new Date().toISOString(),
            tests: {}
        };

        // Test 1: Basic connectivity
        console.log('\n1. Testing basic connectivity...');
        try {
            const connectTest = await this.testBasicConnectivity(serverIp);
            results.tests.connectivity = connectTest;
            console.log(`   Result: ${connectTest.success ? 'SUCCESS' : 'FAILED'}`);
            console.log(`   Details: ${connectTest.message}`);
        } catch (error) {
            results.tests.connectivity = { success: false, error: error.message };
            console.log(`   Result: FAILED - ${error.message}`);
        }        // Test 2: Loki health endpoints
        console.log('\n2. Testing Loki health endpoints...');
        const healthTests = await this.testHealthEndpoints(serverIp);
        const healthResults = Object.values(healthTests);
        const healthSuccess = healthResults.some(r => r.success);
        results.tests.health = {
            success: healthSuccess,
            details: healthTests,
            message: healthSuccess ? 'Some health endpoints are accessible' : 'No health endpoints accessible'
        };
        for (const [endpoint, result] of Object.entries(healthTests)) {
            console.log(`   ${endpoint}: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.statusCode || 'N/A'})`);
            if (result.error) console.log(`     Error: ${result.error}`);
        }        // Test 3: API endpoints
        console.log('\n3. Testing Loki API endpoints...');
        const apiTests = await this.testApiEndpoints(serverIp);
        const apiResults = Object.values(apiTests);
        const apiSuccess = apiResults.some(r => r.success);
        results.tests.api = {
            success: apiSuccess,
            details: apiTests,
            message: apiSuccess ? 'Some API endpoints are accessible' : 'No API endpoints accessible'
        };
        for (const [endpoint, result] of Object.entries(apiTests)) {
            console.log(`   ${endpoint}: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.statusCode || 'N/A'})`);
            if (result.error) console.log(`     Error: ${result.error}`);
        }

        // Test 4: Sample query
        console.log('\n4. Testing sample log query...');
        try {
            const queryTest = await this.testSampleQuery(serverIp);
            results.tests.query = queryTest;
            console.log(`   Result: ${queryTest.success ? 'SUCCESS' : 'FAILED'}`);
            console.log(`   Logs found: ${queryTest.success ? queryTest.data.length : 0}`);
            if (queryTest.error) console.log(`   Error: ${queryTest.error}`);
        } catch (error) {
            results.tests.query = { success: false, error: error.message };
            console.log(`   Result: FAILED - ${error.message}`);
        }

        // Test 5: Localhost test (if not already testing localhost)
        if (serverIp !== 'localhost' && serverIp !== '127.0.0.1') {
            console.log('\n5. Testing localhost fallback...');
            try {
                const localhostTest = await this.testLocalhost();
                results.tests.localhost = localhostTest;
                console.log(`   Result: ${localhostTest.success ? 'SUCCESS' : 'FAILED'}`);
                console.log(`   Details: ${localhostTest.message}`);
                if (localhostTest.success) {
                    console.log(`   Suggestion: Try connecting to localhost:${this.defaultPort} instead`);
                }
            } catch (error) {
                results.tests.localhost = { success: false, error: error.message };
                console.log(`   Result: FAILED - ${error.message}`);
            }
        } else {
            console.log('\n5. Localhost test skipped (already testing localhost)');
            results.tests.localhost = { skipped: true, reason: 'Already testing localhost' };
        }

        console.log('\n=== Diagnostics Complete ===\n');
        return results;
    }

    // Test basic TCP connectivity
    async testBasicConnectivity(serverIp) {
        return new Promise((resolve) => {
            const net = require('net');
            const socket = new net.Socket();
            const timeout = 5000;

            const timer = setTimeout(() => {
                socket.destroy();
                resolve({
                    success: false,
                    message: `Connection timeout after ${timeout}ms`
                });
            }, timeout);

            socket.connect(this.defaultPort, serverIp, () => {
                clearTimeout(timer);
                socket.destroy();
                resolve({
                    success: true,
                    message: `Port ${this.defaultPort} is open and accepting connections`
                });
            });

            socket.on('error', (error) => {
                clearTimeout(timer);
                resolve({
                    success: false,
                    message: `Connection failed: ${error.code || error.message}`
                });
            });
        });
    }

    // Test various Loki health endpoints
    async testHealthEndpoints(serverIp) {
        const endpoints = [
            '/ready',
            '/metrics',
            '/config',
            '/services',
            '/loki/api/v1/labels'
        ];

        const results = {};
        
        for (const endpoint of endpoints) {
            try {
                const url = `http://${serverIp}:${this.defaultPort}${endpoint}`;
                console.log(`   Testing: ${endpoint}`);
                const result = await this.makeRequestWithDetails(url);
                results[endpoint] = result;
            } catch (error) {
                results[endpoint] = {
                    success: false,
                    error: error.message
                };
            }
        }

        return results;
    }    // Test Loki API endpoints
    async testApiEndpoints(serverIp) {
        const endpoints = [
            '/loki/api/v1/labels',
            '/loki/api/v1/label/job/values',
            '/loki/api/v1/query?query={app=~".+"}'

        ];

        const results = {};
        
        for (const endpoint of endpoints) {
            try {
                const url = `http://${serverIp}:${this.defaultPort}${endpoint}`;
                console.log(`   Testing: ${endpoint}`);
                const result = await this.makeRequestWithDetails(url);
                results[endpoint] = result;
            } catch (error) {
                results[endpoint] = {
                    success: false,
                    error: error.message
                };
            }
        }

        return results;
    }// Test a sample query
    async testSampleQuery(serverIp) {
        try {            console.log('   Executing sample query: {app=~".+"}');
            const result = await this.queryLogs(serverIp, '{app=~".+"}', 10, '1h');
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Enhanced request method with detailed response info
    async makeRequestWithDetails(url) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const req = http.request(url, { 
                method: 'GET', 
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'WATCHOUT-Assistant/1.0'
                }
            }, (res) => {
                const responseTime = Date.now() - startTime;
                let data = '';
                
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const result = {
                        success: res.statusCode >= 200 && res.statusCode < 300,
                        statusCode: res.statusCode,
                        responseTime: responseTime,
                        contentLength: data.length,
                        contentType: res.headers['content-type'] || 'unknown'
                    };

                    if (!result.success) {
                        result.error = `HTTP ${res.statusCode}: ${data.substring(0, 200)}`;
                    }

                    try {
                        if (result.contentType.includes('application/json')) {
                            result.data = JSON.parse(data);
                        } else {
                            result.data = data.substring(0, 200); // First 200 chars for non-JSON
                        }
                    } catch (parseError) {
                        result.parseError = parseError.message;
                        result.data = data.substring(0, 200);
                    }

                    resolve(result);
                });
            });

            req.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message,
                    code: error.code,
                    responseTime: Date.now() - startTime
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'Request timeout',
                    code: 'TIMEOUT',
                    responseTime: Date.now() - startTime
                });
            });

            req.end();
        });
    }

    // Quick connection test
    async quickTest(serverIp) {
        console.log(`Quick test for Loki server at ${serverIp}:${this.defaultPort}`);
        
        try {
            // Test basic connectivity first
            const connectTest = await this.testBasicConnectivity(serverIp);
            if (!connectTest.success) {
                return {
                    success: false,
                    message: `Port not accessible: ${connectTest.message}`
                };
            }

            // Test ready endpoint
            const readyTest = await this.testConnection(serverIp);
            if (readyTest.success) {
                return {
                    success: true,
                    message: 'Loki server is ready and accessible'
                };
            }

            // Test alternative endpoints
            const altTest = await this.makeRequestWithDetails(`http://${serverIp}:${this.defaultPort}/metrics`);
            if (altTest.success) {
                return {
                    success: true,
                    message: 'Server is accessible via metrics endpoint'
                };
            }

            return {
                success: false,
                message: 'Server accessible but Loki API not responding correctly'
            };

        } catch (error) {
            return {
                success: false,
                message: `Test failed: ${error.message}`
            };
        }
    }

    // Test localhost connectivity specifically
    async testLocalhost() {
        const localhostAddresses = ['127.0.0.1', 'localhost'];
        
        for (const address of localhostAddresses) {
            try {
                console.log(`   Testing ${address}:${this.defaultPort}...`);
                
                // Test basic connectivity
                const connectTest = await this.testBasicConnectivity(address);
                if (connectTest.success) {
                    // Test Loki ready endpoint
                    const readyTest = await this.testConnection(address);
                    if (readyTest.success) {
                        return {
                            success: true,
                            address: address,
                            message: `Loki server found on ${address}:${this.defaultPort}`
                        };
                    } else {
                        // Test if any HTTP service is running
                        const httpTest = await this.makeRequestWithDetails(`http://${address}:${this.defaultPort}/`);
                        if (httpTest.success || httpTest.statusCode) {
                            return {
                                success: true,
                                address: address,
                                message: `HTTP service found on ${address}:${this.defaultPort} but may not be Loki`,
                                warning: 'Service responding but not identified as Loki'
                            };
                        }
                    }
                }
            } catch (error) {
                console.log(`     ${address}: ${error.message}`);
            }
        }
        
        return {
            success: false,
            message: `No Loki server found on localhost:${this.defaultPort}`
        };
    }

    // Run basic test suite for a server (for integration with main app)
    async runBasicTests(serverIp) {
        const results = {
            serverIp,
            port: this.defaultPort,
            timestamp: new Date().toISOString(),
            overall: false,
            tests: {}
        };

        try {
            // Quick connectivity test
            const connectTest = await this.testBasicConnectivity(serverIp);
            results.tests.connectivity = connectTest;

            if (connectTest.success) {
                // Test Loki endpoints
                const readyTest = await this.testConnection(serverIp);
                results.tests.loki = readyTest;                // Try a simple query
                const queryTest = await this.queryLogs(serverIp, '{app=~".+"}', 5, '5m');
                results.tests.query = queryTest;

                results.overall = readyTest.success || queryTest.success;
            }

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }
}

module.exports = LokiLogReader;

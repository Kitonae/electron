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
    }

    // Query Loki for recent logs
    async queryLogs(serverIp, query = '{job="watchout"}', limit = 100, since = '1h') {
        const targetPort = this.defaultPort;
        const params = new URLSearchParams({
            query: query,
            limit: limit.toString(),
            since: since
        });
        
        const url = `http://${serverIp}:${targetPort}/loki/api/v1/query_range?${params}`;
        
        return new Promise((resolve, reject) => {
            const options = {
                method: 'GET',
                timeout: this.timeout,
                headers: {
                    'Accept': 'application/json'
                }
            };

            const req = http.request(url, options, (res) => {
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
                    error: `Connection timed out`,
                    code: 'TIMEOUT'
                });
            });

            req.end();
        });
    }

    // Start real-time log streaming using tail-like functionality
    async startLogStream(serverIp, query = '{job="watchout"}', refreshInterval = 2000) {
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
                                source: labels.job || 'unknown'
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
    }

    // Test connection to Loki server
    async testConnection(serverIp) {
        try {
            const url = `http://${serverIp}:${this.defaultPort}/ready`;
            const result = await this.makeRequest(url);
            
            if (result.success) {
                return {
                    success: true,
                    connected: true,
                    message: 'Loki server is ready'
                };
            } else {
                // Try alternative endpoint
                const altUrl = `http://${serverIp}:${this.defaultPort}/metrics`;
                const altResult = await this.makeRequest(altUrl);
                
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
    }

    // Get common log queries for Watchout systems
    getCommonQueries() {
        return [
            {
                name: 'All Logs',
                query: '{}',
                description: 'Show all available logs'
            },
            {
                name: 'Watchout Logs',
                query: '{job="watchout"}',
                description: 'Show logs from Watchout services'
            },
            {
                name: 'Error Logs',
                query: '{} |~ "(?i)error|err"',
                description: 'Show only error messages'
            },
            {
                name: 'Warning Logs',
                query: '{} |~ "(?i)warn|warning"',
                description: 'Show only warning messages'
            },
            {
                name: 'Timeline Logs',
                query: '{} |~ "(?i)timeline|play|pause|stop"',
                description: 'Show timeline-related logs'
            },
            {
                name: 'Connection Logs',
                query: '{} |~ "(?i)connect|disconnect|network|tcp"',
                description: 'Show connection-related logs'
            }
        ];
    }
}

module.exports = LokiLogReader;

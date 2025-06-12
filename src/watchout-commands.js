// Watchout 7 External Protocol API Commands
// Based on: https://docs.dataton.com/watchout-7/external_protocol/ext_wo7.html

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

class WatchoutCommands {
    constructor() {
        this.defaultPort = 3019; // Standard Watchout HTTP API port
        this.timeout = 5000; // 5 second timeout
    }

    // General utility method to send HTTP requests to Watchout servers
    async sendRequest(serverIp, endpoint, method = 'GET', data = null, port = null) {
        const targetPort = port || this.defaultPort;
        const url = `http://${serverIp}:${targetPort}${endpoint}`;
        
        return new Promise((resolve, reject) => {
            const options = {
                method: method,
                timeout: this.timeout,
                headers: {}
            };

            if (data && method !== 'GET') {
                if (typeof data === 'object') {
                    options.headers['Content-Type'] = 'application/json';
                    data = JSON.stringify(data);
                } else if (typeof data === 'string') {
                    options.headers['Content-Type'] = 'application/json';
                }
                options.headers['Content-Length'] = Buffer.byteLength(data);
            }

            const req = http.request(url, options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        let parsedData = responseData;
                        if (res.headers['content-type']?.includes('application/json')) {
                            parsedData = JSON.parse(responseData);
                        }
                        
                        resolve({
                            success: true,
                            statusCode: res.statusCode,
                            data: parsedData,
                            headers: res.headers
                        });
                    } catch (error) {
                        resolve({
                            success: true,
                            statusCode: res.statusCode,
                            data: responseData,
                            headers: res.headers
                        });
                    }
                });
            });            req.on('error', (error) => {
                reject({
                    success: false,
                    error: this.formatConnectionError(error, serverIp),
                    code: error.code
                });
            });            req.on('timeout', () => {
                req.destroy();
                reject({
                    success: false,
                    error: `Connection timed out`,
                    code: 'TIMEOUT'
                });
            });

            if (data && method !== 'GET') {
                req.write(data);
            }
            
            req.end();
        });
    }

    // ==================== GENERAL INFORMATION ====================
    
    async getPlaybackStatus(serverIp) {
        try {
            return await this.sendRequest(serverIp, '/v0/state');
        } catch (error) {
            return error;
        }
    }

    async getCurrentShow(serverIp) {
        try {
            return await this.sendRequest(serverIp, '/v0/show');
        } catch (error) {
         
            return error;
        }
    }

    // ==================== TIMELINE CONTROL ====================
    
    async playTimeline(serverIp, timelineId = 0) {
        try {
            return await this.sendRequest(serverIp, `/v0/play/${timelineId}`, 'POST');
        } catch (error) {
            return error;
        }
    }

    async pauseTimeline(serverIp, timelineId = 0) {
        try {
            return await this.sendRequest(serverIp, `/v0/pause/${timelineId}`, 'POST');
        } catch (error) {
            return error;
        }
    }

    async stopTimeline(serverIp, timelineId = 0) {
        try {
            return await this.sendRequest(serverIp, `/v0/stop/${timelineId}`, 'POST');
        } catch (error) {
            return error;
        }
    }

    async jumpToTime(serverIp, timelineId = 0, time = 0, state = 'pause') {
        try {
            return await this.sendRequest(serverIp, `/v0/jump-to-time/${timelineId}?time=${time}&state=${state}`, 'POST');
        } catch (error) {
            return error;
        }
    }

    async jumpToCue(serverIp, timelineId = 0, cueId = 0, state = 'pause') {
        try {
            return await this.sendRequest(serverIp, `/v0/jump-to-cue/${timelineId}/${cueId}?state=${state}`, 'POST');
        } catch (error) {
            return error;
        }
    }

    // ==================== TIMELINE INFORMATION ====================
    
    async getTimelines(serverIp) {
        try {
            return await this.sendRequest(serverIp, '/v0/timelines');
        } catch (error) {
            return error;
        }
    }

    async getTimelineCues(serverIp, timelineId = 0) {
        try {
            return await this.sendRequest(serverIp, `/v0/cues/${timelineId}`);
        } catch (error) {
            return error;
        }
    }

    // ==================== INPUT MANAGEMENT ====================
    
    async sendInputs(serverIp, inputs) {
        try {
            // inputs should be an array like: [{"key": "InputName", "value": 0.5}]
            return await this.sendRequest(serverIp, '/v0/inputs', 'POST', inputs);
        } catch (error) {
            return error;
        }
    }

    // ==================== SHOW MANAGEMENT ====================

    async loadShowFromFile(filePath, showName = null) {
        try {
            const fileExtension = path.extname(filePath).toLowerCase();
            const baseShowName = showName || path.basename(filePath, fileExtension);
            
            if (fileExtension === '.json') {
                // JSON files: use /v0/show endpoint
                const fileContent = fs.readFileSync(filePath, 'utf8');
                try {
                    const jsonData = JSON.parse(fileContent);
                    return await this.uploadJsonShow(jsonData, baseShowName);
                } catch (jsonError) {
                    throw new Error(`Invalid JSON file: ${jsonError.message}`);
                }
            } else if (fileExtension === '.watch') {
                // .watch files: use /v0/showfile endpoint with HTTP
                const fileData = fs.readFileSync(filePath);
                return await this.uploadWatchShow(fileData, baseShowName);
            } else {
                throw new Error('Unsupported file type. Only .watch and .json files are supported.');
            }
        } catch (error) {
            throw new Error(`Failed to load show from file: ${error.message}`);
        }
    }

    async uploadJsonShow(jsonData, showName) {
        try {
            const response = await fetch(`http://${this.serverIp}:3040/v0/show`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: showName,
                    data: jsonData
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => response.statusText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.text();
            return { 
                success: true, 
                message: `JSON show "${showName}" uploaded successfully`, 
                data: result 
            };
        } catch (error) {
            throw new Error(`Failed to upload JSON show: ${error.message}`);
        }
    }

    async uploadWatchShow(fileData, showName) {
        try {
            const response = await fetch(`http://${this.serverIp}:3040/v0/showfile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                body: fileData
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => response.statusText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.text();
            return {
                success: true,
                message: `Watch show "${showName}" uploaded successfully`,
                data: result
            };
        } catch (error) {
            throw new Error(`Failed to upload .watch show: ${error.message}`);
        }
    }

    // ==================== NODE MANAGEMENT ====================
    
    async shutdownNode(serverIp) {
        try {
            return await this.sendRequest(serverIp, '/v0/shutdown', 'POST', null, 3017);
        } catch (error) {
            return error;
        }
    }

    async restartNodeServices(serverIp) {
        try {
            return await this.sendRequest(serverIp, '/v0/restart', 'POST', null, 3017);
        } catch (error) {
            return error;
        }
    }

    // ==================== CUSTOM COMMAND HANDLER ====================
    
    async sendCustomRequest(serverIp, endpoint, method = 'GET', data = null, port = null) {
        try {
            // Ensure endpoint starts with /
            if (!endpoint.startsWith('/')) {
                endpoint = '/' + endpoint;
            }
            
            return await this.sendRequest(serverIp, endpoint, method, data, port);
        } catch (error) {
            return error;
        }
    }

    // ==================== HELPER METHODS ====================
    
    // Format connection error messages to be more user-friendly
    formatConnectionError(error, serverIp) {
        const message = error.message || error.toString();
        const code = error.code;
        
        if (code === 'ECONNREFUSED') {
            return `Cannot connect to server`;
        } else if (code === 'ENOTFOUND') {
            return `Cannot reach server - host not found`;
        } else if (code === 'EHOSTUNREACH') {
            return `Cannot reach server - host unreachable`;
        } else if (code === 'ENETUNREACH') {
            return `Cannot reach server - network unreachable`;
        } else if (code === 'ECONNRESET') {
            return `Connection to server was reset`;
        } else if (code === 'TIMEOUT') {
            return `Connection to server timed out`;
        } else {
            // For other errors, return a generic message but preserve some detail
            return `Connection to server failed: ${message.split(' ').slice(-1)[0] || 'Unknown error'}`;
        }
    }
    
    // Quick test to see if the server is responding to HTTP API calls
    async testConnection(serverIp) {
        try {
            const result = await this.getPlaybackStatus(serverIp);
            return {
                success: result.success,
                connected: result.success && result.statusCode === 200,
                message: result.success ? 'API Connected' : result.error
            };
        } catch (error) {
            const formattedError = this.formatConnectionError(error, serverIp);
            return {
                success: false,
                connected: false,
                message: formattedError
            };
        }
    }

    // Get common server commands for quick access
    getCommonCommands(serverIp) {
        return [
            {
                name: 'Play Timeline',
                description: 'Start playback of the main timeline',
                action: () => this.playTimeline(serverIp),
                category: 'Timeline Control'
            },
            {
                name: 'Pause Timeline',
                description: 'Pause the main timeline',
                action: () => this.pauseTimeline(serverIp),
                category: 'Timeline Control'
            },
            {
                name: 'Stop Timeline',
                description: 'Stop the main timeline',
                action: () => this.stopTimeline(serverIp),
                category: 'Timeline Control'
            },
            {
                name: 'Get Status',
                description: 'Get current playback status',
                action: () => this.getPlaybackStatus(serverIp),
                category: 'Information'
            },
            {
                name: 'Get Timelines',
                description: 'Get list of available timelines',
                action: () => this.getTimelines(serverIp),
                category: 'Information'
            },
            {
                name: 'Get Current Show',
                description: 'Get current show information',
                action: () => this.getCurrentShow(serverIp),
                category: 'Information'
            }
        ];
    }
}

module.exports = WatchoutCommands;

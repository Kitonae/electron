// API abstraction layer that works in both Electron and web contexts
class ApiAdapter {
    constructor() {
        this.isElectron = typeof window.electronAPI !== 'undefined';
        console.log('API Adapter initialized for:', this.isElectron ? 'Electron' : 'Web');
    }

    // Server scanning
    async scanForWatchoutServers() {
        if (this.isElectron) {
            return window.electronAPI.scanForWatchoutServers();
        } else {
            return this.webApiCall('/scan-servers');
        }
    }

    async clearOfflineServers() {
        if (this.isElectron) {
            return window.electronAPI.clearOfflineServers();
        } else {
            return this.webApiCall('/offline-servers', { method: 'DELETE' });
        }
    }    async addManualServer(serverData) {
        if (this.isElectron) {
            return window.electronAPI.addManualServer(serverData);
        } else {
            return this.webApiCall('/manual-servers', {
                method: 'POST',
                body: JSON.stringify(serverData)
            });
        }
    }

    async updateManualServer(serverId, serverData) {
        if (this.isElectron) {
            return window.electronAPI.updateManualServer(serverId, serverData);
        } else {
            return this.webApiCall(`/manual-servers/${serverId}`, {
                method: 'PUT',
                body: JSON.stringify(serverData)
            });
        }
    }

    async removeManualServer(serverId) {
        if (this.isElectron) {
            return window.electronAPI.removeManualServer(serverId);
        } else {
            return this.webApiCall(`/manual-servers/${serverId}`, {
                method: 'DELETE'
            });
        }
    }

    async getAppVersion() {
        if (this.isElectron) {
            return window.electronAPI.getAppVersion();
        } else {
            const result = await this.webApiCall('/version');
            return result.version || '1.0.0';
        }
    }

    // Watchout Commands
    async watchoutTestConnection(serverIp) {
        if (this.isElectron) {
            return window.electronAPI.watchout.testConnection(serverIp);
        } else {
            return this.webApiCall(`/watchout/${serverIp}/test-connection`, { method: 'POST' });
        }
    }

    async watchoutGetStatus(serverIp) {
        if (this.isElectron) {
            return window.electronAPI.watchout.getStatus(serverIp);
        } else {
            return this.webApiCall(`/watchout/${serverIp}/status`);
        }
    }    async watchoutGetShow(serverIp) {
        if (this.isElectron) {
            return window.electronAPI.watchout.getShow(serverIp);
        } else {
            return this.webApiCall(`/watchout/${serverIp}/show`);
        }
    }    async watchoutSaveShow(serverIp) {
        if (this.isElectron) {
            return window.electronAPI.watchout.saveShow(serverIp);
        } else {
            // For web version, we can't show file dialogs, so we'll download the file
            try {
                const showData = await this.webApiCall(`/watchout/${serverIp}/show`);
                if (showData.success) {
                    // Create a downloadable JSON file
                    const jsonContent = JSON.stringify(showData.data, null, 2);
                    const blob = new Blob([jsonContent], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `watchout-show-${serverIp}-${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    return { 
                        success: true, 
                        message: `Show data downloaded as ${a.download}`,
                        data: showData.data
                    };
                }
                return showData;
            } catch (error) {
                return { success: false, error: error.message };
            }
        }
    }

    async watchoutUploadShow(serverIp, showName) {
        if (this.isElectron) {
            return window.electronAPI.watchout.uploadShow(serverIp, showName);
        } else {
            // For web version, we need to handle file upload differently
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.watch,.json';
                input.style.display = 'none';
                
                input.onchange = async (event) => {
                    const file = event.target.files[0];
                    if (!file) {
                        resolve({ success: false, error: 'No file selected' });
                        return;
                    }
                    
                    try {
                        const formData = new FormData();
                        formData.append('showFile', file);
                        if (showName) {
                            formData.append('showName', showName);
                        }
                        
                        const response = await fetch(`${window.location.origin}/api/watchout/${serverIp}/upload-show`, {
                            method: 'POST',
                            body: formData
                        });
                        
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }
                        
                        const result = await response.json();
                        resolve(result);
                    } catch (error) {
                        resolve({ success: false, error: error.message });
                    } finally {
                        document.body.removeChild(input);
                    }
                };
                
                document.body.appendChild(input);
                input.click();
            });
        }
    }

    async watchoutGetTimelines(serverIp) {
        if (this.isElectron) {
            return window.electronAPI.watchout.getTimelines(serverIp);
        } else {
            return this.webApiCall(`/watchout/${serverIp}/timelines`);
        }
    }

    async watchoutPlayTimeline(serverIp, timelineId = 0) {
        if (this.isElectron) {
            return window.electronAPI.watchout.playTimeline(serverIp, timelineId);
        } else {
            return this.webApiCall(`/watchout/${serverIp}/play/${timelineId}`, { method: 'POST' });
        }
    }

    async watchoutPauseTimeline(serverIp, timelineId = 0) {
        if (this.isElectron) {
            return window.electronAPI.watchout.pauseTimeline(serverIp, timelineId);
        } else {
            return this.webApiCall(`/watchout/${serverIp}/pause/${timelineId}`, { method: 'POST' });
        }
    }

    async watchoutStopTimeline(serverIp, timelineId = 0) {
        if (this.isElectron) {
            return window.electronAPI.watchout.stopTimeline(serverIp, timelineId);
        } else {
            return this.webApiCall(`/watchout/${serverIp}/stop/${timelineId}`, { method: 'POST' });
        }
    }

    async watchoutSendCustomRequest(serverIp, endpoint, method, data) {
        if (this.isElectron) {
            return window.electronAPI.watchout.sendCustomRequest(serverIp, endpoint, method, data);
        } else {
            return this.webApiCall(`/watchout/${serverIp}/custom`, {
                method: 'POST',
                body: JSON.stringify({ endpoint, method, data })
            });
        }
    }

    // Settings API
    async getAppSettings() {
        if (this.isElectron) {
            return window.electronAPI.getAppSettings();
        } else {
            // For web version, return default settings for now
            return { enableCacheFromDisk: true, enableWebServer: true };
        }
    }

    async saveAppSettings(settings) {
        if (this.isElectron) {
            return window.electronAPI.saveAppSettings(settings);
        } else {
            // For web version, settings would be handled server-side
            return this.webApiCall('/settings', {
                method: 'POST',
                body: JSON.stringify(settings)
            });
        }
    }

    async getWebServerStatus() {
        if (this.isElectron) {
            return window.electronAPI.getWebServerStatus();
        } else {
            // For web version, server is obviously running if we can call this
            return { running: true, port: window.location.port || 3080 };
        }
    }

    async getCacheFileLocation() {
        if (this.isElectron) {
            return window.electronAPI.getCacheFileLocation();
        } else {
            // For web version, this would come from the server
            return 'Default cache location';
        }
    }

    // Web Server Control Methods
    async stopWebServer() {
        if (this.isElectron) {
            return window.electronAPI.stopWebServer();
        } else {
            // For web version, we can't actually stop the server we're running on
            return this.webApiCall('/webserver/stop', { method: 'POST' });
        }
    }

    async restartWebServer() {
        if (this.isElectron) {
            return window.electronAPI.restartWebServer();
        } else {
            // For web version, we can't actually restart the server we're running on
            return this.webApiCall('/webserver/restart', { method: 'POST' });
        }
    }

    // Startup Checks Methods
    async performStartupChecks() {
        if (this.isElectron) {
            return window.electronAPI.performStartupChecks();
        } else {
            // For web version, perform basic checks
            return {
                success: true,
                result: {
                    success: true,
                    warnings: [],
                    errors: []
                }
            };
        }
    }

    async dismissStartupWarning(warningType) {
        if (this.isElectron) {
            return window.electronAPI.dismissStartupWarning(warningType);
        } else {
            return { success: true };
        }
    }

    // Event listener methods
    onStartupWarning(callback) {
        if (this.isElectron && window.electronAPI.onStartupWarning) {
            window.electronAPI.onStartupWarning(callback);
        }
    }

    onWebServerError(callback) {
        if (this.isElectron && window.electronAPI.onWebServerError) {
            window.electronAPI.onWebServerError(callback);
        }
    }

    // Web API helper method
    async webApiCall(endpoint, options = {}) {
        try {
            const baseUrl = window.location.origin;
            const response = await fetch(`${baseUrl}/api${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Web API call failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Make ApiAdapter available globally
window.ApiAdapter = ApiAdapter;

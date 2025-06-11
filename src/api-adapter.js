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
    }

    async watchoutGetShow(serverIp) {
        if (this.isElectron) {
            return window.electronAPI.watchout.getShow(serverIp);
        } else {
            return this.webApiCall(`/watchout/${serverIp}/show`);
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
            // For web version, cache is server-side
            return 'Server-side cache';
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

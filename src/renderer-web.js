// Web version of the renderer that uses fetch API instead of Electron IPC
class WatchoutServerFinderWebApp {
    constructor() {
        this.servers = [];
        this.isScanning = false;
        this.scanInterval = null;
        this.backgroundScanEnabled = true;
        this.scanIntervalMs = 30000; // 30 seconds
        this.selectedServerId = null;
        this.selectedServerIp = null;
        this.apiConnectionStatus = false;
        this.serverCommandStates = new Map();
        this.availableTimelines = [];
        this.baseUrl = window.location.origin; // Use current host for API calls
        this.initializeApp();
    }

    async initializeApp() {
        this.bindEvents();
        await this.loadAppVersion();
        this.updateUI();
        this.startBackgroundScanning();
    }

    bindEvents() {
        const scanButton = document.getElementById('scanButton');
        scanButton.addEventListener('click', () => this.startManualScan());
        
        const clearOfflineButton = document.getElementById('clearOfflineButton');
        clearOfflineButton.addEventListener('click', () => this.clearOfflineServers());
        
        this.bindCommandEvents();
    }

    bindCommandEvents() {
        // Timeline control commands
        document.getElementById('playBtn')?.addEventListener('click', () => this.executeCommand('play'));
        document.getElementById('pauseBtn')?.addEventListener('click', () => this.executeCommand('pause'));
        document.getElementById('stopBtn')?.addEventListener('click', () => this.executeCommand('stop'));
          // Information commands
        document.getElementById('statusBtn')?.addEventListener('click', () => this.executeCommand('status'));
        document.getElementById('timelinesBtn')?.addEventListener('click', () => this.executeCommand('timelines'));
        document.getElementById('showBtn')?.addEventListener('click', () => this.executeCommand('show'));
        document.getElementById('uploadShowBtn')?.addEventListener('click', () => this.executeCommand('uploadShow'));
        
        // Advanced commands
        document.getElementById('testConnectionBtn')?.addEventListener('click', () => this.executeCommand('testConnection'));
        document.getElementById('customCommandBtn')?.addEventListener('click', () => this.showCustomCommandDialog());
        
        // Timeline selector change event
        document.getElementById('timelineSelector')?.addEventListener('change', () => this.onTimelineSelectionChange());
        
        // Response area
        document.getElementById('clearResponseBtn')?.addEventListener('click', () => this.clearCommandResponse());
    }

    // API wrapper methods that use fetch instead of Electron IPC
    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/api${endpoint}`, {
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
            console.error('API call failed:', error);
            return { success: false, error: error.message };
        }
    }

    async scanForWatchoutServers() {
        return this.apiCall('/scan-servers');
    }

    async clearOfflineServers() {
        return this.apiCall('/offline-servers', { method: 'DELETE' });
    }

    async getAppVersion() {
        const result = await this.apiCall('/version');
        return result.version || '1.0.0';
    }

    // Watchout Commands API calls
    async watchoutTestConnection(serverIp) {
        return this.apiCall(`/watchout/${serverIp}/test-connection`, { method: 'POST' });
    }

    async watchoutGetStatus(serverIp) {
        return this.apiCall(`/watchout/${serverIp}/status`);
    }    async watchoutGetShow(serverIp) {
        return this.apiCall(`/watchout/${serverIp}/show`);
    }    async watchoutSaveShow(serverIp) {
        try {
            // Get show data first
            const showData = await this.apiCall(`/watchout/${serverIp}/show`);
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

    async watchoutUploadShow(serverIp) {
        try {
            const fileInput = document.getElementById('uploadShowFile');
            if (!fileInput.files.length) {
                alert('Please select a file to upload');
                return;
            }

            const file = fileInput.files[0];
            const fileName = file.name;
            const fileExtension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

            if (!fileExtension.match(/\.(watch|json)$/)) {
                alert('Please select a .watch or .json file');
                return;
            }

            const showName = prompt('Enter show name (or leave empty to use filename):') || 
                            fileName.substring(0, fileName.lastIndexOf('.'));

            setCommandButtonLoading('uploadShow', true);

            if (fileExtension === '.json') {
                // Handle JSON files with /v0/show endpoint
                const fileContent = await file.text();
                let jsonData;
                try {
                    jsonData = JSON.parse(fileContent);
                } catch (error) {
                    throw new Error(`Invalid JSON file: ${error.message}`);
                }

                const response = await fetch(`http://${serverIp}:3040/v0/show`, {
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
                updateCommandResponse(`JSON show "${showName}" uploaded successfully`);
            } else {
                // Handle .watch files with /v0/showfile endpoint
                const fileData = await file.arrayBuffer();

                const response = await fetch(`http://${serverIp}:3040/v0/showfile`, {
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
                updateCommandResponse(`Watch show "${showName}" uploaded successfully`);
            }

            fileInput.value = '';
        } catch (error) {
            console.error('Upload show error:', error);
            updateCommandResponse(`Upload failed: ${error.message}`);
        } finally {
            setCommandButtonLoading('uploadShow', false);
        }
    }

    async watchoutGetTimelines(serverIp) {
        return this.apiCall(`/watchout/${serverIp}/timelines`);
    }

    async watchoutPlayTimeline(serverIp, timelineId = 0) {
        return this.apiCall(`/watchout/${serverIp}/play/${timelineId}`, { method: 'POST' });
    }

    async watchoutPauseTimeline(serverIp, timelineId = 0) {
        return this.apiCall(`/watchout/${serverIp}/pause/${timelineId}`, { method: 'POST' });
    }

    async watchoutStopTimeline(serverIp, timelineId = 0) {
        return this.apiCall(`/watchout/${serverIp}/stop/${timelineId}`, { method: 'POST' });
    }

    async watchoutSendCustomRequest(serverIp, endpoint, method, data) {
        return this.apiCall(`/watchout/${serverIp}/custom`, {
            method: 'POST',
            body: JSON.stringify({ endpoint, method, data })
        });
    }

    // Rest of the methods are the same as the Electron version...
    // Copy all the UI methods from the original renderer.js but replace API calls
    
    startBackgroundScanning() {
        console.log('Starting background scanning every', this.scanIntervalMs / 1000, 'seconds');
        
        this.performBackgroundScan();
        
        this.scanInterval = setInterval(() => {
            if (this.backgroundScanEnabled && !this.isScanning) {
                this.performBackgroundScan();
            }
        }, this.scanIntervalMs);
    }

    stopBackgroundScanning() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
            console.log('Background scanning stopped');
        }
    }

    async performBackgroundScan() {
        if (this.isScanning) return;

        console.log('Performing background scan...');
        
        try {
            const result = await this.scanForWatchoutServers();
            
            if (result.success) {
                const previousCount = this.servers.length;
                this.servers = result.servers;
                
                if (this.servers.length !== previousCount) {
                    this.updateScanStatus(`Background scan: Found ${this.servers.length} server(s).`);
                    console.log(`Background scan found ${this.servers.length} servers`);
                }
                
                this.updateUI();
            } else {
                console.warn('Background scan failed:', result.error);
            }
        } catch (error) {
            console.error('Background scan error:', error);
        }
    }

    async startManualScan() {
        if (this.isScanning) return;

        const wasBackgroundEnabled = this.backgroundScanEnabled;
        this.backgroundScanEnabled = false;

        this.isScanning = true;
        this.updateScanButton();
        this.updateScanStatus('Manual scan: Scanning network for Watchout servers...');
        
        try {
            const result = await this.scanForWatchoutServers();
            
            if (result.success) {
                this.servers = result.servers;
                this.updateScanStatus(`Manual scan completed. Found ${this.servers.length} server(s).`);
            } else {
                this.updateScanStatus(`Manual scan failed: ${result.error}`);
                console.error('Manual scan error:', result.error);
            }
        } catch (error) {
            this.updateScanStatus('Manual scan failed: Network error');
            console.error('Manual scan network error:', error);
        } finally {
            this.isScanning = false;
            this.backgroundScanEnabled = wasBackgroundEnabled;
            this.updateScanButton();
            this.updateUI();
        }
    }

    async loadAppVersion() {
        try {
            const version = await this.getAppVersion();
            const versionElement = document.getElementById('appVersion');
            if (versionElement) {
                versionElement.textContent = version;
            }
        } catch (error) {
            console.error('Failed to load app version:', error);
        }
    }

    // Copy all other methods from renderer.js...
    // For now, I'll include the essential ones and note that others should be copied

    updateScanButton() {
        const button = document.getElementById('scanButton');
        
        if (this.isScanning) {
            button.disabled = true;
            button.classList.add('scanning');
        } else {
            button.disabled = false;
            button.classList.remove('scanning');
        }
    }

    updateScanStatus(message) {
        const statusElement = document.getElementById('scanStatus');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    updateUI() {
        this.updateServerCounts();
        this.updateClearOfflineButtonState();
        this.renderSidebar();
        this.renderMainContent();
    }

    updateServerCounts() {
        const count = this.servers.length;
        
        const serverCountSidebar = document.getElementById('serverCountSidebar');
        if (serverCountSidebar) {
            serverCountSidebar.textContent = count.toString();
        }
    }

    updateClearOfflineButtonState() {
        const clearOfflineButton = document.getElementById('clearOfflineButton');
        const hasOfflineServers = this.servers.some(server => server.status === 'offline');
        
        if (clearOfflineButton) {
            clearOfflineButton.disabled = !hasOfflineServers;
            clearOfflineButton.style.opacity = hasOfflineServers ? '1' : '0.5';
        }
    }

    // Execute command with web API calls
    async executeCommand(commandType) {
        if (!this.selectedServerIp) {
            this.addCommandResponse('error', commandType, 'No server selected');
            return;
        }

        let result;

        try {
            this.setCommandButtonLoading(commandType, true);
            
            switch (commandType) {
                case 'play':
                    const playTimelineId = this.getSelectedTimelineId();
                    result = await this.watchoutPlayTimeline(this.selectedServerIp, playTimelineId);
                    if (result.success) {
                        result.timelineContext = `Timeline ID: ${playTimelineId}`;
                    }
                    break;
                case 'pause':
                    const pauseTimelineId = this.getSelectedTimelineId();
                    result = await this.watchoutPauseTimeline(this.selectedServerIp, pauseTimelineId);
                    if (result.success) {
                        result.timelineContext = `Timeline ID: ${pauseTimelineId}`;
                    }
                    break;
                case 'stop':
                    const stopTimelineId = this.getSelectedTimelineId();
                    result = await this.watchoutStopTimeline(this.selectedServerIp, stopTimelineId);
                    if (result.success) {
                        result.timelineContext = `Timeline ID: ${stopTimelineId}`;
                    }
                    break;
                case 'status':
                    result = await this.watchoutGetStatus(this.selectedServerIp);
                    break;
                case 'timelines':
                    result = await this.watchoutGetTimelines(this.selectedServerIp);
                    if (result.success && result.data) {
                        this.populateTimelineSelector(result.data);
                    }
                    break;                case 'show':
                    result = await this.watchoutSaveShow(this.selectedServerIp);
                    break;
                case 'uploadShow':
                    result = await this.watchoutUploadShow(this.selectedServerIp);
                    break;
                case 'testConnection':
                    result = await this.watchoutTestConnection(this.selectedServerIp);
                    this.updateConnectionStatus(result.connected, result.message);
                    break;
                default:
                    throw new Error(`Unknown command: ${commandType}`);
            }
            
            this.addCommandResponse(result.success ? 'success' : 'error', commandType, result);

        } catch (error) {
            this.addCommandResponse('error', commandType, { error: error.message });
        } finally {
            this.setCommandButtonLoading(commandType, false);
        }
    }

    // Placeholder methods - these would need to be copied from the original renderer.js
    renderSidebar() {
        // TODO: Copy implementation from renderer.js
        console.log('renderSidebar - not yet implemented');
    }

    renderMainContent() {
        // TODO: Copy implementation from renderer.js
        console.log('renderMainContent - not yet implemented');
    }

    getSelectedTimelineId() {
        const selector = document.getElementById('timelineSelector');
        const selectedValue = selector?.value;
        return selectedValue ? parseInt(selectedValue) : 0;
    }

    addCommandResponse(type, command, result) {
        // TODO: Copy implementation from renderer.js
        console.log('addCommandResponse:', type, command, result);
    }    setCommandButtonLoading(commandType, loading) {
        const buttonMap = {
            'play': 'playBtn',
            'pause': 'pauseBtn',
            'stop': 'stopBtn',
            'status': 'statusBtn',
            'timelines': 'timelinesBtn',
            'show': 'showBtn',
            'uploadShow': 'uploadShowBtn',
            'testConnection': 'testConnectionBtn'
        };

        const buttonId = buttonMap[commandType];
        const button = document.getElementById(buttonId);
        
        if (button) {
            button.disabled = loading;
            
            if (loading) {
                // Store original text and replace with loading indicator
                button.dataset.originalText = button.textContent;
                button.textContent = '⏳ Processing...';
            } else {
                // Restore original content
                if (button.dataset.originalText) {
                    button.textContent = button.dataset.originalText;
                    delete button.dataset.originalText;
                }
            }
        }
    }

    populateTimelineSelector(data) {
        // TODO: Copy implementation from renderer.js
        console.log('populateTimelineSelector:', data);
    }

    updateConnectionStatus(connected, message) {
        // TODO: Copy implementation from renderer.js
        console.log('updateConnectionStatus:', connected, message);
    }

    onTimelineSelectionChange() {
        // TODO: Copy implementation from renderer.js
        console.log('onTimelineSelectionChange');
    }

    showCustomCommandDialog() {
        // TODO: Copy implementation from renderer.js
        console.log('showCustomCommandDialog');
    }

    clearCommandResponse() {
        // TODO: Copy implementation from renderer.js
        console.log('clearCommandResponse');
    }
}

// Initialize the web app when DOM is loaded
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.watchoutApp = new WatchoutServerFinderWebApp();
    });
}

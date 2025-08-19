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

    // Toast helpers (web)
    ensureToastContainer() {
        let el = document.getElementById('toastContainer');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toastContainer';
            el.className = 'toast-container';
            document.body.appendChild(el);
        }
        return el;
    }
    showToast({ title = 'Notice', message = '', severity = 'info', icon = '', actions = [], duration = 6000 } = {}) {
        try {
            const container = this.ensureToastContainer();
            const toast = document.createElement('div');
            toast.className = `toast ${severity}`;
            const iconEl = document.createElement('div');
            iconEl.className = 'toast-icon';
            iconEl.textContent = icon || (severity === 'error' ? '⛔' : severity === 'warning' ? '⚠️' : 'ℹ️');
            const content = document.createElement('div');
            content.className = 'toast-content';
            const titleEl = document.createElement('div');
            titleEl.className = 'toast-title';
            titleEl.textContent = title;
            const msgEl = document.createElement('div');
            msgEl.className = 'toast-message';
            msgEl.textContent = message;
            content.appendChild(titleEl);
            content.appendChild(msgEl);
            if (actions && actions.length) {
                const actionsEl = document.createElement('div');
                actionsEl.className = 'toast-actions';
                actions.forEach(a => {
                    const btn = document.createElement('button');
                    btn.className = a.primary ? 'btn btn-primary btn-sm' : 'btn btn-sm';
                    btn.textContent = a.label;
                    btn.onclick = () => { try { a.onClick && a.onClick(); } finally { closeNow(); } };
                    actionsEl.appendChild(btn);
                });
                content.appendChild(actionsEl);
            }
            const close = document.createElement('button');
            close.className = 'toast-close';
            close.innerHTML = '&times;';
            const closeNow = () => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 200); };
            close.onclick = closeNow;
            toast.appendChild(iconEl);
            toast.appendChild(content);
            toast.appendChild(close);
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            if (duration > 0) setTimeout(() => { if (toast.isConnected) closeNow(); }, duration);
        } catch (e) { console.error('showToast failed', e); }
    }
    confirmToast(message, { title = 'Please Confirm', okLabel = 'OK', cancelLabel = 'Cancel', severity = 'warning' } = {}) {
        return new Promise((resolve) => {
            this.showToast({
                title, message, severity, duration: 0,
                actions: [
                    { label: cancelLabel, onClick: () => resolve(false) },
                    { label: okLabel, primary: true, onClick: () => resolve(true) },
                ]
            });
        });
    }

    async initializeApp() {
        this.bindEvents();
        await this.loadAppVersion();
        this.updateUI();
        this.startBackgroundScanning();
        this.initPlaybackUpdates();
    }

    bindEvents() {
        const scanButton = document.getElementById('scanButton');
        scanButton.addEventListener('click', () => this.startManualScan());
        
        const clearOfflineButton = document.getElementById('clearOfflineButton');
        clearOfflineButton.addEventListener('click', () => this.clearOfflineServers());
        
        const addServerButton = document.getElementById('addServerButton');
        addServerButton.addEventListener('click', () => this.showAddServerDialog());
        
        this.bindCommandEvents();
    }
    initPlaybackUpdates() {
        try {
            this.sseEnabled = true;
            this.sseAutoscroll = true;
            const liveToggle = document.getElementById('sseToggle');
            const autoToggle = document.getElementById('sseAutoscrollToggle');
            if (liveToggle) {
                liveToggle.classList.add('active');
                liveToggle.setAttribute('aria-pressed', 'true');
                liveToggle.addEventListener('click', () => {
                    this.sseEnabled = !this.sseEnabled;
                    liveToggle.classList.toggle('active', this.sseEnabled);
                    liveToggle.setAttribute('aria-pressed', this.sseEnabled ? 'true' : 'false');
                    if (this.sseEnabled) {
                        this.restartSSE();
                    } else if (this.sseSource) {
                        try { this.sseSource.close(); } catch {}
                        this.sseSource = null;
                        const badge = document.getElementById('sseConnectionBadge');
                        if (badge) { badge.textContent = 'Disconnected'; badge.className = 'connection-badge'; }
                    }
                });
            }
            if (autoToggle) {
                autoToggle.classList.add('active');
                autoToggle.setAttribute('aria-pressed', 'true');
                autoToggle.addEventListener('click', () => {
                    this.sseAutoscroll = !this.sseAutoscroll;
                    autoToggle.classList.toggle('active', this.sseAutoscroll);
                    autoToggle.setAttribute('aria-pressed', this.sseAutoscroll ? 'true' : 'false');
                });
            }
            this.restartSSE();
        } catch (e) {
            console.warn('Failed to initialize playback updates:', e);
        }
    }
    restartSSE() {
        if (this.sseEnabled === false) {
            const badge = document.getElementById('sseConnectionBadge');
            if (badge) { badge.textContent = 'Disconnected'; badge.className = 'connection-badge'; }
            return;
        }
        try { if (this.sseSource) { this.sseSource.close(); this.sseSource = null; } } catch {}
        const badge = document.getElementById('sseConnectionBadge');
        if (badge) { badge.textContent = 'Connecting…'; badge.className = 'connection-badge'; }
        try {
            const url = 'http://localhost:3019/v1/sse';
            this.sseSource = new EventSource(url);
            this.sseSource.onopen = () => { if (badge) { badge.textContent = 'Connected'; badge.className = 'connection-badge connected'; } };
            this.sseSource.onerror = () => { if (badge) { badge.textContent = 'Error'; badge.className = 'connection-badge error'; } };
            this.sseSource.onmessage = (evt) => { this.addPlaybackUpdate(evt.data); };
        } catch (e) {
            if (badge) { badge.textContent = 'Error'; badge.className = 'connection-badge error'; }
            console.error('SSE init failed:', e);
        }
    }
    addPlaybackUpdate(data) {
        const list = document.getElementById('playbackUpdatesList');
        if (!list) return;
        const placeholder = list.querySelector('.no-updates');
        if (placeholder) placeholder.remove();
        let text = data;
        try { const parsed = JSON.parse(data); text = JSON.stringify(parsed, null, 2); } catch {}
        const item = document.createElement('pre');
        item.className = 'playback-update-item appear';
        const ts = new Date().toLocaleTimeString();
        item.innerHTML = `<span class=\"timestamp\">${ts}</span>${text}`;
        list.prepend(item);
        const items = list.querySelectorAll('.playback-update-item');
        if (items.length > 50) items[items.length - 1].remove();
        setTimeout(() => { try { item.classList.remove('appear'); } catch {} }, 600);
        if (this.sseAutoscroll) {
            const area = document.getElementById('playbackUpdatesArea');
            if (area) area.scrollTop = 0;
        }
    }
    bindCommandEvents() {
        // Timeline control commands
        document.getElementById('playBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.executeCommand('play');
        });
        document.getElementById('pauseBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.executeCommand('pause');
        });
        document.getElementById('stopBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.executeCommand('stop');
        });
          // Information commands
        document.getElementById('statusBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.executeCommand('status');
        });
        document.getElementById('timelinesBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.executeCommand('timelines');
        });
        document.getElementById('showBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.executeCommand('show');
        });
        document.getElementById('uploadShowBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.executeCommand('uploadShow');
        });
          // Advanced commands
        document.getElementById('testConnectionBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.executeCommand('testConnection');
        });
        document.getElementById('customCommandBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.showCustomCommandDialog();
        });
        document.getElementById('logViewerBtn')?.addEventListener('click', (e) => {
            this.addRippleEffect(e.currentTarget);
            this.showLokiLogViewer();
        });
        
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
    }    async addManualServerToBackend(serverData) {
        return this.apiCall('/manual-servers', {
            method: 'POST',
            body: JSON.stringify(serverData)
        });
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
                this.showToast({ title: 'No File Selected', message: 'Please select a file to upload.', severity: 'warning' });
                return;
            }

            const file = fileInput.files[0];
            const fileName = file.name;
            const fileExtension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

            if (!fileExtension.match(/\.(watch|json)$/)) {
                this.showToast({ title: 'Invalid File', message: 'Please select a .watch or .json file.', severity: 'warning' });
                return;
            }

            const showName = fileName.substring(0, fileName.lastIndexOf('.'));
            this.showToast({ title: 'Using Show Name', message: `Using "${showName}" as show name.`, severity: 'info', duration: 3000 });

            setCommandButtonLoading('uploadShow', true);            if (fileExtension === '.json') {
                // Handle JSON files with /v0/show endpoint
                const fileContent = await file.text();
                let jsonData;
                try {
                    jsonData = JSON.parse(fileContent);
                } catch (error) {
                    throw new Error(`Invalid JSON file: ${error.message}`);
                }                const response = await fetch(`http://${serverIp}:3040/v0/show?showName=${encodeURIComponent(showName)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(jsonData)
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => response.statusText);
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const result = await response.text();
                updateCommandResponse(`JSON show "${showName}" uploaded successfully`);
            } else {
                // Handle .watch files with /v0/showfile endpoint
                const fileData = await file.arrayBuffer();                const response = await fetch(`http://${serverIp}:3040/v0/showfile?showName=${encodeURIComponent(showName)}`, {
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

    // ==================== LOKI LOG API METHODS ====================
    
    async lokiTestConnection(serverIp) {
        return this.apiCall(`/loki/${serverIp}/test-connection`, { method: 'POST' });
    }

    async lokiQueryLogs(serverIp, query, limit, since) {
        const params = new URLSearchParams();
        if (query) params.append('query', query);
        if (limit) params.append('limit', limit.toString());
        if (since) params.append('since', since);
        
        return this.apiCall(`/loki/${serverIp}/query?${params}`);
    }

    async lokiStartStream(serverIp, query, refreshInterval) {
        return this.apiCall(`/loki/${serverIp}/stream/start`, {
            method: 'POST',
            body: JSON.stringify({ query, refreshInterval })
        });
    }

    async lokiStopStream(serverIp) {
        return this.apiCall(`/loki/${serverIp}/stream/stop`, { method: 'POST' });
    }

    async lokiGetLabels(serverIp) {
        return this.apiCall(`/loki/${serverIp}/labels`);
    }

    async lokiGetLabelValues(serverIp, label) {
        return this.apiCall(`/loki/${serverIp}/labels/${encodeURIComponent(label)}/values`);
    }

    async lokiGetCommonQueries() {
        return this.apiCall('/loki/common-queries');
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
    }    async performBackgroundScan() {
        if (this.isScanning) return;

        console.log('Performing background scan...');
        
        // Set scanning state and update button animation
        this.isScanning = true;
        this.updateScanButton();
        
        try {
            const result = await this.scanForWatchoutServers();
            
            if (result.success) {
                const previousCount = this.servers.length;
                this.servers = result.servers;
                
                if (this.servers.length !== previousCount) {
                    this.updateScanStatus(`Discovery: Found ${this.servers.length} server(s).`);
                    console.log(`Background scan found ${this.servers.length} servers`);
                }
                
                this.updateUI();
            } else {
                console.warn('Background scan failed:', result.error);
            }
        } catch (error) {
            console.error('Background scan error:', error);
        } finally {
            // Clear scanning state and update button animation
            this.isScanning = false;
            this.updateScanButton();
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
                    }                    break;                case 'status':
                    result = await this.watchoutGetStatus(this.selectedServerIp);
                    if (result.success && result.data) {
                        result.isStatusResponse = true;
                        // Also get timelines for name cross-reference
                        try {
                            const timelinesResult = await this.watchoutGetTimelines(this.selectedServerIp);
                            if (timelinesResult.success && timelinesResult.data) {
                                result.timelinesReference = timelinesResult.data;
                            }
                        } catch (error) {
                            console.warn('Could not get timelines for status cross-reference:', error);
                        }
                        // Update the show information panel with status visualization
                        this.updateServerDetailsWithStatus(result);
                    }
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

            // Auto-refresh status after transport commands
            if (result?.success && ['play', 'pause', 'stop'].includes(commandType)) {
                setTimeout(() => {
                    try { this.executeCommand('status'); } catch (e) { /* ignore */ }
                }, 400);
            }

        } catch (error) {
            this.addCommandResponse('error', commandType, { error: error.message });
        } finally {
            this.setCommandButtonLoading(commandType, false);
        }
    }

    // Placeholder methods - these would need to be copied from the original renderer.js
    renderSidebar() {
        const serverList = document.getElementById('serverList');
        const noServersSidebar = document.getElementById('noServersSidebar');

        if (this.servers.length === 0) {
            noServersSidebar.style.display = 'flex';
            // Clear selection when no servers
            this.selectedServerId = null;
            // Remove any existing server items
            const existingItems = serverList.querySelectorAll('.server-item');
            existingItems.forEach(item => item.remove());
            return;
        }

        noServersSidebar.style.display = 'none';
        
        // Sort servers: online first, offline below
        const onlineServers = this.servers.filter(server => server.status === 'online');
        const offlineServers = this.servers.filter(server => server.status === 'offline');
        
        // Auto-select first server if none selected or selected server no longer exists
        // Prioritize online servers, fallback to offline servers
        let autoSelected = false;
        if (!this.selectedServerId || !this.servers.some(s => this.getServerId(s) === this.selectedServerId)) {
            const firstServer = onlineServers.length > 0 ? onlineServers[0] : offlineServers[0];
            if (firstServer) {
                this.selectedServerId = this.getServerId(firstServer);
                this.selectedServerIp = firstServer.ip;
                autoSelected = true;
            }
        }
        
        // Remove existing server items
        const existingItems = serverList.querySelectorAll('.server-item, .server-divider');
        existingItems.forEach(item => item.remove());

        // Create online server items
        onlineServers.forEach(server => {
            const serverItem = this.createServerItem(server);
            serverList.appendChild(serverItem);
        });

        // Add divider if there are both online and offline servers
        if (onlineServers.length > 0 && offlineServers.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'server-divider';
            serverList.appendChild(divider);
        }

        // Create offline server items
        offlineServers.forEach(server => {
            const serverItem = this.createServerItem(server);
            serverList.appendChild(serverItem);
        });
    }

    createServerItem(server) {
        const item = document.createElement('div');
        item.className = 'server-item';
        
        const serverId = this.getServerId(server);
        item.dataset.serverId = serverId;
        
        // Check if this item should be selected
        if (this.selectedServerId === serverId) {
            item.classList.add('selected');
        }
        
        // Use hostRef as the primary name, fallback to hostname or IP
        const serverName = server.hostRef || server.hostname || server.ip || 'Unknown Server';
        
        // Truncate long names for sidebar
        const displayName = serverName.length > 25 ? 
            serverName.substring(0, 22) + '...' : serverName;
            
        // Determine simplified type
        const simplifiedType = this.getSimplifiedServerType(server);
        
        // Determine status info
        const isOnline = server.status === 'online';
        let statusText = isOnline ? 'Online' : 'Offline';
        let statusClass = isOnline ? 'online' : 'offline';
          // Override for manual servers
        if (server.isManual && isOnline) {
            statusText = 'Manual';
            statusClass = 'manual';
        }
        
        // Build manual server actions if this is a manual server
        let manualActions = '';
        if (server.isManual) {
            manualActions = `
                <div class="manual-server-actions">
                    <button class="manual-edit-btn" title="Edit server" onclick="event.stopPropagation(); app.editManualServer('${serverId}')">
                        ✏️
                    </button>
                    <button class="manual-remove-btn" title="Remove server" onclick="event.stopPropagation(); app.removeManualServer('${serverId}')">
                        🗑️
                    </button>
                </div>
            `;
        }
        
        item.innerHTML = `
            <div class="server-item-content">
                <div class="server-item-name">${this.escapeHtml(displayName)}</div>
                <div class="server-item-details">
                    <div class="server-item-ip">${this.escapeHtml(server.ip)}</div>
                    <div class="server-item-type">${this.escapeHtml(simplifiedType)}</div>
                    <div class="server-item-status">
                        <div class="status-indicator ${statusClass}"></div>
                        <span class="status-text">${statusText}</span>
                    </div>
                </div>
                ${manualActions}
            </div>
        `;
        
        // Add click event listener
        item.addEventListener('click', () => {
            this.selectServer(serverId);
        });
        
        return item;
    }

    renderMainContent() {
        // For the web version, we might want to implement server details view
        // For now, just log that a server is selected
        if (this.selectedServerId) {
            console.log('Selected server:', this.selectedServerId);
        }
    }

    selectServer(serverId) {
        // Update selected server
        this.selectedServerId = serverId;
          // Find the selected server to get its IP
        const selectedServer = this.servers.find(server => this.getServerId(server) === serverId);
        this.selectedServerIp = selectedServer ? selectedServer.ip : null;
        
        // Hide status information area when switching servers
        this.hideStatusInformation();
        
        // Update sidebar selection visual state
        const serverItems = document.querySelectorAll('.server-item');
        serverItems.forEach(item => {
            if (item.dataset.serverId === serverId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Update main content
        this.renderMainContent();
        
        console.log('Selected server:', serverId, 'IP:', this.selectedServerIp);
    }

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return unsafe;
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    getSelectedTimelineId() {
        const selector = document.getElementById('timelineSelector');
        const selectedValue = selector?.value;
        return selectedValue ? parseInt(selectedValue) : 0;
    }    addCommandResponse(type, command, result) {
        // Get or create response content area
        const responseContent = document.getElementById('commandResponse') || document.getElementById('responseContent');
        if (!responseContent) return;

        // Create response item
        const responseItem = document.createElement('div');
        responseItem.className = `response-item ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        const commandName = this.getCommandDisplayName(command);

        let resultText;
        if (typeof result === "object") {
            resultText = JSON.stringify(result, null, 2);
        } else {
            resultText = result.toString();
        }

        responseItem.innerHTML = `
            <div class="response-timestamp">${timestamp}</div>
            <div class="response-command">${commandName}</div>
            <div class="response-data">${this.escapeHtml(resultText)}</div>
        `;

        // Clear "no response" message if it exists
        const noResponse = responseContent.querySelector('.no-response');
        if (noResponse) {
            noResponse.remove();
        }

        // Add new response at the top
        responseContent.insertBefore(responseItem, responseContent.firstChild);

        // Limit to last 10 responses
        const allResponses = responseContent.querySelectorAll('.response-item');
        if (allResponses.length > 10) {
            allResponses[allResponses.length - 1].remove();
        }
    }

    getCommandDisplayName(command) {
        const commandNames = {
            play: "▶️ Play Timeline",
            pause: "⏸️ Pause Timeline", 
            stop: "⏹️ Stop Timeline",
            status: "📊 Get Status",
            timelines: "📑 Get Timelines",
            show: "💾 Save Show",
            uploadShow: "📤 Upload Show",
            testConnection: "🔗 Test Connection",
            custom: "⚙️ Custom Command",
        };
        return commandNames[command] || command;
    }setCommandButtonLoading(commandType, loading) {
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
            const icon = button.querySelector('.cmd-icon');

            if (icon) {
                if (loading) {
                    if (!button.dataset.originalIconHtml) {
                        button.dataset.originalIconHtml = icon.innerHTML;
                    }
                    icon.innerHTML = '⏳';
                } else if (button.dataset.originalIconHtml) {
                    icon.innerHTML = button.dataset.originalIconHtml;
                    delete button.dataset.originalIconHtml;
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
    }    clearCommandResponse() {
        const responseContent = document.getElementById('commandResponse') || document.getElementById('responseContent');
        if (responseContent) {
            responseContent.innerHTML = '<div class="no-response">No commands executed yet</div>';
        }
        
        // Hide status information area when clearing responses
        this.hideStatusInformation();
    }    // Add Server Modal Methods
    showAddServerDialog() {
        const modal = document.getElementById('addServerModal');
        modal.style.display = 'flex';
        
        // Bind modal events
        this.bindAddServerModal();
        
        // Clear previous values (ports are now hardcoded)
        document.getElementById('serverIp').value = '';
        document.getElementById('serverName').value = '';
        document.getElementById('serverType').value = 'Manual Entry';
        
        // Focus on IP input
        setTimeout(() => {
            document.getElementById('serverIp').focus();
        }, 100);
    }

    bindAddServerModal() {
        const modal = document.getElementById('addServerModal');
        const closeBtn = document.getElementById('closeAddServerModal');
        const cancelBtn = document.getElementById('cancelAddServer');
        const saveBtn = document.getElementById('saveAddServer');
        const form = document.getElementById('addServerForm');
        
        // Close modal handlers
        const closeModal = () => {
            modal.style.display = 'none';
        };
        
        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;
        
        // Close on overlay click
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeModal();
            }
        };
          // Save server
        saveBtn.onclick = async () => {
            if (form.checkValidity()) {
                const modal = document.getElementById('addServerModal');
                const isEditing = modal.dataset.editingServerId;
                
                if (isEditing) {
                    await this.updateManualServer(isEditing);
                } else {
                    await this.addManualServer();
                }
                
                // Reset modal state
                delete modal.dataset.editingServerId;
                const modalTitle = modal.querySelector('.modal-header h3');
                modalTitle.textContent = 'Add Server Manually';
                saveBtn.textContent = 'Add Server';
                
                closeModal();
            } else {
                // Show validation errors
                form.reportValidity();
            }
        };
        
        // Add server on Enter key in IP field
        document.getElementById('serverIp').onkeydown = (e) => {
            if (e.key === 'Enter' && form.checkValidity()) {
                const modal = document.getElementById('addServerModal');
                const isEditing = modal.dataset.editingServerId;
                
                if (isEditing) {
                    this.updateManualServer(isEditing);
                } else {
                    this.addManualServer();
                }
                
                // Reset modal state
                delete modal.dataset.editingServerId;
                const modalTitle = modal.querySelector('.modal-header h3');
                modalTitle.textContent = 'Add Server Manually';
                saveBtn.textContent = 'Add Server';
                
                closeModal();
            }
        };
    }

    async addManualServer() {        try {
            const serverIp = document.getElementById('serverIp').value.trim();
            const serverName = document.getElementById('serverName').value.trim();
            const serverType = document.getElementById('serverType').value;
            
            // Validate IP address
            if (!this.isValidIpAddress(serverIp)) {
            this.showToast({ title: 'Invalid IP Address', message: 'Please enter a valid IP address (e.g., 192.168.1.100).', severity: 'warning' });
                return;
            }
            
            // Ports are now hardcoded in the backend (3040, 3041, 3042, 3022)
            // No need to parse or validate ports from user input
            
            // Create server object (ports will be set by backend)
            const manualServer = {
                ip: serverIp,
                hostname: serverName || serverIp,
                type: serverType,
                discoveryMethod: 'manual',
                status: 'online', // Manual servers are always considered online
                isManual: true, // Flag to identify manual servers
                discoveredAt: new Date().toISOString(),
                lastSeenAt: new Date().toISOString(),
                firstDiscoveredAt: new Date().toISOString()
            };
            
            // Check if server already exists
            const serverId = this.getServerId(manualServer);
            const existingServer = this.servers.find(server => this.getServerId(server) === serverId);
            
            if (existingServer) {
                // Update existing server with manual flag
                existingServer.isManual = true;
                existingServer.status = 'online';
                existingServer.type = serverType;
                existingServer.hostname = serverName || existingServer.hostname;
                this.updateScanStatus(`Updated existing server: ${serverName || serverIp}`);
            } else {
                // Add new manual server
                this.servers.push(manualServer);
                this.updateScanStatus(`Added manual server: ${serverName || serverIp}`);
            }
              // Save to backend cache (optional - manual servers persist in memory)
            try {
                await this.addManualServerToBackend(manualServer);
            } catch (error) {
                console.warn('Could not save manual server to backend:', error);
                // Continue anyway - manual servers work in memory
            }
            
            // Update UI
            this.updateUI();
            
            // Auto-select the newly added server
            this.selectedServerId = serverId;
            this.selectedServerIp = serverIp;
            
            console.log('Manual server added successfully:', manualServer);
            
        } catch (error) {
            console.error('Error adding manual server:', error);
            this.showToast({ title: 'Add Server Failed', message: 'Please check the details and try again.', severity: 'error' });
        }
    }

    isValidIpAddress(ip) {
        // Basic IP address validation
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    getServerId(server) {
        // Create a unique identifier for the server
        return `${server.ip}:${server.ports.join(',')}`;
    }    getSimplifiedServerType(server) {
        // Simplify server types for sidebar display
        if (server.type.includes('Production')) return 'Production';
        if (server.type.includes('Director')) return 'Director';
        if (server.type.includes('Display')) return 'Display';
        if (server.type.includes('Asset Manager')) return 'Asset Manager';
        if (server.type.includes('Watchout')) return 'Watchout Server';
        return 'Server';
    }    // Manual Server Management Methods (Web Version)
    editManualServer(serverId) {
        // Find the server to edit
        const server = this.servers.find(s => this.getServerId(s) === serverId);
        if (!server || !server.isManual) {
            console.error('Server not found or not a manual server:', serverId);
            return;
        }

        // Pre-fill the add server modal with existing data
        const modal = document.getElementById('addServerModal');
        modal.style.display = 'flex';

        // Fill in existing values (ports are no longer editable)
        document.getElementById('serverIp').value = server.ip;
        document.getElementById('serverName').value = server.hostname || '';
        document.getElementById('serverType').value = server.type;

        // Change modal title and button text to indicate editing
        const modalTitle = modal.querySelector('.modal-header h3');
        const saveButton = document.getElementById('saveAddServer');
        modalTitle.textContent = 'Edit Manual Server';
        saveButton.textContent = 'Update Server';

        // Store editing state
        modal.dataset.editingServerId = serverId;

        // Bind modal events
        this.bindAddServerModal();

        // Focus on IP input
        setTimeout(() => {
            document.getElementById('serverIp').focus();
        }, 100);
    }    async updateManualServer(serverId) {
        try {
            const serverIp = document.getElementById('serverIp').value.trim();
            const serverName = document.getElementById('serverName').value.trim();
            const serverType = document.getElementById('serverType').value;
            
            // Validate IP address
            if (!this.isValidIpAddress(serverIp)) {
            this.showToast({ title: 'Invalid IP Address', message: 'Please enter a valid IP address (e.g., 192.168.1.100).', severity: 'warning' });
                return;
            }
            
            // Ports are now hardcoded in the backend (3040, 3041, 3042, 3022)
            // No need to parse or validate ports from user input
            
            // Create updated server object (ports will be set by backend)
            const updatedServerData = {
                ip: serverIp,
                hostname: serverName || serverIp,
                type: serverType,
                discoveryMethod: 'manual',
                status: 'online',
                isManual: true
            };
            
            // Update server in backend
            const result = await this.apiCall(`/manual-servers/${serverId}`, {
                method: 'PUT',
                body: JSON.stringify(updatedServerData)
            });            if (result.success) {
                // Update local servers array
                const serverIndex = this.servers.findIndex(s => this.getServerId(s) === serverId);
                if (serverIndex !== -1) {
                    // Preserve existing metadata while updating with new data
                    this.servers[serverIndex] = {
                        ...this.servers[serverIndex],
                        ...updatedServerData,
                        lastSeenAt: new Date().toISOString()
                    };
                    
                    // Update selected server IP if this server is currently selected
                    if (this.selectedServerId === serverId) {
                        this.selectedServerIp = serverIp;
                    }
                }
                
                // Update UI
                this.updateUI();
                
                this.updateScanStatus(`Updated manual server: ${serverName || serverIp}`);
                console.log('Manual server updated successfully:', updatedServerData);
            } else {
                console.error('Failed to update manual server:', result.error);
                this.showToast({ title: 'Update Failed', message: String(result.error || 'Unknown error'), severity: 'error' });
            }
        } catch (error) {
            console.error('Error updating manual server:', error);
            this.showToast({ title: 'Update Failed', message: 'Please check the details and try again.', severity: 'error' });
        }
    }

    async removeManualServer(serverId) {
        // Find the server to remove
        const server = this.servers.find(s => this.getServerId(s) === serverId);
        if (!server || !server.isManual) {
            console.error('Server not found or not a manual server:', serverId);
            return;
        }

        // Confirm removal
        const serverName = server.hostname || server.ip;
        const confirmed = await this.confirmToast(`Are you sure you want to remove the manual server "${serverName}"?`, { title: 'Remove Server', okLabel: 'Remove', cancelLabel: 'Cancel', severity: 'warning' });
        if (!confirmed) return;

        try {
            // Remove from backend
            const result = await this.apiCall(`/manual-servers/${serverId}`, {
                method: 'DELETE'
            });
            
            if (result.success) {
                // Remove from local servers array
                this.servers = this.servers.filter(s => this.getServerId(s) !== serverId);
                
                // Clear selection if removed server was selected
                if (this.selectedServerId === serverId) {
                    this.selectedServerId = null;
                    this.selectedServerIp = null;
                }
                
                // Update UI
                this.updateUI();
                
                this.updateScanStatus(`Removed manual server: ${serverName}`);
                console.log('Manual server removed successfully:', serverName);            } else {
                console.error('Failed to remove manual server:', result.error);
                this.showToast({ title: 'Remove Failed', message: String(result.error || 'Unknown error'), severity: 'error' });
            }
        } catch (error) {
            console.error('Error removing manual server:', error);
            this.showToast({ title: 'Remove Failed', message: 'Failed to remove server. Please try again.', severity: 'error' });
        }
    }    // Add ripple effect animation to buttons (no-op to remove visual effect)
    addRippleEffect(button) {
        // This method intentionally does nothing to remove the ripple effect
        // while keeping the function signature intact for compatibility
    }renderStatusVisualization(statusData) {
        if (!statusData || !statusData.data) return null;

        const data = statusData.data;
        const timelinesReference = statusData.timelinesReference;
        
        // Create status visualization container
        const statusContainer = document.createElement("div");
        statusContainer.className = "status-visualization";

        // Title
        const title = document.createElement("h4");
        title.className = "status-title";
        title.textContent = "Server Status";
        statusContainer.appendChild(title);

        // Create sections for different status information
        const sectionsContainer = document.createElement("div");
        sectionsContainer.className = "status-sections";

        // Timeline Status Section
        const timelineSection = this.createTimelineStatusSection(data, timelinesReference);
        if (timelineSection) {
            sectionsContainer.appendChild(timelineSection);
        }

        // Renderer Status Section
        const rendererSection = this.createRendererStatusSection(data);
        if (rendererSection) {
            sectionsContainer.appendChild(rendererSection);
        }

        // General Status Section
        const generalSection = this.createGeneralStatusSection(data);
        if (generalSection) {
            sectionsContainer.appendChild(generalSection);
        }

        statusContainer.appendChild(sectionsContainer);

        // Add raw data toggle
        const rawDataToggle = this.createRawDataToggle(statusData);
        statusContainer.appendChild(rawDataToggle);

        return statusContainer;
    }    createTimelineStatusSection(data, timelinesReference) {
        const section = document.createElement("div");
        section.className = "status-section timeline-status-section";

        const header = document.createElement("h5");
        header.className = "status-section-header";
        header.innerHTML = "🎬 Timeline Status";
        section.appendChild(header);

        const content = document.createElement("div");
        content.className = "status-section-content";

        // Handle timeline data according to the Watchout structure:
        // - Missing from array = stopped
        // - Present with running: false = paused  
        // - Present with running: true = playing
        
        let timelineStatuses = [];
        let allTimelineIds = new Set();
        
        // Get timeline names from reference if available
        const timelineNames = new Map();
        if (timelinesReference && Array.isArray(timelinesReference)) {
            timelinesReference.forEach(timeline => {
                if (timeline.id !== undefined) {
                    timelineNames.set(String(timeline.id), timeline.name || `Timeline ${timeline.id}`);
                    allTimelineIds.add(String(timeline.id));
                }
            });
        }

        if (data.timelines && Array.isArray(data.timelines)) {
            // Process active timelines from status response
            data.timelines.forEach(timeline => {
                const id = String(timeline.id);
                const name = timelineNames.get(id) || `Timeline ${id}`;
                allTimelineIds.add(id);
                
                let state, displayState;
                if (timeline.running === true) {
                    state = 'playing';
                    displayState = '▶ Playing';
                } else {
                    state = 'paused';
                    displayState = '⏸ Paused';
                }

                let positionText = "";
                if (timeline.timelineTime !== undefined) {
                    const seconds = Math.floor(timeline.timelineTime / 1000);
                    const minutes = Math.floor(seconds / 60);
                    const remainingSeconds = seconds % 60;
                    positionText = ` - ${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
                }

                timelineStatuses.push({
                    id,
                    name,
                    state,
                    displayState: displayState + positionText,
                    running: timeline.running
                });
            });

            // Add stopped timelines (those not in the status response)
            allTimelineIds.forEach(id => {
                const existsInStatus = data.timelines.some(t => String(t.id) === id);
                if (!existsInStatus) {
                    const name = timelineNames.get(id) || `Timeline ${id}`;
                    timelineStatuses.push({
                        id,
                        name,
                        state: 'stopped',
                        displayState: '⏹ Stopped',
                        running: false
                    });
                }
            });
        } else if (allTimelineIds.size > 0) {
            // No timeline status data, but we have timeline references - assume all stopped
            allTimelineIds.forEach(id => {
                const name = timelineNames.get(id) || `Timeline ${id}`;
                timelineStatuses.push({
                    id,
                    name,
                    state: 'stopped',
                    displayState: '⏹ Stopped',
                    running: false
                });
            });
        }

        if (timelineStatuses.length > 0) {
            // Sort timelines: playing first, then paused, then stopped
            timelineStatuses.sort((a, b) => {
                const order = { playing: 0, paused: 1, stopped: 2 };
                return order[a.state] - order[b.state];
            });

            timelineStatuses.forEach(timeline => {
                const timelineItem = document.createElement("div");
                timelineItem.className = `timeline-item ${timeline.state}`;

                timelineItem.innerHTML = `
                    <div class="timeline-indicator ${timeline.state}"></div>
                    <div class="timeline-info">
                        <span class="timeline-name">${this.escapeHtml(timeline.name)}</span>
                        <span class="timeline-state">${timeline.displayState}</span>
                    </div>
                `;
                content.appendChild(timelineItem);
            });
        } else {
            const noDataItem = document.createElement("div");
            noDataItem.className = "status-info";
            noDataItem.textContent = "Timeline status information not available";
            content.appendChild(noDataItem);
        }

        section.appendChild(content);
        return section;
    }    createRendererStatusSection(data) {
        const section = document.createElement("div");
        section.className = "status-section renderer-status-section";

        const header = document.createElement("h5");
        header.className = "status-section-header";
        header.innerHTML = "🖥️ Renderer Status";
        section.appendChild(header);

        const content = document.createElement("div");
        content.className = "status-section-content";

        let freeRunningCount = 0;
        let hasRendererData = false;

        // Extract free running renderer count from freeRunningRenders object
        if (data.freeRunningRenders && typeof data.freeRunningRenders === 'object') {
            hasRendererData = true;
            freeRunningCount = Object.keys(data.freeRunningRenders).length;
        } else if (data.freeRunningRenderers !== undefined) {
            hasRendererData = true;
            freeRunningCount = data.freeRunningRenderers;
        } else if (data.renderers) {
            hasRendererData = true;
            if (Array.isArray(data.renderers)) {
                freeRunningCount = data.renderers.filter(r => r.freeRunning === true || r.state === 'free_running').length;
            } else if (typeof data.renderers === 'object') {
                freeRunningCount = Object.values(data.renderers).filter(r => r.freeRunning === true || r.state === 'free_running').length;
            }
        }

        if (hasRendererData) {
            const rendererSummary = document.createElement("div");
            rendererSummary.className = "renderer-summary";

            const freeRunningItem = document.createElement("div");
            freeRunningItem.className = "renderer-item";
            freeRunningItem.innerHTML = `
                <div class="renderer-indicator ${freeRunningCount > 0 ? 'active' : 'inactive'}"></div>
                <div class="renderer-info">
                    <span class="renderer-count">${freeRunningCount}</span>
                    <span class="renderer-label">Free Running Renderer${freeRunningCount !== 1 ? 's' : ''}</span>
                </div>
            `;
            rendererSummary.appendChild(freeRunningItem);

            content.appendChild(rendererSummary);
        } else {
            const noDataItem = document.createElement("div");
            noDataItem.className = "status-info";
            noDataItem.textContent = "Renderer status information not available";
            content.appendChild(noDataItem);
        }

        section.appendChild(content);
        return section;
    }

    createGeneralStatusSection(data) {
        const section = document.createElement("div");
        section.className = "status-section general-status-section";

        const header = document.createElement("h5");
        header.className = "status-section-header";
        header.innerHTML = "ℹ️ General Status";
        section.appendChild(header);

        const content = document.createElement("div");
        content.className = "status-section-content";

        const generalInfo = document.createElement("div");
        generalInfo.className = "general-info";

        // Show overall state if available
        if (data.state) {
            const stateItem = document.createElement("div");
            stateItem.className = "general-item";
            stateItem.innerHTML = `
                <span class="general-label">State:</span>
                <span class="general-value state-${data.state.toLowerCase()}">${data.state}</span>
            `;
            generalInfo.appendChild(stateItem);
        }

        // Show time information if available
        if (data.time !== undefined || data.position !== undefined) {
            const time = data.time || data.position;
            const seconds = Math.floor(time / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            const timeStr = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

            const timeItem = document.createElement("div");
            timeItem.className = "general-item";
            timeItem.innerHTML = `
                <span class="general-label">Position:</span>
                <span class="general-value">${timeStr}</span>
            `;
            generalInfo.appendChild(timeItem);
        }

        // Show any other relevant information
        ['version', 'showName', 'currentShow'].forEach(field => {
            if (data[field] !== undefined) {
                const item = document.createElement("div");
                item.className = "general-item";
                item.innerHTML = `
                    <span class="general-label">${field.charAt(0).toUpperCase() + field.slice(1)}:</span>
                    <span class="general-value">${this.escapeHtml(String(data[field]))}</span>
                `;
                generalInfo.appendChild(item);
            }
        });

        content.appendChild(generalInfo);
        section.appendChild(content);
        return section;
    }

    createRawDataToggle(statusData) {
        const toggleContainer = document.createElement("div");
        toggleContainer.className = "raw-data-toggle";

        const toggleButton = document.createElement("button");
        toggleButton.className = "toggle-raw-data-btn";
        toggleButton.textContent = "Show Raw Data";
        toggleButton.onclick = () => {
            const rawDataDiv = toggleContainer.querySelector('.raw-data-content');
            if (rawDataDiv.style.display === 'none') {
                rawDataDiv.style.display = 'block';
                toggleButton.textContent = "Hide Raw Data";
            } else {
                rawDataDiv.style.display = 'none';
                toggleButton.textContent = "Show Raw Data";
            }
        };

        const rawDataContent = document.createElement("div");
        rawDataContent.className = "raw-data-content";
        rawDataContent.style.display = "none";
        rawDataContent.innerHTML = `<pre>${this.escapeHtml(JSON.stringify(statusData, null, 2))}</pre>`;

        toggleContainer.appendChild(toggleButton);
        toggleContainer.appendChild(rawDataContent);

        return toggleContainer;
    }    updateServerDetailsWithStatus(statusResult) {
        if (!this.selectedServerId || !statusResult.success || !statusResult.data) {
            return;
        }

        // Find the status information area in the commands panel
        const statusInformationArea = document.getElementById('statusInformationArea');
        const statusContent = document.getElementById('statusContent');
        
        if (!statusInformationArea || !statusContent) {
            return;
        }

        // Show the status information area
        // Show; animate only the first time
        statusInformationArea.style.display = 'block';
        if (!statusInformationArea.dataset.animPlayed) {
            statusInformationArea.classList.add('roll-in');
            statusInformationArea.dataset.animPlayed = '1';
            setTimeout(() => { try { statusInformationArea.classList.remove('roll-in'); } catch {} }, 600);
        }

        // Generate the status visualization
        const statusVisualization = this.renderStatusVisualization(statusResult);
        
        if (statusVisualization) {
            // Clear existing content and add new visualization
            statusContent.innerHTML = '';
            statusContent.appendChild(statusVisualization);        }
    }

    hideStatusInformation() {
        const statusInformationArea = document.getElementById('statusInformationArea');
        if (statusInformationArea) {
            statusInformationArea.style.display = 'none';
        }
    }

    // ==================== LOKI LOG VIEWER METHODS ====================
    
    showLokiLogViewer() {
        if (!this.selectedServerIp) {
            this.showToast({ title: 'No Server Selected', message: 'Select a server first.', severity: 'info' });
            return;
        }

        // Create modal for log viewer
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content log-viewer-modal">
                <div class="modal-header">
                    <h3>🗂️ Real-time Log Viewer - ${this.selectedServerIp}:3022</h3>
                    <button class="modal-close" id="closeLogViewerModal">×</button>
                </div>
                <div class="modal-body">
                    <div class="log-controls">
                        <div class="control-group">
                            <label for="logQuery">Log Query:</label>
                            <select id="logQuerySelect">
                                <option value="">Select a common query...</option>
                            </select>
                            <input type="text" id="logQuery" placeholder='{app=~".+"}' value='{app=~".+"}'>
                        </div>
                        <div class="control-group">
                            <label for="logLimit">Limit:</label>
                            <input type="number" id="logLimit" value="100" min="10" max="1000">
                        </div>
                        <div class="control-group">
                            <label for="logSince">Since:</label>
                            <select id="logSince">
                                <option value="5m">5 minutes</option>
                                <option value="15m">15 minutes</option>
                                <option value="1h" selected>1 hour</option>
                                <option value="3h">3 hours</option>
                                <option value="6h">6 hours</option>
                                <option value="12h">12 hours</option>
                                <option value="24h">24 hours</option>
                            </select>
                        </div>
                        <div class="control-group">
                            <button id="testLokiBtn" class="btn btn-secondary">Test Connection</button>
                            <button id="queryLogsBtn" class="btn btn-primary">Query Logs</button>
                            <button id="startStreamBtn" class="btn btn-success">Start Stream</button>
                            <button id="stopStreamBtn" class="btn btn-danger" disabled>Stop Stream</button>
                        </div>
                    </div>
                    
                    <div class="log-status">
                        <div id="lokiConnectionStatus" class="connection-status unknown">
                            <div class="status-indicator"></div>
                            <span class="status-text">Connection Status: Unknown</span>
                        </div>
                        <div id="logStreamStatus" class="stream-status">
                            <span class="stream-indicator">⚫</span>
                            <span class="stream-text">Stream: Stopped</span>
                        </div>
                    </div>

                    <div class="log-viewer">
                        <div class="log-header">
                            <div class="log-stats">
                                <span id="logCount">0 logs</span>
                                <span id="logTimeRange"></span>
                            </div>
                            <div class="log-actions">
                                <button id="clearLogsBtn" class="btn btn-sm btn-secondary">Clear</button>
                                <button id="exportLogsBtn" class="btn btn-sm btn-primary">Export</button>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="autoScrollLogs" checked>
                                    Auto-scroll
                                </label>
                            </div>
                        </div>
                        <div id="logContainer" class="log-container">
                            <div class="log-placeholder">
                                No logs to display. Click "Query Logs" or "Start Stream" to begin.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        // Show and wire overlay close
        modal.style.display = 'flex';
        modal.classList.add('show');
        const overlayEl = modal.querySelector('.modal-overlay');
        if (overlayEl) overlayEl.addEventListener('click', () => modal.remove());
        this.setupLokiLogViewer();
    }

    async setupLokiLogViewer() {
        // Load common queries
        try {
            const queriesResult = await this.lokiGetCommonQueries();
            if (queriesResult.success) {
                const select = document.getElementById('logQuerySelect');
                queriesResult.data.forEach(query => {
                    const option = document.createElement('option');
                    option.value = query.query;
                    option.textContent = `${query.name} - ${query.description}`;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.warn('Failed to load common queries:', error);
        }

        // Bind events
        document.getElementById('logQuerySelect').addEventListener('change', (e) => {
            if (e.target.value) {
                document.getElementById('logQuery').value = e.target.value;
            }
        });

        document.getElementById('testLokiBtn').addEventListener('click', () => this.testLokiConnection());
        document.getElementById('queryLogsBtn').addEventListener('click', () => this.queryLokiLogs());
        document.getElementById('startStreamBtn').addEventListener('click', () => this.startLokiStream());
        document.getElementById('stopStreamBtn').addEventListener('click', () => this.stopLokiStream());
        document.getElementById('clearLogsBtn').addEventListener('click', () => this.clearLogViewer());
        document.getElementById('exportLogsBtn').addEventListener('click', () => this.exportLogs());

        // Test connection automatically
        this.testLokiConnection();
    }    async testLokiConnection() {
        const statusElement = document.getElementById('lokiConnectionStatus');
        const statusText = statusElement.querySelector('.status-text');
        
        statusText.textContent = `Testing connection to ${this.selectedServerIp}:3022...`;
        statusElement.className = 'connection-status testing';

        try {
            const result = await this.lokiTestConnection(this.selectedServerIp);
            
            if (result.success && result.connected) {
                statusElement.className = 'connection-status connected';
                statusText.textContent = `Connected: ${result.message}`;
            } else {
                statusElement.className = 'connection-status error';
                
                // Provide more specific guidance based on the error
                let errorMsg = result.message || 'Connection failed';
                let suggestion = '';
                
                if (errorMsg.includes('Connection failed') || errorMsg.includes('ECONNREFUSED')) {
                    suggestion = ' • Check if Loki is running on this server';
                } else if (errorMsg.includes('timeout')) {
                    suggestion = ' • Server may be running but port 3022 is not accessible';
                } else if (errorMsg.includes('host not found')) {
                    suggestion = ' • Verify the server IP address is correct';
                } else if (errorMsg.includes('network unreachable')) {
                    suggestion = ' • Check network connectivity to the server';
                }
                
                statusText.textContent = `Error: ${errorMsg}${suggestion}`;
            }
        } catch (error) {
            statusElement.className = 'connection-status error';
            statusText.textContent = `Error: ${error.message}`;
        }
    }async queryLokiLogs() {
        const query = document.getElementById('logQuery').value || '{app=~".+"}';
        const limit = parseInt(document.getElementById('logLimit').value) || 100;
        const since = document.getElementById('logSince').value || '1h';

        const queryBtn = document.getElementById('queryLogsBtn');
        queryBtn.disabled = true;
        queryBtn.textContent = 'Querying...';

        try {
            const result = await this.lokiQueryLogs(this.selectedServerIp, query, limit, since);
            
            if (result.success) {
                this.displayLogs(result.data);
            } else {
                this.displayLogError(result.error);
            }
        } catch (error) {
            this.displayLogError(error.message);
        } finally {
            queryBtn.disabled = false;
            queryBtn.textContent = 'Query Logs';
        }
    }    async startLokiStream() {
        const query = document.getElementById('logQuery').value || '{app=~".+"}';
        const refreshInterval = 2000; // 2 seconds

        const startBtn = document.getElementById('startStreamBtn');
        const stopBtn = document.getElementById('stopStreamBtn');
        
        startBtn.disabled = true;
        startBtn.textContent = 'Starting...';

        try {
            const result = await this.lokiStartStream(this.selectedServerIp, query, refreshInterval);
            
            if (result.success) {
                this.updateStreamStatus(true);
                startBtn.disabled = true;
                stopBtn.disabled = false;
                
                // Start polling for logs in web version (since we don't have WebSocket)
                this.startLogPolling(query, refreshInterval);
            } else {
                this.displayLogError(result.error);
                startBtn.disabled = false;
            }
        } catch (error) {
            this.displayLogError(error.message);
            startBtn.disabled = false;
        } finally {
            startBtn.textContent = 'Start Stream';
        }
    }

    startLogPolling(query, refreshInterval) {
        if (this.logPollingInterval) {
            clearInterval(this.logPollingInterval);
        }

        this.logPollingInterval = setInterval(async () => {
            try {
                const result = await this.lokiQueryLogs(this.selectedServerIp, query, 20, '30s');
                if (result.success && result.data.length > 0) {
                    this.displayLogs(result.data);
                }
            } catch (error) {
                console.warn('Log polling error:', error);
            }
        }, refreshInterval);
    }

    async stopLokiStream() {
        const startBtn = document.getElementById('startStreamBtn');
        const stopBtn = document.getElementById('stopStreamBtn');
        
        stopBtn.disabled = true;
        stopBtn.textContent = 'Stopping...';

        try {
            const result = await this.lokiStopStream(this.selectedServerIp);
            
            if (result.success) {
                this.updateStreamStatus(false);
                startBtn.disabled = false;
                stopBtn.disabled = true;
                
                // Stop polling
                if (this.logPollingInterval) {
                    clearInterval(this.logPollingInterval);
                    this.logPollingInterval = null;
                }
            }
        } catch (error) {
            this.displayLogError(error.message);
        } finally {
            stopBtn.textContent = 'Stop Stream';
        }
    }

    updateStreamStatus(isStreaming) {
        const statusElement = document.getElementById('logStreamStatus');
        const indicator = statusElement.querySelector('.stream-indicator');
        const text = statusElement.querySelector('.stream-text');
        
        if (isStreaming) {
            indicator.textContent = '🔴';
            text.textContent = 'Stream: Live';
            statusElement.className = 'stream-status streaming';
        } else {
            indicator.textContent = '⚫';
            text.textContent = 'Stream: Stopped';
            statusElement.className = 'stream-status stopped';
        }
    }

    displayLogs(logs) {
        const container = document.getElementById('logContainer');
        const autoScroll = document.getElementById('autoScrollLogs').checked;
        
        // Remove placeholder if it exists
        const placeholder = container.querySelector('.log-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        // Add new logs
        logs.forEach(log => {
            const logElement = document.createElement('div');
            logElement.className = `log-entry log-${log.level}`;
            
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const labels = Object.entries(log.labels || {})
                .map(([key, value]) => `${key}="${value}"`)
                .join(' ');
            
            logElement.innerHTML = `
                <div class="log-timestamp">${timestamp}</div>
                <div class="log-level log-level-${log.level}">${log.level.toUpperCase()}</div>
                <div class="log-source">${log.source}</div>
                <div class="log-message">${this.escapeHtml(log.message)}</div>
                ${labels ? `<div class="log-labels">${labels}</div>` : ''}
            `;
            
            container.appendChild(logElement);
        });

        // Limit the number of displayed logs to prevent memory issues
        const maxLogs = 1000;
        const logEntries = container.querySelectorAll('.log-entry');
        if (logEntries.length > maxLogs) {
            for (let i = 0; i < logEntries.length - maxLogs; i++) {
                logEntries[i].remove();
            }
        }

        // Update stats
        this.updateLogStats();

        // Auto-scroll to bottom
        if (autoScroll) {
            container.scrollTop = container.scrollHeight;
        }
    }

    displayLogError(error) {
        const container = document.getElementById('logContainer');
        const errorElement = document.createElement('div');
        errorElement.className = 'log-entry log-error';
        errorElement.innerHTML = `
            <div class="log-timestamp">${new Date().toLocaleTimeString()}</div>
            <div class="log-level log-level-error">ERROR</div>
            <div class="log-source">SYSTEM</div>
            <div class="log-message">Log Error: ${this.escapeHtml(error)}</div>
        `;
        container.appendChild(errorElement);
        
        this.updateLogStats();
    }

    updateLogStats() {
        const container = document.getElementById('logContainer');
        const logEntries = container.querySelectorAll('.log-entry:not(.log-error)');
        const countElement = document.getElementById('logCount');
        
        countElement.textContent = `${logEntries.length} logs`;
        
        // Update time range if we have logs
        if (logEntries.length > 0) {
            const firstTimestamp = logEntries[0].querySelector('.log-timestamp').textContent;
            const lastTimestamp = logEntries[logEntries.length - 1].querySelector('.log-timestamp').textContent;
            
            const timeRangeElement = document.getElementById('logTimeRange');
            if (firstTimestamp !== lastTimestamp) {
                timeRangeElement.textContent = `${firstTimestamp} - ${lastTimestamp}`;
            } else {
                timeRangeElement.textContent = firstTimestamp;
            }
        }
    }

    clearLogViewer() {
        const container = document.getElementById('logContainer');
        container.innerHTML = '<div class="log-placeholder">Logs cleared. Click "Query Logs" or "Start Stream" to begin.</div>';
        this.updateLogStats();
    }

    exportLogs() {
        const container = document.getElementById('logContainer');
        const logEntries = container.querySelectorAll('.log-entry:not(.log-error)');
        
        if (logEntries.length === 0) {
            this.showToast({ title: 'No Logs', message: 'There are no logs to export yet.', severity: 'info' });
            return;
        }

        const logs = Array.from(logEntries).map(entry => {
            const timestamp = entry.querySelector('.log-timestamp').textContent;
            const level = entry.querySelector('.log-level').textContent;
            const source = entry.querySelector('.log-source').textContent;
            const message = entry.querySelector('.log-message').textContent;
            const labels = entry.querySelector('.log-labels')?.textContent || '';
            
            return {
                timestamp,
                level,
                source,
                message,
                labels
            };
        });

        const jsonContent = JSON.stringify(logs, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `watchout-logs-${this.selectedServerIp}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize the web app when DOM is loaded
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.watchoutApp = new WatchoutServerFinderWebApp();
    });
}

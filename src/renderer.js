class WatchoutServerFinderApp {    constructor() {
        this.servers = [];
        this.isScanning = false;
        this.scanInterval = null;
        this.backgroundScanEnabled = true;
        this.scanIntervalMs = 30000; // 30 seconds
        this.selectedServerId = null; // Track selected server
        this.selectedServerIp = null; // Track selected server IP for commands
        this.apiConnectionStatus = false; // Track API connection status
        this.serverCommandStates = new Map(); // Track command state per server
        this.availableTimelines = []; // Store available timelines for current server
        
        // Initialize API adapter for cross-platform compatibility
        this.api = new ApiAdapter();
        
        this.initializeApp();
    }async initializeApp() {
        this.bindEvents();
        await this.loadAppVersion();
        
        // Initialize startup warning listeners
        this.initializeStartupWarnings();
        
        // Ensure footer visibility after DOM is loaded
        setTimeout(() => {
            this.ensureFooterVisibility();
        }, 100);
        
        this.updateUI();
        this.startBackgroundScanning();
    }    bindEvents() {
        const scanButton = document.getElementById('scanButton');
        scanButton.addEventListener('click', () => this.startManualScan());
        
        const clearOfflineButton = document.getElementById('clearOfflineButton');
        clearOfflineButton.addEventListener('click', () => this.clearOfflineServers());
        
        // Settings button event
        const settingsButton = document.getElementById('settingsButton');
        settingsButton.addEventListener('click', () => this.showSettingsDialog());
        
        // Command button events (no more tab events needed)
        this.bindCommandEvents();
    }bindCommandEvents() {
        // Timeline control commands
        document.getElementById('playBtn')?.addEventListener('click', () => this.executeCommand('play'));
        document.getElementById('pauseBtn')?.addEventListener('click', () => this.executeCommand('pause'));
        document.getElementById('stopBtn')?.addEventListener('click', () => this.executeCommand('stop'));
        
        // Information commands
        document.getElementById('statusBtn')?.addEventListener('click', () => this.executeCommand('status'));
        document.getElementById('timelinesBtn')?.addEventListener('click', () => this.executeCommand('timelines'));
        document.getElementById('showBtn')?.addEventListener('click', () => this.executeCommand('show'));
        
        // Advanced commands
        document.getElementById('testConnectionBtn')?.addEventListener('click', () => this.executeCommand('testConnection'));
        document.getElementById('customCommandBtn')?.addEventListener('click', () => this.showCustomCommandDialog());
        
        // Timeline selector change event
        document.getElementById('timelineSelector')?.addEventListener('change', () => this.onTimelineSelectionChange());
        
        // Response area
        document.getElementById('clearResponseBtn')?.addEventListener('click', () => this.clearCommandResponse());
    }

    startBackgroundScanning() {
        console.log('Starting background scanning every', this.scanIntervalMs / 1000, 'seconds');
        
        // Perform initial scan
        this.performBackgroundScan();
        
        // Set up interval for background scanning
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
        
        try {
            const result = await this.api.scanForWatchoutServers();
            
            if (result.success) {
                const previousCount = this.servers.length;
                this.servers = result.servers;
                
                // Only update status if servers were found or count changed
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
    }    async startManualScan() {
        if (this.isScanning) return;

        // Temporarily disable background scanning during manual scan
        const wasBackgroundEnabled = this.backgroundScanEnabled;
        this.backgroundScanEnabled = false;

        this.isScanning = true;
        this.updateScanButton();
        this.updateScanStatus('Manual scan: Scanning network for Watchout servers...');
        
        try {
            const result = await this.api.scanForWatchoutServers();
            
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
    }    async loadAppVersion() {
        try {
            const version = await this.api.getAppVersion();
            document.getElementById('appVersion').textContent = version;
        } catch (error) {
            console.error('Failed to load app version:', error);
        }
    }updateScanButton() {
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
        document.getElementById('scanStatus').textContent = message;
    }    updateUI() {
        this.updateServerCounts();
        this.updateClearOfflineButtonState();
        this.renderSidebar();
        this.renderMainContent();
    }    updateServerCounts() {
        const count = this.servers.length;
        
        // Update sidebar server count
        const serverCountSidebar = document.getElementById('serverCountSidebar');
        serverCountSidebar.textContent = count.toString();
    }

    updateClearOfflineButtonState() {
        const clearOfflineButton = document.getElementById('clearOfflineButton');
        const hasOfflineServers = this.servers.some(server => server.status === 'offline');
        
        if (clearOfflineButton) {
            clearOfflineButton.disabled = !hasOfflineServers;
            clearOfflineButton.style.opacity = hasOfflineServers ? '1' : '0.5';
        }
    }    async clearOfflineServers() {
        try {
            const result = await this.api.clearOfflineServers();
            
            if (result.success) {
                // Update the servers list to remove offline servers
                this.servers = this.servers.filter(server => server.status !== 'offline');
                
                // Clear selection if selected server was offline
                if (this.selectedServerId) {
                    const selectedServer = this.servers.find(server => this.getServerId(server) === this.selectedServerId);
                    if (!selectedServer) {
                        this.selectedServerId = null;
                        this.selectedServerIp = null;
                    }
                }
                
                // Update UI
                this.updateUI();
                
                // Show success message
                this.updateScanStatus(`Cleared ${result.removedCount || 0} offline server(s) from cache.`);
                console.log(`Cleared ${result.removedCount || 0} offline servers from cache`);
            } else {
                this.updateScanStatus('Failed to clear offline servers: ' + result.error);
                console.error('Failed to clear offline servers:', result.error);
            }
        } catch (error) {
            this.updateScanStatus('Error clearing offline servers');
            console.error('Error clearing offline servers:', error);
        }
    }    renderSidebar() {
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
        });        // Add divider if there are both online and offline servers
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
        
        // Test API connection for auto-selected server (prefer online servers)
        if (autoSelected && this.selectedServerIp && onlineServers.length > 0) {
            setTimeout(() => this.testApiConnection(), 100);
        }
    }renderMainContent() {
        const container = document.getElementById('serversContainer');
        const noServers = document.getElementById('noServers');
        const noSelection = document.getElementById('noSelection');

        // Remove any existing server cards
        const existingCards = container.querySelectorAll('.server-card');
        existingCards.forEach(card => card.remove());

        if (this.servers.length === 0) {
            noServers.style.display = 'flex';
            noSelection.style.display = 'none';
            this.updateCommandsVisibility();
            return;
        }

        noServers.style.display = 'none';

        if (!this.selectedServerId) {
            noSelection.style.display = 'flex';
            this.updateCommandsVisibility();
            return;
        }

        noSelection.style.display = 'none';

        // Find and render the selected server
        const selectedServer = this.servers.find(server => this.getServerId(server) === this.selectedServerId);
        if (selectedServer) {
            const serverCard = this.createServerCard(selectedServer);
            container.appendChild(serverCard);
        }
        
        // Update commands visibility
        this.updateCommandsVisibility();
    }createServerCard(server) {
        const card = document.createElement('div');
        card.className = 'server-card';

        const discoveredTime = new Date(server.discoveredAt).toLocaleTimeString();
        
        // Use hostRef as the primary name, fallback to hostname or IP
        const serverName = server.hostRef || server.hostname || server.ip || 'Unknown Server';
        if (serverName.length > 30) {
            // Truncate long names
            serverName = serverName.substring(0, 27) + '...';
        }

        // Build detailed info based on server data
        let detailsHtml = this.buildBasicDetails(server);
        
        // Add Watchout-specific details if available (from JSON response)
        if (server.hostRef || server.machineId || server.services) {
            detailsHtml += this.buildWatchoutDetails(server);
        }        card.innerHTML = `
            <div class="server-header">
                <div>
                    <div class="server-title">${this.escapeHtml(serverName)}</div>
                    <div style="font-size: 0.9rem; color: #666;">
                        ${server.status === 'online' ? 
                            `Discovered at ${discoveredTime}` : 
                            `Last seen: ${new Date(server.lastSeenAt).toLocaleTimeString()}`
                        }
                    </div>
                </div>
                <div class="server-type">${this.escapeHtml(server.type)}</div>
            </div>
            
            <div class="server-details">
                ${detailsHtml}
            </div>
        `;

        return card;
    }    buildBasicDetails(server) {
        let html = `
            <div class="detail-item">
                <span class="detail-label">IP Address:</span>
                <span class="detail-value">${this.escapeHtml(server.ip)}</span>
            </div>
        `;

        // Show status information
        if (server.status === 'offline' && server.offlineSince) {
            html += `
            <div class="detail-item">
                <span class="detail-label">Offline Since:</span>
                <span class="detail-value offline-time">${new Date(server.offlineSince).toLocaleString()}</span>
            </div>
            `;
        }

        // Show first discovery time for cached servers
        if (server.firstDiscoveredAt && server.firstDiscoveredAt !== server.discoveredAt) {
            html += `
            <div class="detail-item">
                <span class="detail-label">First Seen:</span>
                <span class="detail-value">${new Date(server.firstDiscoveredAt).toLocaleString()}</span>
            </div>
            `;
        }

        // Show hostname if different from IP and no hostRef
        if (server.hostname && server.hostname !== server.ip && !server.hostRef) {
            html += `
            <div class="detail-item">
                <span class="detail-label">Hostname:</span>
                <span class="detail-value">${this.escapeHtml(server.hostname)}</span>
            </div>
            `;
        }

        return html;
    }

    buildWatchoutDetails(server) {
        let html = '<div class="watchout-details-separator"></div>';
        
        // Version information
        if (server.version) {
            html += `
            <div class="detail-item">
                <span class="detail-label">Version:</span>
                <span class="detail-value">${this.escapeHtml(server.version)}</span>
            </div>
            `;
        }

        // Machine ID
        if (server.machineId) {
            html += `
            <div class="detail-item">
                <span class="detail-label">Machine ID:</span>
                <span class="detail-value machine-id">${this.escapeHtml(server.machineId)}</span>
            </div>
            `;
        }

        // Services
        if (server.services && server.services.length > 0) {
            html += `
            <div class="detail-item">
                <span class="detail-label">Services:</span>
                <div class="services-list">
                    ${server.services.map(service => 
                        `<span class="service-badge">${this.escapeHtml(service)}</span>`
                    ).join('')}
                </div>
            </div>
            `;
        }        // Show information
        if (server.dirShow) {
            const showName = typeof server.dirShow === 'string' ? 
                server.dirShow.replace('.watch', '').replace(/^[^_]*_/, '') : // Remove UUID prefix and .watch extension
                (server.dirShow.name || 'Unnamed Show');
            
            html += `
            <div class="detail-item">
                <span class="detail-label">Director Show:</span>
                <span class="detail-value">${this.escapeHtml(showName)}</span>
            </div>
            `;
        }

        if (server.runShow) {
            const runShowName = typeof server.runShow === 'string' ? 
                server.runShow.replace('.watch', '').replace(/^[^_]*_/, '') : 
                (server.runShow.name || 'Unnamed Show');
            
            html += `
            <div class="detail-item">
                <span class="detail-label">Running Show:</span>
                <span class="detail-value">${this.escapeHtml(runShowName)}</span>
            </div>
            `;
        }

        // Capabilities
        if (server.capabilities) {
            const capabilities = [];
            if (server.capabilities.wo7) capabilities.push('WO7');
            if (server.capabilities.wo6) capabilities.push('WO6');
            if (server.capabilities.artnet) capabilities.push('Art-Net');
            if (server.capabilities.osc) capabilities.push('OSC');
            if (server.capabilities.webui) capabilities.push('Web UI');
            
            if (capabilities.length > 0) {
                html += `
                <div class="detail-item">
                    <span class="detail-label">Capabilities:</span>
                    <div class="capabilities-list">
                        ${capabilities.map(cap => 
                            `<span class="capability-badge">${cap}</span>`
                        ).join('')}
                    </div>
                </div>
                `;
            }
        }

        // Network interfaces
        if (server.interfaces && server.interfaces.length > 0) {
            html += `
            <div class="detail-item interfaces-item">
                <span class="detail-label">Network Interfaces:</span>
                <div class="interfaces-list">
                    ${server.interfaces.map(iface => 
                        `<div class="interface-item">
                            <span class="interface-ip">${this.escapeHtml(iface[0])}</span>
                            <span class="interface-mac">${this.escapeHtml(iface[1])}</span>
                        </div>`
                    ).join('')}
                </div>
            </div>
            `;
        }

        // License status
        if (server.licensed !== undefined) {
            html += `
            <div class="detail-item">
                <span class="detail-label">Licensed:</span>
                <span class="license-status ${server.licensed ? 'licensed' : 'unlicensed'}">
                    ${server.licensed ? '✓ Licensed' : '✗ Unlicensed'}
                </span>
            </div>
            `;
        }

        // Time sync
        if (server.woTime !== undefined) {
            html += `
            <div class="detail-item">
                <span class="detail-label">Time Sync:</span>
                <span class="detail-value">${server.woTime ? 'Enabled' : 'Disabled'}</span>
            </div>
            `;
        }

        return html;
    }

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return unsafe;
        return unsafe
            .replace(/&/g, "&amp;")            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    cleanup() {
        this.stopBackgroundScanning();
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
        const statusText = isOnline ? 'Online' : 'Offline';
        
        item.innerHTML = `
            <div class="server-item-name">${this.escapeHtml(displayName)}</div>
            <div class="server-item-details">
                <div class="server-item-ip">${this.escapeHtml(server.ip)}</div>
                <div class="server-item-type">${this.escapeHtml(simplifiedType)}</div>
                <div class="server-item-status">
                    <div class="status-indicator ${isOnline ? 'online' : 'offline'}"></div>
                    <span class="status-text">${statusText}</span>
                </div>
            </div>
        `;
        
        // Add click event listener
        item.addEventListener('click', () => {
            this.selectServer(serverId);
        });
        
        return item;
    }

    getServerId(server) {
        // Create a unique identifier for the server
        return `${server.ip}:${server.ports.join(',')}`;
    }

    getSimplifiedServerType(server) {
        // Simplify server types for sidebar display
        if (server.type.includes('Production')) return 'Production';
        if (server.type.includes('Director')) return 'Director';
        if (server.type.includes('Display')) return 'Display';
        if (server.type.includes('Asset Manager')) return 'Asset Manager';
        if (server.type.includes('Watchout')) return 'Watchout Server';        return 'Server';
    }

    // Server-specific command state management
    getServerCommandState(serverId) {
        if (!this.serverCommandStates.has(serverId)) {
            this.serverCommandStates.set(serverId, {
                connectionStatus: false,
                connectionMessage: 'Not connected',
                commandHistory: [],
                lastConnectionTest: null
            });
        }
        return this.serverCommandStates.get(serverId);
    }

    updateServerCommandState(serverId, updates) {
        const state = this.getServerCommandState(serverId);
        Object.assign(state, updates);
        this.serverCommandStates.set(serverId, state);
    }

    addCommandToServerHistory(serverId, type, command, result) {
        const state = this.getServerCommandState(serverId);
        const timestamp = new Date().toLocaleTimeString();
        const commandName = this.getCommandDisplayName(command);
        
        let resultText;
        if (typeof result === 'object') {
            resultText = JSON.stringify(result, null, 2);
        } else {
            resultText = result.toString();
        }

        const responseItem = {
            type,
            command,
            commandName,
            result: resultText,
            timestamp
        };

        state.commandHistory.unshift(responseItem);
        
        // Limit to last 10 responses per server
        if (state.commandHistory.length > 10) {
            state.commandHistory.pop();
        }
        
        this.updateServerCommandState(serverId, state);
    }    selectServer(serverId) {
        // Update selected server
        const previouslySelected = this.selectedServerId;
        this.selectedServerId = serverId;
        
        // Find the selected server to get its IP
        const selectedServer = this.servers.find(server => this.getServerId(server) === serverId);
        this.selectedServerIp = selectedServer ? selectedServer.ip : null;
        
        // Reset timeline selector when switching servers
        this.resetTimelineSelector();
        
        // Update sidebar selection visual state
        const serverItems = document.querySelectorAll('.server-item');
        serverItems.forEach(item => {
            if (item.dataset.serverId === serverId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Show/hide commands area in the commands panel
        this.updateCommandsVisibility();
        
        // Load server-specific command state
        if (this.selectedServerId && this.selectedServerIp) {
            this.loadServerCommandsUI(this.selectedServerId);
        }
        
        // Re-render main content to show selected server
        this.renderMainContent();
        
        // Test API connection for the selected server
        if (this.selectedServerIp && selectedServer?.status === 'online') {
            this.testApiConnection();
        }
        
        console.log('Selected server:', serverId, 'IP:', this.selectedServerIp);
    }updateCommandsVisibility() {
        const noServerSelected = document.getElementById('noServerSelected');
        const commandsArea = document.getElementById('commandsArea');
        
        if (this.selectedServerId && this.selectedServerIp) {
            noServerSelected.style.display = 'none';
            commandsArea.style.display = 'block';
        } else {
            noServerSelected.style.display = 'flex';
            commandsArea.style.display = 'none';
        }
    }

    loadServerCommandsUI(serverId) {
        const commandState = this.getServerCommandState(serverId);
        
        // Update connection status
        this.updateConnectionStatus(commandState.connectionStatus, commandState.connectionMessage);
        
        // Update command history
        this.renderCommandHistory(commandState.commandHistory);
        
        // Update panel header to show server name
        this.updateCommandsPanelHeader(serverId);
    }    updateCommandsPanelHeader(serverId) {
        const selectedServer = this.servers.find(server => this.getServerId(server) === serverId);
        const serverName = selectedServer ? (selectedServer.hostRef || selectedServer.hostname || selectedServer.ip) : 'Unknown Server';
        
        const panelHeader = document.querySelector('#commandsPanel .panel-header h3');
        if (panelHeader) {
            panelHeader.textContent = `Commands - ${serverName}`;
        }
    }

    renderCommandHistory(history) {
        const responseContent = document.getElementById('responseContent');
        
        // Clear existing content
        responseContent.innerHTML = '';
        
        if (history.length === 0) {
            const noResponse = document.createElement('div');
            noResponse.className = 'no-response';
            noResponse.textContent = 'No commands executed yet';
            responseContent.appendChild(noResponse);
            return;
        }
        
        // Add each response item
        history.forEach(item => {
            const responseItem = document.createElement('div');
            responseItem.className = `response-item ${item.type}`;
            
            responseItem.innerHTML = `
                <div class="response-timestamp">${item.timestamp}</div>
                <div class="response-command">${item.commandName}</div>
                <div class="response-data">${this.escapeHtml(item.result)}</div>
            `;
            
            responseContent.appendChild(responseItem);
        });
    }    async testApiConnection() {
        if (!this.selectedServerIp) return;
        
        try {
            const result = await this.api.watchoutTestConnection(this.selectedServerIp);
            this.updateConnectionStatus(result.connected, result.message);
        } catch (error) {
            this.updateConnectionStatus(false, 'Connection test failed');
        }
    }updateConnectionStatus(connected, message) {
        const connectionStatus = document.getElementById('connectionStatus');
        const statusIndicator = document.getElementById('apiStatusIndicator');
        const statusText = document.getElementById('apiStatusText');
        
        this.apiConnectionStatus = connected;
        
        // Update server-specific state
        if (this.selectedServerId) {
            this.updateServerCommandState(this.selectedServerId, {
                connectionStatus: connected,
                connectionMessage: message || (connected ? 'API Connected' : 'API Not Available'),
                lastConnectionTest: new Date().toISOString()
            });
        }
        
        if (connected) {
            connectionStatus.className = 'connection-status connected';
            statusText.textContent = 'API Connected';
        } else {
            connectionStatus.className = 'connection-status error';
            statusText.textContent = message || 'API Not Available';
        }
        
        // Enable/disable command buttons based on connection
        this.updateCommandButtonStates();
    }    updateCommandButtonStates() {
        const commandButtons = document.querySelectorAll('.command-btn');
        const timelineSelector = document.getElementById('timelineSelector');
        const hasTimelineSelected = timelineSelector && timelineSelector.value;
        
        commandButtons.forEach(button => {
            if (button.id === 'testConnectionBtn') {
                // Test connection button is always enabled when server is selected
                button.disabled = !this.selectedServerIp;
            } else if (['playBtn', 'pauseBtn', 'stopBtn'].includes(button.id)) {
                // Timeline control buttons require API connection AND timeline selection
                button.disabled = !this.apiConnectionStatus || !hasTimelineSelected;
                
                // Update button titles to show requirements
                if (!this.apiConnectionStatus) {
                    button.title = 'Connect to server first';
                } else if (!hasTimelineSelected) {
                    button.title = 'Select a timeline first';
                } else {
                    button.title = button.querySelector('span:last-child')?.textContent || '';
                }
            } else {
                // Other command buttons require API connection
                button.disabled = !this.apiConnectionStatus;
            }
        });
    }

    async executeCommand(commandType) {
        if (!this.selectedServerIp) {
            this.addCommandResponse('error', commandType, 'No server selected');
            return;
        }

        const timestamp = new Date().toLocaleTimeString();
        let result;

        try {
            this.setCommandButtonLoading(commandType, true);            switch (commandType) {
                case 'play':
                    const playTimelineId = this.getSelectedTimelineId();
                    result = await this.api.watchoutPlayTimeline(this.selectedServerIp, playTimelineId);
                    if (result.success) {
                        result.timelineContext = `Timeline ID: ${playTimelineId}`;
                    }
                    break;
                case 'pause':
                    const pauseTimelineId = this.getSelectedTimelineId();
                    result = await this.api.watchoutPauseTimeline(this.selectedServerIp, pauseTimelineId);
                    if (result.success) {
                        result.timelineContext = `Timeline ID: ${pauseTimelineId}`;
                    }
                    break;
                case 'stop':
                    const stopTimelineId = this.getSelectedTimelineId();
                    result = await this.api.watchoutStopTimeline(this.selectedServerIp, stopTimelineId);
                    if (result.success) {
                        result.timelineContext = `Timeline ID: ${stopTimelineId}`;
                    }
                    break;
                case 'status':
                    result = await this.api.watchoutGetStatus(this.selectedServerIp);
                    break;
                case 'timelines':
                    result = await this.api.watchoutGetTimelines(this.selectedServerIp);
                    // Populate timeline selector with the results
                    if (result.success && result.data) {
                        this.populateTimelineSelector(result.data);
                    }
                    break;
                case 'show':
                    result = await this.api.watchoutGetShow(this.selectedServerIp);
                    break;
                case 'testConnection':
                    result = await this.api.watchoutTestConnection(this.selectedServerIp);
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
    }    setCommandButtonLoading(commandType, loading) {
        const buttonMap = {
            'play': 'playBtn',
            'pause': 'pauseBtn',
            'stop': 'stopBtn',
            'status': 'statusBtn',
            'timelines': 'timelinesBtn',
            'show': 'showBtn',
            'testConnection': 'testConnectionBtn'
        };

        const buttonId = buttonMap[commandType];
        const button = document.getElementById(buttonId);
        
        if (button) {
            button.disabled = loading;
            const icon = button.querySelector('.cmd-icon');
            
            if (loading) {
                // Check if this button has SVG icons
                const svgIcon = icon.querySelector('.timeline-icon');
                
                if (svgIcon) {
                    // Store original SVG HTML and replace with loading emoji
                    button.dataset.originalSvg = icon.innerHTML;
                    icon.innerHTML = '⏳';
                } else {
                    // Handle emoji icons (fallback for non-timeline buttons)
                    button.dataset.originalIcon = icon.textContent;
                    icon.textContent = '⏳';
                }
            } else {
                // Restore original content
                if (button.dataset.originalSvg) {
                    // Restore original SVG
                    icon.innerHTML = button.dataset.originalSvg;
                    delete button.dataset.originalSvg;
                } else if (button.dataset.originalIcon) {
                    // Restore original emoji
                    icon.textContent = button.dataset.originalIcon;
                    delete button.dataset.originalIcon;
                }
            }
        }
    }addCommandResponse(type, command, result) {
        // Add to server-specific command history
        if (this.selectedServerId) {
            this.addCommandToServerHistory(this.selectedServerId, type, command, result);
            
            // Re-render the command history for the current server
            const commandState = this.getServerCommandState(this.selectedServerId);
            this.renderCommandHistory(commandState.commandHistory);
        }
    }    getCommandDisplayName(command) {
        const commandNames = {
            'play': '▶️ Play Timeline',
            'pause': '⏸️ Pause Timeline',
            'stop': '⏹️ Stop Timeline',
            'status': '📊 Get Status',
            'timelines': '📑 Get Timelines',
            'show': '🎭 Get Show Info',
            'testConnection': '🔗 Test Connection',
            'custom': '⚙️ Custom Command'
        };
        return commandNames[command] || command;
    }clearCommandResponse() {
        // Clear server-specific command history
        if (this.selectedServerId) {
            this.updateServerCommandState(this.selectedServerId, {
                commandHistory: []
            });
            
            // Re-render the empty command history
            this.renderCommandHistory([]);
        }
    }showCustomCommandDialog() {
        const modal = document.getElementById('customCommandModal');
        modal.style.display = 'flex';
        
        // Bind modal events
        this.bindCustomCommandModal();
        
        // Clear previous values
        document.getElementById('customEndpoint').value = '';
        document.getElementById('customMethod').value = 'GET';
        document.getElementById('customData').value = '';
        
        // Focus on endpoint input
        setTimeout(() => {
            document.getElementById('customEndpoint').focus();
        }, 100);
    }    bindCustomCommandModal() {
        const modal = document.getElementById('customCommandModal');
        const closeBtn = document.getElementById('closeCustomModal');
        const cancelBtn = document.getElementById('cancelCustomCommand');
        const executeBtn = document.getElementById('executeCustomCommand');
        const examplesSelect = document.getElementById('endpointExamples');
        const endpointInput = document.getElementById('customEndpoint');
        const methodSelect = document.getElementById('customMethod');
        
        // Handle example selection
        examplesSelect.onchange = () => {
            const selectedEndpoint = examplesSelect.value;
            if (selectedEndpoint) {
                endpointInput.value = selectedEndpoint;
                // Set appropriate method based on endpoint
                if (selectedEndpoint.includes('/play/') || 
                    selectedEndpoint.includes('/pause/') || 
                    selectedEndpoint.includes('/stop/') ||
                    selectedEndpoint.includes('/jump-to-')) {
                    methodSelect.value = 'POST';
                } else {
                    methodSelect.value = 'GET';
                }
                examplesSelect.value = ''; // Reset dropdown
            }
        };
        
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
        
        // Execute custom command
        executeBtn.onclick = () => {
            this.executeCustomCommand();
            closeModal();
        };
        
        // Execute on Enter key in endpoint field
        endpointInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                this.executeCustomCommand();
                closeModal();
            }
        };
    }

    async executeCustomCommand() {
        if (!this.selectedServerIp) {
            this.addCommandResponse('error', 'custom', 'No server selected');
            return;
        }

        const endpoint = document.getElementById('customEndpoint').value.trim();
        const method = document.getElementById('customMethod').value;
        const dataText = document.getElementById('customData').value.trim();
        
        if (!endpoint) {
            this.addCommandResponse('error', 'custom', 'Endpoint is required');
            return;
        }
        
        let requestData = null;
        if (dataText && method !== 'GET') {
            try {
                requestData = JSON.parse(dataText);
            } catch (error) {
                this.addCommandResponse('error', 'custom', 'Invalid JSON data: ' + error.message);
                return;
            }
        }

        try {
            // Create a custom request using the WatchoutCommands sendRequest method
            const result = await this.sendCustomWatchoutRequest(endpoint, method, requestData);
            this.addCommandResponse(result.success ? 'success' : 'error', 'custom', result);
        } catch (error) {
            this.addCommandResponse('error', 'custom', { error: error.message });
        }
    }    async sendCustomWatchoutRequest(endpoint, method, data) {
        try {
            return await this.api.watchoutSendCustomRequest(
                this.selectedServerIp, 
                endpoint, 
                method, 
                data
            );
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Timeline Selection Methods
    getSelectedTimelineId() {
        const selector = document.getElementById('timelineSelector');
        const selectedValue = selector?.value;
        return selectedValue ? parseInt(selectedValue) : 0;
    }    populateTimelineSelector(timelinesData) {
        const selector = document.getElementById('timelineSelector');
        const timelineInfo = document.getElementById('timelineInfo');
        const timelineList = document.getElementById('timelineList');
        
        if (!selector) return;

        // Clear existing options
        selector.innerHTML = '<option value="">Select a timeline...</option>';
        
        // Clear timeline list
        if (timelineList) {
            timelineList.innerHTML = '';
        }
        
        let timelines = [];
        
        // Handle various response formats
        if (Array.isArray(timelinesData)) {
            timelines = timelinesData;
        } else if (timelinesData && timelinesData.timelines && Array.isArray(timelinesData.timelines)) {
            timelines = timelinesData.timelines;
        } else if (timelinesData && typeof timelinesData === 'object') {
            // Try to extract timeline names/IDs from object
            timelines = Object.entries(timelinesData).map(([key, value]) => ({
                id: key,
                name: value || `Timeline ${key}`
            }));
        }
        
        // Store timelines data for later use
        this.availableTimelines = timelines;
        
        // Populate selector options
        timelines.forEach((timeline, index) => {
            const option = document.createElement('option');
            
            if (typeof timeline === 'string') {
                option.value = index;
                option.textContent = timeline;
            } else if (timeline && typeof timeline === 'object') {
                option.value = timeline.id !== undefined ? timeline.id : index;
                option.textContent = timeline.name || timeline.title || `Timeline ${option.value}`;
            }
            
            selector.appendChild(option);
        });
        
        // Populate timeline list display
        this.populateTimelineList(timelines);
        
        // Enable selector if we have timelines
        if (timelines.length > 0) {
            selector.disabled = false;
            if (timelineInfo) {
                timelineInfo.style.display = 'block';
                this.updateTimelineInfo();
            }
        } else {
            selector.disabled = true;
            if (timelineInfo) {
                timelineInfo.style.display = 'none';
            }
        }
        
        this.updateCommandButtonStates();
    }

    populateTimelineList(timelines) {
        const timelineList = document.getElementById('timelineList');
        
        if (!timelineList) return;
        
        // Clear existing items
        timelineList.innerHTML = '';
        
        if (!timelines || timelines.length === 0) {
            const noTimelinesItem = document.createElement('div');
            noTimelinesItem.className = 'timeline-list-item no-timelines';
            noTimelinesItem.textContent = 'No timelines available';
            timelineList.appendChild(noTimelinesItem);
            return;
        }
        
        // Create timeline list items
        timelines.forEach((timeline, index) => {
            const item = document.createElement('div');
            item.className = 'timeline-list-item';
            
            let timelineId, timelineName;
            
            if (typeof timeline === 'string') {
                timelineId = index;
                timelineName = timeline;
            } else if (timeline && typeof timeline === 'object') {
                timelineId = timeline.id !== undefined ? timeline.id : index;
                timelineName = timeline.name || timeline.title || `Timeline ${timelineId}`;
            }
            
            item.textContent = `${timelineId}: ${timelineName}`;
            item.dataset.timelineId = timelineId;
            
            // Add click handler to select timeline
            item.addEventListener('click', () => {
                const selector = document.getElementById('timelineSelector');
                if (selector) {
                    selector.value = timelineId;
                    this.onTimelineSelectionChange();
                }
            });
            
            timelineList.appendChild(item);
        });
    }    resetTimelineSelector() {
        const selector = document.getElementById('timelineSelector');
        const timelineInfo = document.getElementById('timelineInfo');
        const timelineList = document.getElementById('timelineList');
        
        if (selector) {
            selector.innerHTML = '<option value="">Load timelines first...</option>';
            selector.disabled = true;
        }
        
        if (timelineList) {
            timelineList.innerHTML = '<div class="timeline-list-item no-timelines">No timelines loaded</div>';
        }
        
        if (timelineInfo) {
            timelineInfo.style.display = 'none';
        }
        
        // Clear stored timelines
        this.availableTimelines = [];
        
        this.updateCommandButtonStates();
    }

    onTimelineSelectionChange() {
        this.updateTimelineInfo();
        this.updateCommandButtonStates();
    }    updateTimelineInfo() {
        const selector = document.getElementById('timelineSelector');
        const timelineList = document.getElementById('timelineList');
        
        if (!selector || !timelineList) return;
        
        const selectedValue = selector.value;
        
        // Update timeline list items to show selection
        const timelineItems = timelineList.querySelectorAll('.timeline-list-item');
        timelineItems.forEach(item => {
            if (item.dataset.timelineId === selectedValue && selectedValue !== '') {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    // Settings Modal Methods
    showSettingsDialog() {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'flex';
        
        // Load current settings values
        this.loadCurrentSettings();
        
        // Bind modal events
        this.bindSettingsModal();
        
        // Focus on first input
        setTimeout(() => {
            const firstCheckbox = document.getElementById('enableCacheFromDisk');
            if (firstCheckbox) firstCheckbox.focus();
        }, 100);
    }

    async loadCurrentSettings() {
        try {
            // Load settings from the main process
            const settings = await this.api.getAppSettings();
            
            // Update cache from disk checkbox
            const enableCacheFromDisk = document.getElementById('enableCacheFromDisk');
            if (enableCacheFromDisk) {
                enableCacheFromDisk.checked = settings.enableCacheFromDisk !== false; // default to true
            }
            
            // Update web server checkbox
            const enableWebServer = document.getElementById('enableWebServer');
            if (enableWebServer) {
                enableWebServer.checked = settings.enableWebServer !== false; // default to true
            }
            
            // Update web server status
            await this.updateWebServerStatus();
            
            // Update app version in settings
            const settingsVersion = document.getElementById('settingsVersion');
            if (settingsVersion) {
                const version = await this.api.getAppVersion();
                settingsVersion.textContent = version;
            }
            
            // Update cache file location
            const cacheFileLocation = document.getElementById('cacheFileLocation');
            if (cacheFileLocation) {
                const cacheLocation = await this.api.getCacheFileLocation();
                cacheFileLocation.textContent = cacheLocation || 'Default location';
            }
            
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async updateWebServerStatus() {
        try {
            const webServerStatus = document.getElementById('webServerStatus');
            if (webServerStatus) {
                const status = await this.api.getWebServerStatus();
                webServerStatus.textContent = status.running ? 'Running' : 'Stopped';
                webServerStatus.className = `status-indicator-text ${status.running ? 'online' : 'offline'}`;
            }
        } catch (error) {
            const webServerStatus = document.getElementById('webServerStatus');
            if (webServerStatus) {
                webServerStatus.textContent = 'Unknown';
                webServerStatus.className = 'status-indicator-text unknown';
            }
        }
    }

    bindSettingsModal() {
        const modal = document.getElementById('settingsModal');
        const closeBtn = document.getElementById('closeSettingsModal');
        const cancelBtn = document.getElementById('cancelSettings');
        const saveBtn = document.getElementById('saveSettings');
        
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
        
        // Save settings
        saveBtn.onclick = async () => {
            await this.saveSettings();
            closeModal();
        };
          // Update web server status when checkbox changes
        const enableWebServer = document.getElementById('enableWebServer');
        if (enableWebServer) {
            enableWebServer.onchange = () => {
                // Update status immediately to show expected state
                this.updateWebServerStatus();
            };
        }
        
        // Web server control buttons
        const stopWebServerBtn = document.getElementById('stopWebServerBtn');
        const restartWebServerBtn = document.getElementById('restartWebServerBtn');
        
        if (stopWebServerBtn) {
            stopWebServerBtn.onclick = async () => {
                await this.stopWebServer();
            };
        }
        
        if (restartWebServerBtn) {
            restartWebServerBtn.onclick = async () => {
                await this.restartWebServer();
            };
        }
    }

    async saveSettings() {
        try {
            const enableCacheFromDisk = document.getElementById('enableCacheFromDisk');
            const enableWebServer = document.getElementById('enableWebServer');
            
            const settings = {
                enableCacheFromDisk: enableCacheFromDisk ? enableCacheFromDisk.checked : true,
                enableWebServer: enableWebServer ? enableWebServer.checked : true
            };
            
            // Save settings to main process
            await this.api.saveAppSettings(settings);
            
            // Update web server status after saving
            setTimeout(() => {
                this.updateWebServerStatus();
            }, 500);
            
            console.log('Settings saved successfully');
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }    // Web Server Control Methods
    async stopWebServer() {
        try {
            const stopBtn = document.getElementById('stopWebServerBtn');
            const restartBtn = document.getElementById('restartWebServerBtn');
            
            // Disable buttons during operation
            if (stopBtn) stopBtn.disabled = true;
            if (restartBtn) restartBtn.disabled = true;
            
            console.log('Stopping web server...');
            await this.api.stopWebServer();
            
            // Update status after stopping
            setTimeout(() => {
                this.updateWebServerStatus();
                if (stopBtn) stopBtn.disabled = false;
                if (restartBtn) restartBtn.disabled = false;
            }, 1000);
            
        } catch (error) {
            console.error('Error stopping web server:', error);
            // Re-enable buttons on error
            const stopBtn = document.getElementById('stopWebServerBtn');
            const restartBtn = document.getElementById('restartWebServerBtn');
            if (stopBtn) stopBtn.disabled = false;
            if (restartBtn) restartBtn.disabled = false;
        }
    }

    async restartWebServer() {
        try {
            const stopBtn = document.getElementById('stopWebServerBtn');
            const restartBtn = document.getElementById('restartWebServerBtn');
            
            // Disable buttons during operation
            if (stopBtn) stopBtn.disabled = true;
            if (restartBtn) restartBtn.disabled = true;
            
            console.log('Restarting web server...');
            await this.api.restartWebServer();
            
            // Update status after restarting
            setTimeout(() => {
                this.updateWebServerStatus();
                if (stopBtn) stopBtn.disabled = false;
                if (restartBtn) restartBtn.disabled = false;
            }, 2000);
            
        } catch (error) {
            console.error('Error restarting web server:', error);
            // Re-enable buttons on error
            const stopBtn = document.getElementById('stopWebServerBtn');
            const restartBtn = document.getElementById('restartWebServerBtn');
            if (stopBtn) stopBtn.disabled = false;
            if (restartBtn) restartBtn.disabled = false;
        }
    }

    initializeStartupWarnings() {
        // Listen for startup warnings from main process
        if (this.api.onStartupWarning) {
            this.api.onStartupWarning((notification) => {
                this.showStartupWarning(notification);
            });
        }

        // Listen for web server errors
        if (this.api.onWebServerError) {
            this.api.onWebServerError((error) => {
                console.warn('Web server error:', error);
                // Could show a non-blocking notification here
            });
        }
    }

    // Startup Warning Methods
    showStartupWarning(notification) {
        const modal = document.getElementById('startupWarningModal');
        const icon = document.getElementById('startupWarningIcon');
        const title = document.getElementById('startupWarningTitle');
        const message = document.getElementById('startupWarningMessage');
        const actions = document.getElementById('startupWarningActions');

        // Set icon and colors based on severity
        if (notification.icon) {
            icon.textContent = notification.icon;
        }

        // Set title and message
        title.textContent = notification.title;
        message.textContent = notification.message;

        // Clear existing actions
        actions.innerHTML = '';

        // Create action buttons
        if (notification.actions) {
            notification.actions.forEach(action => {
                const button = document.createElement('button');
                button.className = `warning-action-btn ${action.primary ? 'primary' : 'secondary'}`;
                button.textContent = action.label;
                button.onclick = () => this.handleStartupWarningAction(action.id, notification.type);
                actions.appendChild(button);
            });
        }

        // Show modal
        modal.style.display = 'flex';
    }

    async handleStartupWarningAction(actionId, warningType) {
        const modal = document.getElementById('startupWarningModal');
        
        switch (actionId) {
            case 'refresh':
                // Perform startup checks again
                try {
                    const result = await this.api.performStartupChecks();
                    if (result.success && result.result) {
                        // Check if issues are resolved
                        if (result.result.warnings.length === 0) {
                            this.hideStartupWarning();
                        } else {
                            // Show updated warning
                            const notification = this.createNotificationFromCheckResult(result.result);
                            if (notification) {
                                this.showStartupWarning(notification);
                            } else {
                                this.hideStartupWarning();
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to refresh startup checks:', error);
                }
                break;
                
            case 'retry':
                // Retry the failed operation
                this.hideStartupWarning();
                break;
                
            case 'continue':
            case 'ok':
            default:
                // Dismiss the warning
                this.hideStartupWarning();
                break;
        }

        // Dismiss the warning in the main process
        try {
            await this.api.dismissStartupWarning(warningType);
        } catch (error) {
            console.error('Failed to dismiss startup warning:', error);
        }
    }

    hideStartupWarning() {
        const modal = document.getElementById('startupWarningModal');
        modal.style.display = 'none';
    }

    createNotificationFromCheckResult(checkResult) {
        // Helper method to convert check results to notification format
        if (checkResult.warnings.length === 0) {
            return null;
        }

        const warning = checkResult.warnings[0];
        return {
            type: warning.type,
            title: warning.title,
            message: warning.message,
            icon: warning.type === 'watchout-running' ? '⚠️' : '🔌',
            actions: warning.type === 'watchout-running' 
                ? [
                    { id: 'refresh', label: 'Refresh Check', primary: true },
                    { id: 'continue', label: 'Continue Anyway', secondary: true }
                ]
                : [
                    { id: 'ok', label: 'OK', primary: true }
                ],
            severity: warning.severity || 'warning'
        };
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new WatchoutServerFinderApp();
    
    // Cleanup when window is closing
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
});

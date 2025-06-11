class WatchoutServerFinderApp {
    constructor() {
        this.servers = [];
        this.isScanning = false;
        this.scanInterval = null;
        this.backgroundScanEnabled = true;
        this.scanIntervalMs = 30000; // 30 seconds
        this.selectedServerId = null; // Track selected server
        this.selectedServerIp = null; // Track selected server IP for commands
        this.apiConnectionStatus = false; // Track API connection status
        this.serverCommandStates = new Map(); // Track command state per server
        this.initializeApp();
    }

    async initializeApp() {
        this.bindEvents();
        await this.loadAppVersion();
        this.updateUI();
        this.startBackgroundScanning();
        }    bindEvents() {
        const scanButton = document.getElementById('scanButton');
        scanButton.addEventListener('click', () => this.startManualScan());
        
        // Tab switching events
        this.bindTabEvents();
        
        // Command button events
        this.bindCommandEvents();
    }

    bindTabEvents() {
        const detailsTab = document.getElementById('detailsTab');
        const commandsTab = document.getElementById('commandsTab');
        
        detailsTab.addEventListener('click', () => this.switchTab('details'));
        commandsTab.addEventListener('click', () => this.switchTab('commands'));
    }    switchTab(tabName) {
        // Don't switch to commands tab if disabled
        if (tabName === 'commands') {
            const commandsTab = document.getElementById('commandsTab');
            if (commandsTab.classList.contains('disabled')) {
                return;
            }
        }
        
        // Update tab buttons
        const tabs = document.querySelectorAll('.tab-btn');
        const panels = document.querySelectorAll('.tab-panel');
        const indicator = document.querySelector('.tab-indicator');
        
        tabs.forEach(tab => tab.classList.remove('active'));
        panels.forEach(panel => panel.classList.remove('active'));
        
        if (tabName === 'details') {
            document.getElementById('detailsTab').classList.add('active');
            document.getElementById('detailsPanel').classList.add('active');
            indicator.classList.remove('commands');
        } else if (tabName === 'commands') {
            document.getElementById('commandsTab').classList.add('active');
            document.getElementById('commandsPanel').classList.add('active');
            indicator.classList.add('commands');
        }
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
        
        // Advanced commands
        document.getElementById('testConnectionBtn')?.addEventListener('click', () => this.executeCommand('testConnection'));
        document.getElementById('customCommandBtn')?.addEventListener('click', () => this.showCustomCommandDialog());
        
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
    }

    async performBackgroundScan() {
        if (this.isScanning) return;

        console.log('Performing background scan...');
        
        try {
            const result = await window.electronAPI.scanForWatchoutServers();
            
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
    }

    async startManualScan() {
        if (this.isScanning) return;

        // Temporarily disable background scanning during manual scan
        const wasBackgroundEnabled = this.backgroundScanEnabled;
        this.backgroundScanEnabled = false;

        this.isScanning = true;
        this.updateScanButton();
        this.updateScanStatus('Manual scan: Scanning network for Watchout servers...');
        
        try {
            const result = await window.electronAPI.scanForWatchoutServers();
            
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
            const version = await window.electronAPI.getAppVersion();
            document.getElementById('appVersion').textContent = version;
        } catch (error) {
            console.error('Failed to load app version:', error);
        }
    }    updateScanButton() {
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
        this.renderSidebar();
        this.renderMainContent();
    }

    updateServerCounts() {
        const count = this.servers.length;
        
        // Update main server count
        const serverCount = document.getElementById('serverCount');
        serverCount.textContent = `${count} server${count !== 1 ? 's' : ''} found`;
        
        // Update sidebar server count
        const serverCountSidebar = document.getElementById('serverCountSidebar');
        serverCountSidebar.textContent = count.toString();
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
        }        noServersSidebar.style.display = 'none';
        
        // Auto-select first server if none selected or selected server no longer exists
        let autoSelected = false;
        if (!this.selectedServerId || !this.servers.some(s => this.getServerId(s) === this.selectedServerId)) {
            this.selectedServerId = this.getServerId(this.servers[0]);
            this.selectedServerIp = this.servers[0].ip;
            autoSelected = true;
        }
        
        // Remove existing server items
        const existingItems = serverList.querySelectorAll('.server-item');
        existingItems.forEach(item => item.remove());

        // Create new server items
        this.servers.forEach(server => {
            const serverItem = this.createServerItem(server);
            serverList.appendChild(serverItem);
        });
        
        // Test API connection for auto-selected server
        if (autoSelected && this.selectedServerIp && this.servers[0]?.status === 'online') {
            setTimeout(() => this.testApiConnection(), 100);
        }
    }    renderMainContent() {
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
    }

    selectServer(serverId) {
        // Update selected server
        const previouslySelected = this.selectedServerId;
        this.selectedServerId = serverId;
        
        // Find the selected server to get its IP
        const selectedServer = this.servers.find(server => this.getServerId(server) === serverId);
        this.selectedServerIp = selectedServer ? selectedServer.ip : null;
        
        // Update sidebar selection visual state
        const serverItems = document.querySelectorAll('.server-item');
        serverItems.forEach(item => {
            if (item.dataset.serverId === serverId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });        // Show/hide commands area in the commands tab
        this.updateCommandsVisibility();
        
        // Load server-specific command state
        if (this.selectedServerId && this.selectedServerIp) {
            this.loadServerCommandsUI(this.selectedServerId);
        }
        
        // If a server was just selected, auto-switch to commands tab for better UX
        if (this.selectedServerId && this.selectedServerIp && !previouslySelected) {
            setTimeout(() => this.switchTab('commands'), 300);
        }
        
        // Re-render main content to show selected server
        this.renderMainContent();
        
        // Test API connection for the selected server
        if (this.selectedServerIp && selectedServer?.status === 'online') {
            this.testApiConnection();
        }
        
        console.log('Selected server:', serverId, 'IP:', this.selectedServerIp);
    }    updateCommandsVisibility() {
        const noServerSelected = document.getElementById('noServerSelected');
        const commandsArea = document.getElementById('commandsArea');
        const commandsTab = document.getElementById('commandsTab');
        
        if (this.selectedServerId && this.selectedServerIp) {
            noServerSelected.style.display = 'none';
            commandsArea.style.display = 'block';
            commandsTab.classList.remove('disabled');
            commandsTab.title = 'Send commands to selected server';
        } else {
            noServerSelected.style.display = 'flex';
            commandsArea.style.display = 'none';
            commandsTab.classList.add('disabled');
            commandsTab.title = 'Select a server first to enable commands';        }
    }

    loadServerCommandsUI(serverId) {
        const commandState = this.getServerCommandState(serverId);
        
        // Update connection status
        this.updateConnectionStatus(commandState.connectionStatus, commandState.connectionMessage);
        
        // Update command history
        this.renderCommandHistory(commandState.commandHistory);
        
        // Update panel header to show server name
        this.updateCommandsPanelHeader(serverId);
    }

    updateCommandsPanelHeader(serverId) {
        const selectedServer = this.servers.find(server => this.getServerId(server) === serverId);
        const serverName = selectedServer ? (selectedServer.hostRef || selectedServer.hostname || selectedServer.ip) : 'Unknown Server';
        
        const panelHeader = document.querySelector('#commandsPanel .panel-header h2');
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
    }

    async testApiConnection() {
        if (!this.selectedServerIp) return;
        
        try {
            const result = await window.electronAPI.watchout.testConnection(this.selectedServerIp);
            this.updateConnectionStatus(result.connected, result.message);
        } catch (error) {
            this.updateConnectionStatus(false, 'Connection test failed');
        }
    }    updateConnectionStatus(connected, message) {
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
    }

    updateCommandButtonStates() {
        const commandButtons = document.querySelectorAll('.command-btn');
        commandButtons.forEach(button => {
            if (button.id === 'testConnectionBtn') {
                // Test connection button is always enabled when server is selected
                button.disabled = !this.selectedServerIp;
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
            this.setCommandButtonLoading(commandType, true);

            switch (commandType) {
                case 'play':
                    result = await window.electronAPI.watchout.playTimeline(this.selectedServerIp, 0);
                    break;
                case 'pause':
                    result = await window.electronAPI.watchout.pauseTimeline(this.selectedServerIp, 0);
                    break;
                case 'stop':
                    result = await window.electronAPI.watchout.stopTimeline(this.selectedServerIp, 0);
                    break;
                case 'status':
                    result = await window.electronAPI.watchout.getStatus(this.selectedServerIp);
                    break;
                case 'timelines':
                    result = await window.electronAPI.watchout.getTimelines(this.selectedServerIp);
                    break;
                case 'show':
                    result = await window.electronAPI.watchout.getShow(this.selectedServerIp);
                    break;
                case 'testConnection':
                    result = await window.electronAPI.watchout.testConnection(this.selectedServerIp);
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

    setCommandButtonLoading(commandType, loading) {
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
                button.dataset.originalIcon = icon.textContent;
                icon.textContent = '⏳';
            } else {
                if (button.dataset.originalIcon) {
                    icon.textContent = button.dataset.originalIcon;
                    delete button.dataset.originalIcon;
                }
            }
        }
    }    addCommandResponse(type, command, result) {
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
            return await window.electronAPI.watchout.sendCustomRequest(
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new WatchoutServerFinderApp();
    
    // Cleanup when window is closing
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
});

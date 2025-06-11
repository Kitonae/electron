class WatchoutServerFinderApp {
    constructor() {
        this.servers = [];
        this.isScanning = false;
        this.scanInterval = null;
        this.backgroundScanEnabled = true;
        this.scanIntervalMs = 30000; // 30 seconds
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
    }

    updateScanButton() {
        const button = document.getElementById('scanButton');
        const buttonIcon = button.querySelector('.button-icon');
        
        if (this.isScanning) {
            button.disabled = true;
            button.textContent = '';
            button.appendChild(buttonIcon);
            button.appendChild(document.createTextNode('Scanning...'));
            button.classList.add('scanning');        } else {
            button.disabled = false;
            button.textContent = '';
            button.appendChild(buttonIcon);
            button.appendChild(document.createTextNode('Manual Scan'));
            button.classList.remove('scanning');
        }
    }

    updateScanStatus(message) {
        document.getElementById('scanStatus').textContent = message;
    }

    updateUI() {
        this.updateServerCount();
        this.renderServers();
    }

    updateServerCount() {
        const count = this.servers.length;
        const serverCount = document.getElementById('serverCount');
        serverCount.textContent = `${count} server${count !== 1 ? 's' : ''} found`;
    }

    renderServers() {
        const container = document.getElementById('serversContainer');
        const noServers = document.getElementById('noServers');

        if (this.servers.length === 0) {
            noServers.style.display = 'flex';
            // Remove any existing server cards
            const existingCards = container.querySelectorAll('.server-card');
            existingCards.forEach(card => card.remove());
            return;
        }

        noServers.style.display = 'none';
        
        // Remove existing server cards
        const existingCards = container.querySelectorAll('.server-card');
        existingCards.forEach(card => card.remove());

        // Create new server cards
        this.servers.forEach(server => {
            const serverCard = this.createServerCard(server);
            container.appendChild(serverCard);
        });
    }    createServerCard(server) {
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
        }

        card.innerHTML = `
            <div class="server-header">
                <div>
                    <div class="server-title">${this.escapeHtml(serverName)}</div>
                    <div style="font-size: 0.9rem; color: #666;">Discovered at ${discoveredTime}</div>
                </div>
                <div class="server-type">${this.escapeHtml(server.type)}</div>
            </div>
            
            <div class="server-details">
                ${detailsHtml}
            </div>
        `;

        return card;
    }    buildBasicDetails(server) {
        return `
            <div class="detail-item">
                <span class="detail-label">IP Address:</span>
                <span class="detail-value">${this.escapeHtml(server.ip)}</span>
            </div>
            
            ${server.hostname && server.hostname !== server.ip && !server.hostRef ? `
            <div class="detail-item">
                <span class="detail-label">Hostname:</span>
                <span class="detail-value">${this.escapeHtml(server.hostname)}</span>
            </div>
            ` : ''}
        `;
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new WatchoutServerFinderApp();
    
    // Cleanup when window is closing
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
});

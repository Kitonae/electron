class WatchoutServerFinderApp {
  constructor() {
    try {
      this.servers = [];
      this.isScanning = false;
      this.scanInterval = null;
      this.backgroundScanEnabled = true;
      this.scanIntervalMs = 30000; // 30 seconds
      this.selectedServerId = null; // Track selected server      this.selectedServerIp = null; // Track selected server IP for commands
      this.apiConnectionStatus = false; // Track API connection status
      this.serverCommandStates = new Map(); // Track command state per server
      this.availableTimelines = []; // Store available timelines for current server
      this.connectionTestTimeout = 8000; // 8 second timeout for connection tests
      this.connectionTestAbortController = null; // Track ongoing connection tests
      this.lastServerSelectTime = null; // Track last server selection time for throttling
      this.connectionTestTimeoutId = null; // Track scheduled connection tests
      this.statusUpdateTimeout = null; // Track status update debouncing
      this.lokiLabelKey = 'app'; // default Loki label for filtering
      this.autoScrollEnabled = true; // track auto-scroll state

      // Initialize API adapter for cross-platform compatibility with error handling
      try {
        this.api = new ApiAdapter();
      } catch (error) {
        console.error('Failed to initialize API adapter:', error);
        this.api = null;
      }

      // Initialize app with error handling
      this.initializeApp().catch(error => {
        console.error('App initialization failed:', error);
        this.handleInitializationError(error);
      });
    } catch (error) {
      console.error('Constructor failed:', error);
      this.handleInitializationError(error);
    }
  }
  async initializeApp() {
    try {
      console.log('Starting app initialization...');
      
      // Step 1: Bind basic events first
      this.bindEvents();
      console.log('Events bound successfully');

      // Step 1.5: Initialize theme early
      await this.initializeTheme();

      // Step 2: Load app version (with timeout)
      try {
        await Promise.race([
          this.loadAppVersion(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        console.log('App version loaded');
      } catch (error) {
        console.warn('Failed to load app version:', error);
      }

      // Step 3: Initialize startup warnings
      this.initializeStartupWarnings();

      // Step 4: Ensure UI elements are ready
      await this.waitForDOMElements();

      // Step 5: Setup UI with delays
      setTimeout(() => {
        this.ensureFooterVisibility();
      }, 100);

      setTimeout(() => {
        this.bindWindowControls();
        // Update maximize button state after binding
        this.updateMaximizeButton();
      }, 200);

      // Step 6: Update UI and start scanning
      this.updateUI();
      
      // Step 7: Start background scanning (with delay)
      setTimeout(() => {
        this.startBackgroundScanning();
      }, 500);

      // Initialize playback updates (SSE)
      this.initPlaybackUpdates();

      console.log('App initialization completed successfully');
    } catch (error) {
      console.error('App initialization failed:', error);
      throw error;
    }
  }
  initPlaybackUpdates() {
    try {
      // default toggles
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
      // Start immediately
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
    try {
      if (this.sseSource) {
        this.sseSource.close();
        this.sseSource = null;
      }
    } catch {}
    const badge = document.getElementById('sseConnectionBadge');
    if (badge) {
      badge.textContent = 'Connecting…';
      badge.className = 'connection-badge';
    }
    try {
      const url = 'http://localhost:3019/v1/sse';
      this.sseSource = new EventSource(url);
      this.sseSource.onopen = () => {
        if (badge) { badge.textContent = 'Connected'; badge.className = 'connection-badge connected'; }
      };
      this.sseSource.onerror = () => {
        if (badge) { badge.textContent = 'Error'; badge.className = 'connection-badge error'; }
      };
      this.sseSource.onmessage = (evt) => {
        this.addPlaybackUpdate(evt.data);
      };
    } catch (e) {
      if (badge) { badge.textContent = 'Error'; badge.className = 'connection-badge error'; }
      console.error('SSE init failed:', e);
    }
  }
  addPlaybackUpdate(data) {
    const list = document.getElementById('playbackUpdatesList');
    if (!list) return;
    // Remove placeholder
    const placeholder = list.querySelector('.no-updates');
    if (placeholder) placeholder.remove();
    // Parse data if JSON
    let text = data;
    try {
      const parsed = JSON.parse(data);
      text = JSON.stringify(parsed, null, 2);
    } catch {}
    const item = document.createElement('pre');
    item.className = 'playback-update-item appear';
    const ts = new Date().toLocaleTimeString();
    item.innerHTML = `<span class="timestamp">${ts}</span>${text}`;
    list.prepend(item);
    // Trim to last 50
    const items = list.querySelectorAll('.playback-update-item');
    if (items.length > 50) items[items.length - 1].remove();

    // Auto-scroll to newest (top) if enabled
    if (this.sseAutoscroll) {
      const area = document.getElementById('playbackUpdatesArea');
      if (area) area.scrollTop = 0;
    }
    // Optionally remove the appear class after animation completes
    setTimeout(() => { try { item.classList.remove('appear'); } catch {} }, 600);
  }
  bindEvents() {
    try {
      const scanButton = document.getElementById("scanButton");
      if (scanButton) {
        scanButton.addEventListener("click", () => this.startManualScan());
      } else {
        console.warn('Scan button not found during binding');
      }

      const clearOfflineButton = document.getElementById("clearOfflineButton");
      if (clearOfflineButton) {
        clearOfflineButton.addEventListener("click", () => this.clearOfflineServers());
      }      const addServerButton = document.getElementById("addServerButton");
      if (addServerButton) {
        addServerButton.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Add server button clicked');
          this.showAddServerDialog();
        });
        console.log('Add server button event listener bound successfully');
      } else {
        console.warn('Add server button not found during binding');
      }

      const settingsButton = document.getElementById("settingsButton");
      if (settingsButton) {
        settingsButton.addEventListener("click", () => this.showSettingsDialog());
      }

      // Temporary test button for startup warnings
      const testStartupWarningButton = document.getElementById("testStartupWarningButton");
      if (testStartupWarningButton) {
        testStartupWarningButton.addEventListener("click", async () => {
          console.log('Test startup warning button clicked');
          try {
            if (this.api && this.api.testStartupWarning) {
              const result = await this.api.testStartupWarning();
              console.log('Test startup warning result:', result);
            } else {
              console.error('testStartupWarning method not available');
            }
          } catch (error) {
            console.error('Error triggering test startup warning:', error);
          }
        });
      }

      // Bind command events safely
      this.bindCommandEvents();
      
      console.log('Events bound successfully');
    } catch (error) {
      console.error('Error binding events:', error);
      throw error;
    }
  }
  bindCommandEvents() {
    try {
      // Timeline selector change event
      const timelineSelector = document.getElementById("timelineSelector");
      if (timelineSelector) {
        timelineSelector.addEventListener("change", () => this.onTimelineSelectionChange());
      }      // Command buttons
      const commandButtons = [
        { id: "playBtn", command: "play" },
        { id: "pauseBtn", command: "pause" },
        { id: "stopBtn", command: "stop" },
        { id: "statusBtn", command: "status" },
        { id: "timelinesBtn", command: "timelines" },
        { id: "showBtn", command: "show" },
        { id: "uploadShowBtn", command: "uploadShow" },
        { id: "testConnectionBtn", command: "testConnection" },
        { id: "customCommandBtn", command: "custom" },
        { id: "logViewerBtn", command: "logViewer" }
      ];

      commandButtons.forEach(({ id, command }) => {
        const button = document.getElementById(id);        if (button) {
          if (command === "custom") {
            button.addEventListener("click", (e) => {
              this.addRippleEffect(e.currentTarget);
              this.showCustomCommandDialog();
            });
          } else if (command === "logViewer") {
            button.addEventListener("click", (e) => {
              this.addRippleEffect(e.currentTarget);
              this.showLokiLogViewer();
            });
          } else {
            button.addEventListener("click", (e) => {
              this.addRippleEffect(e.currentTarget);
              this.executeCommand(command);
            });
          }
        }
      });

      // Clear response button
      const clearResponseBtn = document.getElementById("clearResponseBtn");
      if (clearResponseBtn) {
        clearResponseBtn.addEventListener("click", () => this.clearCommandResponse());
      }

      console.log('Command events bound successfully');
    } catch (error) {
      console.error('Error binding command events:', error);
    }
  }
  bindWindowControls() {
    try {
      const minimizeBtn = document.getElementById("minimizeBtn");
      const maximizeBtn = document.getElementById("maximizeBtn");
      const closeBtn = document.getElementById("closeBtn");

      if (minimizeBtn) {
        minimizeBtn.addEventListener("click", () => {
          if (window.electronAPI && window.electronAPI.windowControls) {
            window.electronAPI.windowControls.minimize();
          }
        });
      }

      if (maximizeBtn) {
        maximizeBtn.addEventListener("click", async () => {
          if (window.electronAPI && window.electronAPI.windowControls) {
            const isMaximized = await window.electronAPI.windowControls.isMaximized();
            if (isMaximized) {
              window.electronAPI.windowControls.unmaximize();
            } else {
              window.electronAPI.windowControls.maximize();
            }
            // Update button state
            this.updateMaximizeButtonState(!isMaximized);
          }
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          if (window.electronAPI && window.electronAPI.windowControls) {
            window.electronAPI.windowControls.close();
          }
        });
      }

      // Listen for window state changes to update maximize button
      if (window.electronAPI && window.electronAPI.windowControls) {
        window.electronAPI.windowControls.onMaximized(() => {
          this.updateMaximizeButtonState(true);
        });

        window.electronAPI.windowControls.onUnmaximized(() => {
          this.updateMaximizeButtonState(false);
        });
      }

      console.log('Window controls bound successfully');
    } catch (error) {
      console.error('Error binding window controls:', error);
    }
  }
  async updateMaximizeButton() {
    if (window.electronAPI && window.electronAPI.windowControls) {
      const maximizeBtn = document.getElementById("maximizeBtn");
      if (maximizeBtn) {
        try {
          const isMaximized =
            await window.electronAPI.windowControls.isMaximized();
          this.updateMaximizeButtonState(isMaximized);
        } catch (error) {
          console.warn("Could not check window maximized state:", error);
        }
      }
    }
  }

  updateMaximizeButtonState(isMaximized) {
    const maximizeBtn = document.getElementById("maximizeBtn");
    if (maximizeBtn) {
      if (isMaximized) {
        maximizeBtn.classList.add("maximized");
        maximizeBtn.title = "Restore";
      } else {
        maximizeBtn.classList.remove("maximized");
        maximizeBtn.title = "Maximize";
      }
    }
  }

  startBackgroundScanning() {
    console.log(
      "Starting background scanning every",
      this.scanIntervalMs / 1000,
      "seconds"
    );

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
      console.log("Background scanning stopped");
    }
  }  async performBackgroundScan() {
    if (this.isScanning) return;

    console.log("Performing background scan...");

    // Set scanning state and update button animation
    this.isScanning = true;
    this.updateScanButton();

    try {
      const result = await this.api.scanForWatchoutServers();

      if (result.success) {
        const previousCount = this.servers.length;
        this.servers = result.servers;

        // Only update status if servers were found or count changed
        if (this.servers.length !== previousCount) {
          this.updateScanStatus(
            `Discovery: Found ${this.servers.length} server(s).`
          );
          console.log(`Background scan found ${this.servers.length} servers`);
        }

        this.updateUI();
      } else {
        console.warn("Background scan failed:", result.error);
      }
    } catch (error) {
      console.error("Background scan error:", error);
    } finally {
      // Clear scanning state and update button animation
      this.isScanning = false;
      this.updateScanButton();
    }
  }
  async startManualScan() {
    if (this.isScanning) return;

    // Temporarily disable background scanning during manual scan
    const wasBackgroundEnabled = this.backgroundScanEnabled;
    this.backgroundScanEnabled = false;

    this.isScanning = true;
    this.updateScanButton();
    this.updateScanStatus(
      "Manual scan: Scanning network for Watchout servers..."
    );

    try {
      const result = await this.api.scanForWatchoutServers();

      if (result.success) {
        this.servers = result.servers;
        this.updateScanStatus(
          `Manual scan completed. Found ${this.servers.length} server(s).`
        );
      } else {
        this.updateScanStatus(`Manual scan failed: ${result.error}`);
        console.error("Manual scan error:", result.error);
      }
    } catch (error) {
      this.updateScanStatus("Manual scan failed: Network error");
      console.error("Manual scan network error:", error);
    } finally {
      this.isScanning = false;
      this.backgroundScanEnabled = wasBackgroundEnabled;
      this.updateScanButton();
      this.updateUI();
    }
  }
  async loadAppVersion() {
    try {
      const version = await this.api.getAppVersion();
      document.getElementById("appVersion").textContent = version;
    } catch (error) {
      console.error("Failed to load app version:", error);
    }
  }

  ensureFooterVisibility() {
    const footer = document.querySelector(".app-footer");
    if (footer) {
      // Ensure footer is visible and properly styled
      footer.style.display = "flex";
      footer.style.position = "relative";
      footer.style.zIndex = "1000";
      footer.style.flexShrink = "0";

      // Ensure parent container doesn't overflow and hide footer
      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.style.height = "100vh";
        appContainer.style.maxHeight = "100vh";
        appContainer.style.overflow = "hidden";
      }

      // Ensure main content area respects footer space
      const appMain = document.querySelector(".app-main");
      if (appMain) {
        appMain.style.maxHeight = "calc(100vh - 80px)";
        appMain.style.overflow = "hidden";
      }

      console.log("Footer visibility ensured");
    }
  }
  updateScanButton() {
    const button = document.getElementById("scanButton");

    if (this.isScanning) {
      button.disabled = true;
      button.classList.add("scanning");
    } else {
      button.disabled = false;
      button.classList.remove("scanning");
    }
  }

  updateScanStatus(message) {
    document.getElementById("scanStatus").textContent = message;
  }
  updateUI() {
    this.updateServerCounts();
    this.updateClearOfflineButtonState();
    this.renderSidebar();
    this.renderMainContent();
  }
  updateServerCounts() {
    const count = this.servers.length;

    // Update sidebar server count
    const serverCountSidebar = document.getElementById("serverCountSidebar");
    serverCountSidebar.textContent = count.toString();
  }

  updateClearOfflineButtonState() {
    const clearOfflineButton = document.getElementById("clearOfflineButton");
    const hasOfflineServers = this.servers.some(
      (server) => server.status === "offline"
    );

    if (clearOfflineButton) {
      clearOfflineButton.disabled = !hasOfflineServers;
      clearOfflineButton.style.opacity = hasOfflineServers ? "1" : "0.5";
    }
  }
  async clearOfflineServers() {
    try {
      const result = await this.api.clearOfflineServers();

      if (result.success) {
        // Update the servers list to remove offline servers
        this.servers = this.servers.filter(
          (server) => server.status !== "offline"
        );

        // Clear selection if selected server was offline
        if (this.selectedServerId) {
          const selectedServer = this.servers.find(
            (server) => this.getServerId(server) === this.selectedServerId
          );
          if (!selectedServer) {
            this.selectedServerId = null;
            this.selectedServerIp = null;
          }
        }

        // Update UI
        this.updateUI();

        // Show success message
        this.updateScanStatus(
          `Cleared ${result.removedCount || 0} offline server(s) from cache.`
        );
        console.log(
          `Cleared ${result.removedCount || 0} offline servers from cache`
        );
      } else {
        this.updateScanStatus(
          "Failed to clear offline servers: " + result.error
        );
        console.error("Failed to clear offline servers:", result.error);
      }
    } catch (error) {
      this.updateScanStatus("Error clearing offline servers");
      console.error("Error clearing offline servers:", error);
    }
  }
  renderSidebar() {
    const serverList = document.getElementById("serverList");
    const noServersSidebar = document.getElementById("noServersSidebar");

    if (this.servers.length === 0) {
      noServersSidebar.style.display = "flex";
      // Clear selection when no servers
      this.selectedServerId = null;
      // Remove any existing server items
      const existingItems = serverList.querySelectorAll(".server-item");
      existingItems.forEach((item) => item.remove());
      return;
    }

    noServersSidebar.style.display = "none";

    // Sort servers: online first, offline below
    const onlineServers = this.servers.filter(
      (server) => server.status === "online"
    );
    const offlineServers = this.servers.filter(
      (server) => server.status === "offline"
    );

    // Auto-select first server if none selected or selected server no longer exists
    // Prioritize online servers, fallback to offline servers
    let autoSelected = false;
    if (
      !this.selectedServerId ||
      !this.servers.some((s) => this.getServerId(s) === this.selectedServerId)
    ) {
      const firstServer =
        onlineServers.length > 0 ? onlineServers[0] : offlineServers[0];
      if (firstServer) {
        this.selectedServerId = this.getServerId(firstServer);
        this.selectedServerIp = firstServer.ip;
        autoSelected = true;
      }
    }

    // Remove existing server items
    const existingItems = serverList.querySelectorAll(
      ".server-item, .server-divider"
    );
    existingItems.forEach((item) => item.remove());

    // Create online server items
    onlineServers.forEach((server) => {
      const serverItem = this.createServerItem(server);
      serverList.appendChild(serverItem);
    }); // Add divider if there are both online and offline servers
    if (onlineServers.length > 0 && offlineServers.length > 0) {
      const divider = document.createElement("div");
      divider.className = "server-divider";
      serverList.appendChild(divider);
    }

    // Create offline server items
    offlineServers.forEach((server) => {
      const serverItem = this.createServerItem(server);
      serverList.appendChild(serverItem);
    });

    // Test API connection for auto-selected server (prefer online servers)
    if (autoSelected && this.selectedServerIp && onlineServers.length > 0) {
      setTimeout(() => this.testApiConnection(), 100);
    }
  }
  renderMainContent() {
    const container = document.getElementById("serversContainer");
    const noServers = document.getElementById("noServers");
    const noSelection = document.getElementById("noSelection");

    // Remove any existing server cards
    const existingCards = container.querySelectorAll(".server-card");
    existingCards.forEach((card) => card.remove());

    if (this.servers.length === 0) {
      noServers.style.display = "flex";
      noSelection.style.display = "none";
      this.updateCommandsVisibility();
      return;
    }

    noServers.style.display = "none";

    if (!this.selectedServerId) {
      noSelection.style.display = "flex";
      this.updateCommandsVisibility();
      return;
    }

    noSelection.style.display = "none";

    // Find and render the selected server
    const selectedServer = this.servers.find(
      (server) => this.getServerId(server) === this.selectedServerId
    );
    if (selectedServer) {
      const serverCard = this.createServerCard(selectedServer);
      container.appendChild(serverCard);
    }

    // Update commands visibility
    this.updateCommandsVisibility();
  }
  createServerCard(server) {
    const card = document.createElement("div");
    card.className = "server-card";

    const discoveredTime = new Date(server.discoveredAt).toLocaleTimeString();

    // Use hostRef as the primary name, fallback to hostname or IP
    let serverName =
      server.hostRef || server.hostname || server.ip || "Unknown Server";
    if (serverName.length > 30) {
      // Truncate long names
      serverName = serverName.substring(0, 27) + "...";
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
                    <div class="server-title">${this.escapeHtml(
                      serverName
                    )}</div>
                    <div style="font-size: 0.9rem; color: #666;">
                        ${
                          server.status === "online"
                            ? `Discovered at ${discoveredTime}`
                            : `Last seen: ${new Date(
                                server.lastSeenAt
                              ).toLocaleTimeString()}`
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
  }
  buildBasicDetails(server) {
    let html = `
            <div class="detail-item">
                <span class="detail-label">IP Address:</span>
                <span class="detail-value">${this.escapeHtml(server.ip)}</span>
            </div>
        `;

    // Show status information
    if (server.status === "offline" && server.offlineSince) {
      html += `
            <div class="detail-item">
                <span class="detail-label">Offline Since:</span>
                <span class="detail-value offline-time">${new Date(
                  server.offlineSince
                ).toLocaleString()}</span>
            </div>
            `;
    }

    // Show first discovery time for cached servers
    if (
      server.firstDiscoveredAt &&
      server.firstDiscoveredAt !== server.discoveredAt
    ) {
      html += `
            <div class="detail-item">
                <span class="detail-label">First Seen:</span>
                <span class="detail-value">${new Date(
                  server.firstDiscoveredAt
                ).toLocaleString()}</span>
            </div>
            `;
    }

    // Show hostname if different from IP and no hostRef
    if (server.hostname && server.hostname !== server.ip && !server.hostRef) {
      html += `
            <div class="detail-item">
                <span class="detail-label">Hostname:</span>
                <span class="detail-value">${this.escapeHtml(
                  server.hostname
                )}</span>
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
                <span class="detail-value">${this.escapeHtml(
                  server.version
                )}</span>
            </div>
            `;
    }

    // Machine ID
    if (server.machineId) {
      html += `
            <div class="detail-item">
                <span class="detail-label">Machine ID:</span>
                <span class="detail-value machine-id">${this.escapeHtml(
                  server.machineId
                )}</span>
            </div>
            `;
    }

    // Services
    if (server.services && server.services.length > 0) {
      html += `
            <div class="detail-item">
                <span class="detail-label">Services:</span>
                <div class="services-list">
                    ${server.services
                      .map(
                        (service) =>
                          `<span class="service-badge">${this.escapeHtml(
                            service
                          )}</span>`
                      )
                      .join("")}
                </div>
            </div>
            `;
    } // Show information
    if (server.dirShow) {
      const showName =
        typeof server.dirShow === "string"
          ? server.dirShow.replace(".watch", "").replace(/^[^_]*_/, "") // Remove UUID prefix and .watch extension
          : server.dirShow.name || "Unnamed Show";

      html += `
            <div class="detail-item">
                <span class="detail-label">Director Show:</span>
                <span class="detail-value">${this.escapeHtml(showName)}</span>
            </div>
            `;
    }

    if (server.runShow) {
      const runShowName =
        typeof server.runShow === "string"
          ? server.runShow.replace(".watch", "").replace(/^[^_]*_/, "")
          : server.runShow.name || "Unnamed Show";

      html += `
            <div class="detail-item">
                <span class="detail-label">Running Show:</span>
                <span class="detail-value">${this.escapeHtml(
                  runShowName
                )}</span>
            </div>
            `;
    }

    // Capabilities
    if (server.capabilities) {
      const capabilities = [];
      if (server.capabilities.wo7) capabilities.push("WO7");
      if (server.capabilities.wo6) capabilities.push("WO6");
      if (server.capabilities.artnet) capabilities.push("Art-Net");
      if (server.capabilities.osc) capabilities.push("OSC");
      if (server.capabilities.webui) capabilities.push("Web UI");

      if (capabilities.length > 0) {
        html += `
                <div class="detail-item">
                    <span class="detail-label">Capabilities:</span>
                    <div class="capabilities-list">
                        ${capabilities
                          .map(
                            (cap) =>
                              `<span class="capability-badge">${cap}</span>`
                          )
                          .join("")}
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
                    ${server.interfaces
                      .map(
                        (iface) =>
                          `<div class="interface-item">
                            <span class="interface-ip">${this.escapeHtml(
                              iface[0]
                            )}</span>
                            <span class="interface-mac">${this.escapeHtml(
                              iface[1]
                            )}</span>
                        </div>`
                      )
                      .join("")}
                </div>
            </div>
            `;
    }

    // License status
    if (server.licensed !== undefined) {
      html += `
            <div class="detail-item">
                <span class="detail-label">Licensed:</span>
                <span class="license-status ${
                  server.licensed ? "licensed" : "unlicensed"
                }">
                    ${server.licensed ? "✓ Licensed" : "✗ Unlicensed"}
                </span>
            </div>
            `;
    }

    // Time sync
    if (server.woTime !== undefined) {
      html += `
            <div class="detail-item">
                <span class="detail-label">Time Sync:</span>
                <span class="detail-value">${
                  server.woTime ? "Enabled" : "Disabled"
                }</span>
            </div>
            `;
    }

    return html;
  }
  escapeHtml(unsafe) {
    if (typeof unsafe !== "string") return unsafe;
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  isValidIpAddress(ip) {
    // Basic IP address validation - no leading zeros allowed
    if (!ip || typeof ip !== 'string') return false;
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/;
    return ipRegex.test(ip.trim());
  }
  log(message) {
    console.log(`[WatchoutApp] ${message}`);
  }
  cleanup() {
    this.stopBackgroundScanning();
    
    // Cancel any ongoing connection tests
    if (this.connectionTestAbortController) {
      this.connectionTestAbortController.abort();
      this.connectionTestAbortController = null;
    }
    
    // Clear any scheduled connection test timeouts
    if (this.connectionTestTimeoutId) {
      clearTimeout(this.connectionTestTimeoutId);
      this.connectionTestTimeoutId = null;
    }
    
    // Clear any pending status updates
    if (this.statusUpdateTimeout) {
      clearTimeout(this.statusUpdateTimeout);
      this.statusUpdateTimeout = null;
    }
  }

  createServerItem(server) {
    const item = document.createElement("div");
    item.className = "server-item";

    const serverId = this.getServerId(server);
    item.dataset.serverId = serverId;

    // Check if this item should be selected
    if (this.selectedServerId === serverId) {
      item.classList.add("selected");
    }

    // Use hostRef as the primary name, fallback to hostname or IP
    const serverName =
      server.hostRef || server.hostname || server.ip || "Unknown Server";

    // Truncate long names for sidebar
    const displayName =
      serverName.length > 25 ? serverName.substring(0, 22) + "..." : serverName;

    // Determine simplified type
    const simplifiedType = this.getSimplifiedServerType(server);
    // Determine status info
    const isOnline = server.status === "online";
    let statusText = isOnline ? "Online" : "Offline";
    let statusClass = isOnline ? "online" : "offline";
    // Override for manual servers
    if (server.isManual && isOnline) {
      statusText = "Manual";
      statusClass = "manual";
    }

    // Build manual server actions if this is a manual server
    let manualActions = "";
    if (server.isManual) {
      manualActions = `
                <div class=\"manual-server-actions\">
                    <button class=\"manual-edit-btn\" title=\"Edit server\" data-server-id=\"${serverId}\"> 
                        <img src=\"../assets/pen-field.svg\" alt=\"Edit\" class=\"icon\">
                    </button>
                    <button class=\"manual-remove-btn\" title=\"Remove server\" data-server-id=\"${serverId}\"> 
                        <img src=\"../assets/trash.svg\" alt=\"Remove\" class=\"icon\">
                    </button>
                </div>
            `;
    }

    item.innerHTML = `
            <div class="server-item-content">
                <div class="server-item-name">${this.escapeHtml(
                  displayName
                )}</div>
                <div class="server-item-details">
                    <div class="server-item-ip">${this.escapeHtml(
                      server.ip
                    )}</div>
                    <div class="server-item-type">${this.escapeHtml(
                      simplifiedType
                    )}</div>
                    <div class="server-item-status">
                        <div class="status-indicator ${statusClass}"></div>
                        <span class="status-text">${statusText}</span>
                    </div>
                </div>
                ${manualActions}
            </div>
        `;

    // Add click event listener for server selection
    item.addEventListener("click", () => {
      this.selectServer(serverId);
    });

    // Add event listeners for manual server action buttons
    if (server.isManual) {
      const editBtn = item.querySelector('.manual-edit-btn');
      const removeBtn = item.querySelector('.manual-remove-btn');
      
      if (editBtn) {
        editBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.editManualServer(serverId);
        });
      }
      
      if (removeBtn) {
        removeBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.removeManualServer(serverId);
        });
      }
    }

    return item;
  }
  getServerId(server) {
    // Create a unique identifier for the server
    const ports = server.ports && server.ports.length > 0 ? server.ports.join(",") : "manual";
    return `${server.ip}:${ports}`;
  }

  getSimplifiedServerType(server) {
    // Simplify server types for sidebar display
    if (server.type.includes("Production")) return "Production";
    if (server.type.includes("Director")) return "Director";
    if (server.type.includes("Display")) return "Display";
    if (server.type.includes("Asset Manager")) return "Asset Manager";
    if (server.type.includes("Watchout")) return "Watchout Server";
    return "Server";
  }

  // Server-specific command state management
  getServerCommandState(serverId) {
    if (!this.serverCommandStates.has(serverId)) {
      this.serverCommandStates.set(serverId, {
        connectionStatus: false,
        connectionMessage: "Not connected",
        commandHistory: [],
        lastConnectionTest: null,
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
    if (typeof result === "object") {
      resultText = JSON.stringify(result, null, 2);
    } else {
      resultText = result.toString();
    }

    const responseItem = {
      type,
      command,
      commandName,
      result: resultText,
      timestamp,
    };

    state.commandHistory.unshift(responseItem);

    // Limit to last 10 responses per server
    if (state.commandHistory.length > 10) {
      state.commandHistory.pop();
    }

    this.updateServerCommandState(serverId, state);
  }  selectServer(serverId) {
    // Prevent rapid-fire server selection
    if (this.lastServerSelectTime && (Date.now() - this.lastServerSelectTime) < 500) {
      console.log('Server selection throttled - please wait before selecting another server');
      return;
    }
    this.lastServerSelectTime = Date.now();

    // Update selected server
    const previouslySelected = this.selectedServerId;
    this.selectedServerId = serverId;

    // Find the selected server to get its IP
    const selectedServer = this.servers.find(
      (server) => this.getServerId(server) === serverId
    );
    this.selectedServerIp = selectedServer ? selectedServer.ip : null;    // Reset timeline selector when switching servers
    this.resetTimelineSelector();

    // Hide status information area when switching servers
    this.hideStatusInformation();

    // Update sidebar selection visual state
    const serverItems = document.querySelectorAll(".server-item");
    serverItems.forEach((item) => {
      if (item.dataset.serverId === serverId) {
        item.classList.add("selected");
      } else {
        item.classList.remove("selected");
      }
    });

    // Show/hide commands area in the commands panel
    this.updateCommandsVisibility();

    // Load server-specific command state
    if (this.selectedServerId && this.selectedServerIp) {
      this.loadServerCommandsUI(this.selectedServerId);
    }

    // Re-render main content to show selected server
    this.renderMainContent();    // Test API connection for the selected server with delay to prevent rapid requests
    if (this.selectedServerIp && selectedServer?.status === "online") {
      // Cancel any pending connection test
      if (this.connectionTestTimeoutId) {
        clearTimeout(this.connectionTestTimeoutId);
      }
      
      // Schedule connection test with delay
      this.connectionTestTimeoutId = setTimeout(() => {
        this.testApiConnection(selectedServer);
        this.connectionTestTimeoutId = null;
      }, 750); // 750ms delay to prevent rapid connection tests
    }

    console.log("Selected server:", serverId, "IP:", this.selectedServerIp);
  }
  updateCommandsVisibility() {
    const noServerSelected = document.getElementById("noServerSelected");
    const commandsArea = document.getElementById("commandsArea");

    if (this.selectedServerId && this.selectedServerIp) {
      noServerSelected.style.display = "none";
      commandsArea.style.display = "block";
    } else {
      noServerSelected.style.display = "flex";
      commandsArea.style.display = "none";
    }
  }

  loadServerCommandsUI(serverId) {
    const commandState = this.getServerCommandState(serverId);

    // Update connection status
    this.updateConnectionStatus(
      commandState.connectionStatus,
      commandState.connectionMessage
    );

    // Update command history
    this.renderCommandHistory(commandState.commandHistory);

    // Update panel header to show server name
    this.updateCommandsPanelHeader(serverId);
  }
  updateCommandsPanelHeader(serverId) {
    const selectedServer = this.servers.find(
      (server) => this.getServerId(server) === serverId
    );
    const serverName = selectedServer
      ? selectedServer.hostRef || selectedServer.hostname || selectedServer.ip
      : "Unknown Server";

    const panelHeader = document.querySelector(
      "#commandsPanel .panel-header h3"
    );
    if (panelHeader) {
      panelHeader.textContent = `Commands - ${serverName}`;
    }
  }
  renderCommandHistory(history) {
    const responseContent = document.getElementById("responseContent");

    // Clear existing content
    responseContent.innerHTML = "";

    if (history.length === 0) {
      const noResponse = document.createElement("div");
      noResponse.className = "no-response";
      noResponse.textContent = "No commands executed yet";
      responseContent.appendChild(noResponse);
      return;
    }    // Add each response item
    history.forEach((item) => {
      const responseItem = document.createElement("div");
      responseItem.className = `response-item ${item.type}`;

      // Standard response display (no special handling for status commands)
      responseItem.innerHTML = `
        <div class="response-timestamp">${item.timestamp}</div>
        <div class="response-command">${item.commandName}</div>
        <div class="response-data">${this.escapeHtml(item.result)}</div>
      `;

      responseContent.appendChild(responseItem);
    });
  }async testApiConnection(server) {
    if (!server && !this.selectedServerIp) return false;
    
    const serverIp = server?.ip || this.selectedServerIp;
    if (!serverIp) return false;
    
    try {
      // Cancel any ongoing connection test
      if (this.connectionTestAbortController) {
        this.connectionTestAbortController.abort();
      }
      
      // Create new abort controller for this test
      this.connectionTestAbortController = new AbortController();
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection test timeout')), this.connectionTestTimeout);
      });
      
      // Create API test promise
      const apiTestPromise = this.api.watchoutTestConnection(serverIp);
      
      // Race between timeout and API test
      const result = await Promise.race([apiTestPromise, timeoutPromise]);
      
      this.log(`API connection test for ${serverIp}: ${result.connected ? 'SUCCESS' : 'FAILED'}`);
      
      // Update connection status if this is for the currently selected server
      if (serverIp === this.selectedServerIp) {
        this.updateConnectionStatus(result.connected, result.message);
      }
      
      return result.connected || false;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        this.log(`Connection test aborted for ${serverIp}`);
        return false;
      }
      this.log(`API connection test error for ${serverIp}: ${error.message}`);
      
      // Update connection status if this is for the currently selected server
      if (serverIp === this.selectedServerIp) {
        this.updateConnectionStatus(false, "Connection test failed");
      }
      
      return false;
    } finally {
      this.connectionTestAbortController = null;
    }
  }  updateConnectionStatus(connected, message) {
    const connectionStatus = document.getElementById("connectionStatus");
    const statusIndicator = document.getElementById("apiStatusIndicator");
    const statusText = document.getElementById("apiStatusText");

    this.apiConnectionStatus = connected;

    // Update server-specific state with debouncing
    if (this.selectedServerId) {
      // Cancel any pending status update
      if (this.statusUpdateTimeout) {
        clearTimeout(this.statusUpdateTimeout);
      }
      
      // Schedule status update with slight delay to prevent rapid updates
      this.statusUpdateTimeout = setTimeout(() => {
        this.updateServerCommandState(this.selectedServerId, {
          connectionStatus: connected,
          connectionMessage: message || (connected ? "API Connected" : "API Not Available"),
          lastConnectionTest: new Date().toISOString(),
        });
        this.statusUpdateTimeout = null;
      }, 100);
    }

    // Update UI elements safely
    if (connectionStatus) {
      if (connected) {
        connectionStatus.className = "connection-status connected";
        if (statusText) statusText.textContent = "API Connected";
      } else {
        connectionStatus.className = "connection-status error";
        if (statusText) statusText.textContent = message || "API Not Available";
      }
    }

    // Enable/disable command buttons based on connection
    this.updateCommandButtonStates();
  }
  updateCommandButtonStates() {
    const commandButtons = document.querySelectorAll(".command-btn");
    const timelineSelector = document.getElementById("timelineSelector");
    const hasTimelineSelected = timelineSelector && timelineSelector.value;

    commandButtons.forEach((button) => {
      if (button.id === "testConnectionBtn") {
        // Test connection button is always enabled when server is selected
        button.disabled = !this.selectedServerIp;
      } else if (["playBtn", "pauseBtn", "stopBtn"].includes(button.id)) {
        // Timeline control buttons require API connection AND timeline selection
        button.disabled = !this.apiConnectionStatus || !hasTimelineSelected;

        // Update button titles to show requirements
        if (!this.apiConnectionStatus) {
          button.title = "Connect to server first";
        } else if (!hasTimelineSelected) {
          button.title = "Select a timeline first";
        } else {
          button.title =
            button.querySelector("span:last-child")?.textContent || "";
        }
      } else {
        // Other command buttons require API connection
        button.disabled = !this.apiConnectionStatus;
      }
    });
  }

  async executeCommand(commandType) {
    if (!this.selectedServerIp) {
      this.addCommandResponse("error", commandType, "No server selected");
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    let result;

    try {
      this.setCommandButtonLoading(commandType, true);
      switch (commandType) {
        case "play":
          const playTimelineId = this.getSelectedTimelineId();
          result = await this.api.watchoutPlayTimeline(
            this.selectedServerIp,
            playTimelineId
          );
          if (result.success) {
            result.timelineContext = `Timeline ID: ${playTimelineId}`;
          }
          break;
        case "pause":
          const pauseTimelineId = this.getSelectedTimelineId();
          result = await this.api.watchoutPauseTimeline(
            this.selectedServerIp,
            pauseTimelineId
          );
          if (result.success) {
            result.timelineContext = `Timeline ID: ${pauseTimelineId}`;
          }
          break;
        case "stop":
          const stopTimelineId = this.getSelectedTimelineId();
          result = await this.api.watchoutStopTimeline(
            this.selectedServerIp,
            stopTimelineId
          );
          if (result.success) {
            result.timelineContext = `Timeline ID: ${stopTimelineId}`;
          }
          break;        case "status":
          result = await this.api.watchoutGetStatus(this.selectedServerIp);
          if (result.success && result.data) {
            result.isStatusResponse = true;
            // Also get timelines for name cross-reference
            try {
              const timelinesResult = await this.api.watchoutGetTimelines(this.selectedServerIp);
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
        case "timelines":
          result = await this.api.watchoutGetTimelines(this.selectedServerIp);
          // Populate timeline selector with the results
          if (result.success && result.data) {
            this.populateTimelineSelector(result.data);
          }
          break;
        case "show":
          result = await this.api.watchoutSaveShow(this.selectedServerIp);
          break;
        case "uploadShow":
          result = await this.api.watchoutUploadShow(this.selectedServerIp);
          break;
        case "testConnection":
          result = await this.api.watchoutTestConnection(this.selectedServerIp);
          this.updateConnectionStatus(result.connected, result.message);
          break;
        default:
          throw new Error(`Unknown command: ${commandType}`);
      }

      this.addCommandResponse(
        result.success ? "success" : "error",
        commandType,
        result
      );

      // After transport commands, auto-refresh status
      if (result?.success && ["play", "pause", "stop"].includes(commandType)) {
        // slight delay to let state settle on the server
        setTimeout(() => {
          try { this.executeCommand("status"); } catch (e) { /* noop */ }
        }, 400);
      }
    } catch (error) {
      this.addCommandResponse("error", commandType, { error: error.message });
    } finally {
      this.setCommandButtonLoading(commandType, false);
    }
  }
  setCommandButtonLoading(commandType, loading) {
    const buttonMap = {
      play: "playBtn",
      pause: "pauseBtn",
      stop: "stopBtn",
      status: "statusBtn",
      timelines: "timelinesBtn",
      show: "showBtn",
      uploadShow: "uploadShowBtn",
      testConnection: "testConnectionBtn",
    };

    const buttonId = buttonMap[commandType];
    const button = document.getElementById(buttonId);

    if (button) {
      button.disabled = loading;
      const icon = button.querySelector(".cmd-icon");

      if (icon) {
        if (loading) {
          // Store full HTML so we can always restore (covers img/svg/emoji)
          if (!button.dataset.originalIconHtml) {
            button.dataset.originalIconHtml = icon.innerHTML;
          }
          icon.innerHTML = "⏳";
        } else {
          if (button.dataset.originalIconHtml) {
            icon.innerHTML = button.dataset.originalIconHtml;
            delete button.dataset.originalIconHtml;
          }
        }
      }
    }
  }
  addCommandResponse(type, command, result) {
    // Add to server-specific command history
    if (this.selectedServerId) {
      this.addCommandToServerHistory(
        this.selectedServerId,
        type,
        command,
        result
      );

      // Re-render the command history for the current server
      const commandState = this.getServerCommandState(this.selectedServerId);
      this.renderCommandHistory(commandState.commandHistory);
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
      testConnection: "🔗 Test Connection",
      custom: "⚙️ Custom Command",
    };
    return commandNames[command] || command;
  }  clearCommandResponse() {
    // Clear server-specific command history
    if (this.selectedServerId) {
      this.updateServerCommandState(this.selectedServerId, {
        commandHistory: [],
      });

      // Re-render the empty command history
      this.renderCommandHistory([]);
      
      // Hide status information area when clearing responses
      this.hideStatusInformation();
    }
  }  showCustomCommandDialog() {
    const modal = document.getElementById("customCommandModal");
    modal.style.display = "flex";
    modal.classList.add("show");

    // Bind modal events
    this.bindCustomCommandModal();

    // Clear previous values
    document.getElementById("customEndpoint").value = "";
    document.getElementById("customMethod").value = "GET";
    document.getElementById("customData").value = "";

    // Focus on endpoint input
    setTimeout(() => {
      document.getElementById("customEndpoint").focus();
    }, 100);
  }
  bindCustomCommandModal() {
    const modal = document.getElementById("customCommandModal");
    const closeBtn = document.getElementById("closeCustomModal");
    const cancelBtn = document.getElementById("cancelCustomCommand");
    const executeBtn = document.getElementById("executeCustomCommand");
    const examplesSelect = document.getElementById("endpointExamples");
    const endpointInput = document.getElementById("customEndpoint");
    const methodSelect = document.getElementById("customMethod");

    // Handle example selection
    examplesSelect.onchange = () => {
      const selectedEndpoint = examplesSelect.value;
      if (selectedEndpoint) {
        endpointInput.value = selectedEndpoint;
        // Set appropriate method based on endpoint
        if (
          selectedEndpoint.includes("/play/") ||
          selectedEndpoint.includes("/pause/") ||
          selectedEndpoint.includes("/stop/") ||
          selectedEndpoint.includes("/jump-to-")
        ) {
          methodSelect.value = "POST";
        } else {
          methodSelect.value = "GET";
        }        examplesSelect.value = ""; // Reset dropdown
      }
    };

    // Close modal handlers
    const closeModal = () => {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.style.display = "none";
      }, 300);
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
      if (e.key === "Enter") {
        this.executeCustomCommand();
        closeModal();
      }
    };
  }

  async executeCustomCommand() {
    if (!this.selectedServerIp) {
      this.addCommandResponse("error", "custom", "No server selected");
      return;
    }

    const endpoint = document.getElementById("customEndpoint").value.trim();
    const method = document.getElementById("customMethod").value;
    const dataText = document.getElementById("customData").value.trim();

    if (!endpoint) {
      this.addCommandResponse("error", "custom", "Endpoint is required");
      return;
    }

    let requestData = null;
    if (dataText && method !== "GET") {
      try {
        requestData = JSON.parse(dataText);
      } catch (error) {
        this.addCommandResponse(
          "error",
          "custom",
          "Invalid JSON data: " + error.message
        );
        return;
      }
    }

    try {
      // Create a custom request using the WatchoutCommands sendRequest method
      const result = await this.sendCustomWatchoutRequest(
        endpoint,
        method,
        requestData
      );
      this.addCommandResponse(
        result.success ? "success" : "error",
        "custom",
        result
      );
    } catch (error) {
      this.addCommandResponse("error", "custom", { error: error.message });
    }
  }
  async sendCustomWatchoutRequest(endpoint, method, data) {
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
        error: error.message,
      };
    }
  }

  // Timeline Selection Methods
  getSelectedTimelineId() {
    const selector = document.getElementById("timelineSelector");
    const selectedValue = selector?.value;
    return selectedValue ? parseInt(selectedValue) : 0;
  }
  populateTimelineSelector(timelinesData) {
    const selector = document.getElementById("timelineSelector");
    const timelineInfo = document.getElementById("timelineInfo");
    const timelineList = document.getElementById("timelineList");

    if (!selector) return;

    // Clear existing options
    selector.innerHTML = '<option value="">Select a timeline...</option>';

    // Clear timeline list
    if (timelineList) {
      timelineList.innerHTML = "";
    }

    let timelines = [];

    // Handle various response formats
    if (Array.isArray(timelinesData)) {
      timelines = timelinesData;
    } else if (
      timelinesData &&
      timelinesData.timelines &&
      Array.isArray(timelinesData.timelines)
    ) {
      timelines = timelinesData.timelines;
    } else if (timelinesData && typeof timelinesData === "object") {
      // Try to extract timeline names/IDs from object
      timelines = Object.entries(timelinesData).map(([key, value]) => ({
        id: key,
        name: value || `Timeline ${key}`,
      }));
    }

    // Store timelines data for later use
    this.availableTimelines = timelines;

    // Populate selector options
    timelines.forEach((timeline, index) => {
      const option = document.createElement("option");

      if (typeof timeline === "string") {
        option.value = index;
        option.textContent = timeline;
      } else if (timeline && typeof timeline === "object") {
        option.value = timeline.id !== undefined ? timeline.id : index;
        option.textContent =
          timeline.name || timeline.title || `Timeline ${option.value}`;
      }

      selector.appendChild(option);
    });

    // Populate timeline list display
    this.populateTimelineList(timelines);

    // Enable selector if we have timelines
    if (timelines.length > 0) {
      selector.disabled = false;
      if (timelineInfo) {
        timelineInfo.style.display = "block";
        this.updateTimelineInfo();
      }
    } else {
      selector.disabled = true;
      if (timelineInfo) {
        timelineInfo.style.display = "none";
      }
    }

    this.updateCommandButtonStates();
  }

  populateTimelineList(timelines) {
    const timelineList = document.getElementById("timelineList");

    if (!timelineList) return;

    // Clear existing items
    timelineList.innerHTML = "";

    if (!timelines || timelines.length === 0) {
      const noTimelinesItem = document.createElement("div");
      noTimelinesItem.className = "timeline-list-item no-timelines";
      noTimelinesItem.textContent = "No timelines available";
      timelineList.appendChild(noTimelinesItem);
      return;
    }

    // Create timeline list items
    timelines.forEach((timeline, index) => {
      const item = document.createElement("div");
      item.className = "timeline-list-item";

      let timelineId, timelineName;

      if (typeof timeline === "string") {
        timelineId = index;
        timelineName = timeline;
      } else if (timeline && typeof timeline === "object") {
        timelineId = timeline.id !== undefined ? timeline.id : index;
        timelineName =
          timeline.name || timeline.title || `Timeline ${timelineId}`;
      }

      item.textContent = `${timelineId}: ${timelineName}`;
      item.dataset.timelineId = timelineId;

      // Add click handler to select timeline
      item.addEventListener("click", () => {
        const selector = document.getElementById("timelineSelector");
        if (selector) {
          selector.value = timelineId;
          this.onTimelineSelectionChange();
        }
      });

      timelineList.appendChild(item);
    });
  }
  resetTimelineSelector() {
    const selector = document.getElementById("timelineSelector");
    const timelineInfo = document.getElementById("timelineInfo");
    const timelineList = document.getElementById("timelineList");

    if (selector) {
      selector.innerHTML = '<option value="">Load timelines first...</option>';
      selector.disabled = true;
    }

    if (timelineList) {
      timelineList.innerHTML =
        '<div class="timeline-list-item no-timelines">No timelines loaded</div>';
    }

    if (timelineInfo) {
      timelineInfo.style.display = "none";
    }

    // Clear stored timelines
    this.availableTimelines = [];

    this.updateCommandButtonStates();
  }

  onTimelineSelectionChange() {
    this.updateTimelineInfo();
    this.updateCommandButtonStates();
  }
  updateTimelineInfo() {
    const selector = document.getElementById("timelineSelector");
    const timelineList = document.getElementById("timelineList");

    if (!selector || !timelineList) return;

    const selectedValue = selector.value;

    // Update timeline list items to show selection
    const timelineItems = timelineList.querySelectorAll(".timeline-list-item");
    timelineItems.forEach((item) => {
      if (item.dataset.timelineId === selectedValue && selectedValue !== "") {
        item.classList.add("selected");
      } else {
        item.classList.remove("selected");
      }
    });
  }
  // Settings Modal Methods
  showSettingsDialog() {
    const modal = document.getElementById("settingsModal");
    modal.style.display = "flex";
    modal.classList.add("show");

    // Load current settings values
    this.loadCurrentSettings();

    // Bind modal events
    this.bindSettingsModal();

    // Focus on first input
    setTimeout(() => {
      const firstCheckbox = document.getElementById("enableCacheFromDisk");
      if (firstCheckbox) firstCheckbox.focus();
    }, 100);
  }

  async loadCurrentSettings() {
    try {
      // Load settings from the main process
      const settings = await this.api.getAppSettings();

      // Update cache from disk checkbox
      const enableCacheFromDisk = document.getElementById(
        "enableCacheFromDisk"
      );
      if (enableCacheFromDisk) {
        enableCacheFromDisk.checked = settings.enableCacheFromDisk !== false; // default to true
      }

      // Update web server checkbox
      const enableWebServer = document.getElementById("enableWebServer");
      if (enableWebServer) {
        enableWebServer.checked = settings.enableWebServer !== false; // default to true
      }

      // Update dark mode toggle
      const enableDarkMode = document.getElementById('enableDarkMode');
      if (enableDarkMode) {
        const dark = settings.enableDarkMode === true;
        enableDarkMode.checked = dark;
        this.setDarkMode(dark);
      }

      // Update web server status
      await this.updateWebServerStatus();

      // Update app version in settings
      const settingsVersion = document.getElementById("settingsVersion");
      if (settingsVersion) {
        const version = await this.api.getAppVersion();
        settingsVersion.textContent = version;
      }

      // Update cache file location
      const cacheFileLocation = document.getElementById("cacheFileLocation");
      if (cacheFileLocation) {
        const cacheLocation = await this.api.getCacheFileLocation();
        cacheFileLocation.textContent = cacheLocation || "Default location";
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  async updateWebServerStatus() {
    try {
      const webServerStatus = document.getElementById("webServerStatus");
      if (webServerStatus) {
        const status = await this.api.getWebServerStatus();
        webServerStatus.textContent = status.running ? "Running" : "Stopped";
        webServerStatus.className = `status-indicator-text ${
          status.running ? "online" : "offline"
        }`;
      }
    } catch (error) {
      const webServerStatus = document.getElementById("webServerStatus");
      if (webServerStatus) {
        webServerStatus.textContent = "Unknown";
        webServerStatus.className = "status-indicator-text unknown";
      }
    }
  }

  bindSettingsModal() {
    const modal = document.getElementById("settingsModal");
    const closeBtn = document.getElementById("closeSettingsModal");
    const cancelBtn = document.getElementById("cancelSettings");    const saveBtn = document.getElementById("saveSettings");

    // Close modal handlers
    const closeModal = () => {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.style.display = "none";
      }, 300);
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
    };    // Update web server status when checkbox changes
    const enableWebServer = document.getElementById("enableWebServer");
    if (enableWebServer) {
      enableWebServer.onchange = () => {
        // Update status immediately to show expected state
        this.updateWebServerStatus();
      };
    }
  }

  async saveSettings() {
    try {
      const enableCacheFromDisk = document.getElementById(
        "enableCacheFromDisk"
      );
      const enableWebServer = document.getElementById("enableWebServer");
      const enableDarkMode = document.getElementById('enableDarkMode');

      const settings = {
        enableCacheFromDisk: enableCacheFromDisk
          ? enableCacheFromDisk.checked
          : true,
        enableWebServer: enableWebServer ? enableWebServer.checked : true,
        enableDarkMode: enableDarkMode ? enableDarkMode.checked : false,
      };

      // Save settings to main process
      await this.api.saveAppSettings(settings);

      // Update web server status after saving
      setTimeout(() => {
        this.updateWebServerStatus();
      }, 500);

      console.log("Settings saved successfully");

      // Apply theme immediately
      this.setDarkMode(settings.enableDarkMode === true);
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  }  // Add Server Modal Methods
  showAddServerDialog() {
    try {
      console.log('showAddServerDialog called');
      const modal = document.getElementById("addServerModal");
      if (!modal) {
        console.error('Add server modal not found');
        return;
      }
        console.log('Setting modal display to flex and adding show class');
      modal.style.display = "flex";
      modal.classList.add("show");

      // Bind modal events
      this.bindAddServerModal();      // Clear previous values
      const serverIpInput = document.getElementById("serverIp");
      const serverNameInput = document.getElementById("serverName");
      const serverTypeSelect = document.getElementById("serverType");
      
      if (serverIpInput) serverIpInput.value = "";
      if (serverNameInput) serverNameInput.value = "";
      if (serverTypeSelect) serverTypeSelect.value = "Manual Entry";

      // Add listener for server type changes to auto-configure server names
      if (serverTypeSelect) {
        serverTypeSelect.addEventListener('change', (e) => {
          if (e.target.value === 'Loki Log Server') {
            if (serverNameInput && !serverNameInput.value) {
              serverNameInput.value = "Loki Log Server";
            }
          }
        });
      }

      // Focus on IP input
      setTimeout(() => {
        if (serverIpInput) {
          serverIpInput.focus();
          console.log('Focused on server IP input');
        }
      }, 100);
      
      console.log('Add server dialog opened successfully');
    } catch (error) {
      console.error('Error opening add server dialog:', error);
    }
  }
  bindAddServerModal() {
    const modal = document.getElementById("addServerModal");
    const closeBtn = document.getElementById("closeAddServerModal");
    const cancelBtn = document.getElementById("cancelAddServer");
    const saveBtn = document.getElementById("saveAddServer");
    const form = document.getElementById("addServerForm");

    // Remove any existing event listeners to prevent duplicates
    if (closeBtn && closeBtn._boundCloseHandler) {
      closeBtn.removeEventListener('click', closeBtn._boundCloseHandler);
    }
    if (cancelBtn && cancelBtn._boundCancelHandler) {
      cancelBtn.removeEventListener('click', cancelBtn._boundCancelHandler);
    }
    if (saveBtn && saveBtn._boundSaveHandler) {
      saveBtn.removeEventListener('click', saveBtn._boundSaveHandler);
    }    if (modal && modal._boundOverlayHandler) {
      modal.removeEventListener('click', modal._boundOverlayHandler);
    }

    // Close modal handlers
    const closeModal = () => {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.style.display = "none";
      }, 300); // Wait for CSS animation to complete
    };

    // Bind new event handlers and store references
    if (closeBtn) {
      closeBtn._boundCloseHandler = closeModal;
      closeBtn.onclick = closeModal;
    }
    
    if (cancelBtn) {
      cancelBtn._boundCancelHandler = closeModal;
      cancelBtn.onclick = closeModal;
    }

    // Close on overlay click
    if (modal) {
      modal._boundOverlayHandler = (e) => {
        if (e.target === modal) {
          closeModal();
        }
      };
      modal.onclick = modal._boundOverlayHandler;
    }
    
    // Save server
    if (saveBtn) {
      saveBtn._boundSaveHandler = async () => {
        if (form && form.checkValidity()) {
          const modal = document.getElementById("addServerModal");
          const isEditing = modal.dataset.editingServerId;

          if (isEditing) {
            await this.updateManualServer(isEditing);
          } else {
            await this.addManualServer();
          }

          // Reset modal state
          delete modal.dataset.editingServerId;
          const modalTitle = modal.querySelector(".modal-header h3");
          if (modalTitle) modalTitle.textContent = "Add Server Manually";
          if (saveBtn) saveBtn.textContent = "Add Server";

          closeModal();
        } else {
          // Show validation errors
          if (form) form.reportValidity();
        }
      };      saveBtn.onclick = saveBtn._boundSaveHandler;
    }

    // Add server on Enter key in IP field
    const serverIpInput = document.getElementById("serverIp");
    if (serverIpInput) {
      // Remove existing handler if any
      if (serverIpInput._boundEnterHandler) {
        serverIpInput.removeEventListener('keydown', serverIpInput._boundEnterHandler);
      }
      
      serverIpInput._boundEnterHandler = (e) => {
        if (e.key === "Enter" && form && form.checkValidity()) {
          const modal = document.getElementById("addServerModal");
          const isEditing = modal.dataset.editingServerId;

          if (isEditing) {
            this.updateManualServer(isEditing);
          } else {
            this.addManualServer();
          }

          // Reset modal state
          delete modal.dataset.editingServerId;
          const modalTitle = modal.querySelector(".modal-header h3");
          if (modalTitle) modalTitle.textContent = "Add Server Manually";
          if (saveBtn) saveBtn.textContent = "Add Server";

          closeModal();
        }
      };
      serverIpInput.onkeydown = serverIpInput._boundEnterHandler;
    }
  }  async addManualServer() {
    try {
      const modal = document.getElementById("addServerModal");
      const editingServerId = modal?.dataset.editingServerId;
      const isEditing = !!editingServerId;

      const serverIp = document.getElementById("serverIp").value.trim();
      const serverName = document.getElementById("serverName").value.trim();
      const serverType = document.getElementById("serverType").value;

      // Validate IP address
      if (!this.isValidIpAddress(serverIp)) {
        this.showToast({ title: 'Invalid IP Address', message: 'Please enter a valid IP address (e.g., 192.168.1.100).', severity: 'warning' });
        return;
      }

      if (isEditing) {
        // Handle editing existing server
        await this.updateManualServer(editingServerId);
        
        // Reset modal state
        const modalTitle = modal.querySelector(".modal-header h3");
        const saveButton = document.getElementById("saveAddServer");
        if (modalTitle) modalTitle.textContent = "Add Server Manually";
        if (saveButton) saveButton.textContent = "Add Server";
        delete modal.dataset.editingServerId;
        
        return;
      }

      // Ports are now hardcoded in the backend (3040, 3041, 3042, 3022)
      // No need to parse or validate ports from user input      // Create server object (ports will be set by backend)
      const manualServer = {
        ip: serverIp,
        hostname: serverName || serverIp,
        type: serverType,
        ports: [3040, 3041, 3042, 3022], // Standard Watchout ports + Loki
        discoveryMethod: "manual",
        status: "online", // Manual servers are always considered online
        isManual: true, // Flag to identify manual servers
        discoveredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        firstDiscoveredAt: new Date().toISOString(),
      };

      // Check if server already exists
      const serverId = this.getServerId(manualServer);
      const existingServer = this.servers.find(
        (server) => this.getServerId(server) === serverId
      );

      if (existingServer) {
        // Update existing server with manual flag
        existingServer.isManual = true;
        existingServer.status = "online";
        existingServer.type = serverType;
        existingServer.hostname = serverName || existingServer.hostname;
        this.updateScanStatus(
          `Updated existing server: ${serverName || serverIp}`
        );
      } else {
        // Add new manual server
        this.servers.push(manualServer);
        this.updateScanStatus(`Added manual server: ${serverName || serverIp}`);
      }

      // Save to backend cache (optional - manual servers persist in memory)
      try {
        await this.api.addManualServer(manualServer);
      } catch (error) {
        console.warn("Could not save manual server to backend:", error);
        // Continue anyway - manual servers work in memory
      }

      // Update UI
      this.updateUI();

      // Auto-select the newly added server
      this.selectedServerId = serverId;
      this.selectedServerIp = serverIp;

      console.log("Manual server added successfully:", manualServer);
    } catch (error) {
      console.error("Error adding manual server:", error);
      this.showToast({ title: 'Add Server Failed', message: 'Please check the details and try again.', severity: 'error' });
    }
  }
  async updateManualServer(serverId) {
    try {      const serverIp = document.getElementById("serverIp").value.trim();
      const serverName = document.getElementById("serverName").value.trim();
      const serverType = document.getElementById("serverType").value;

      // Validate IP address
      if (!this.isValidIpAddress(serverIp)) {
        this.showToast({ title: 'Invalid IP Address', message: 'Please enter a valid IP address (e.g., 192.168.1.100).', severity: 'warning' });
        return;
      }

      // Ports are now hardcoded in the backend (3040, 3041, 3042, 3022)
      // No need to parse or validate ports from user input

      // Create updated server object
      const updatedServerData = {
        ip: serverIp,
        hostname: serverName || serverIp,
        type: serverType,
        discoveryMethod: "manual",
        status: "online",
        isManual: true,
      };

      // Update server in backend
      const result = await this.api.updateManualServer(
        serverId,
        updatedServerData
      );

      if (result.success) {
        // Update local servers array
        const serverIndex = this.servers.findIndex(        (s) => this.getServerId(s) === serverId
        );
        if (serverIndex !== -1) {
          // Preserve existing metadata while updating with new data
          this.servers[serverIndex] = {
            ...this.servers[serverIndex],
            ...updatedServerData,
            lastSeenAt: new Date().toISOString(),
          };

          // Update selected server IP if this server is currently selected
          if (this.selectedServerId === serverId) {
            this.selectedServerIp = serverIp;
          }
        }

        // Update UI
        this.updateUI();

        this.updateScanStatus(
          `Updated manual server: ${serverName || serverIp}`
        );
        console.log("Manual server updated successfully:", updatedServerData);
      } else {
        console.error("Failed to update manual server:", result.error);
        this.showToast({ title: 'Update Failed', message: String(result.error || 'Unknown error'), severity: 'error' });
      }
    } catch (error) {
      console.error("Error updating manual server:", error);
      this.showToast({ title: 'Update Failed', message: 'Please check the details and try again.', severity: 'error' });
    }
  }

  editManualServer(serverId) {
    // Find the server to edit
    const server = this.servers.find((s) => this.getServerId(s) === serverId);
    if (!server || !server.isManual) {
      console.error("Server not found or not a manual server:", serverId);
      return;
    }

    try {
      console.log('editManualServer called for serverId:', serverId);
      const modal = document.getElementById("addServerModal");
      if (!modal) {
        console.error('Add server modal not found');
        return;
      }

      // Set modal to editing mode
      modal.dataset.editingServerId = serverId;

      // Update modal title and button text for editing
      const modalTitle = modal.querySelector(".modal-header h3");
      if (modalTitle) modalTitle.textContent = "Edit Server";
      
      const saveBtn = document.getElementById("saveAddServer");
      if (saveBtn) saveBtn.textContent = "Update Server";

      // Populate form fields with existing server data
      const serverIpInput = document.getElementById("serverIp");
      const serverNameInput = document.getElementById("serverName");
      const serverTypeSelect = document.getElementById("serverType");
      
      if (serverIpInput) serverIpInput.value = server.ip || "";
      if (serverNameInput) serverNameInput.value = server.hostname || "";
      if (serverTypeSelect) serverTypeSelect.value = server.type || "Manual Entry";

      // Show the modal
      modal.style.display = "flex";
      modal.classList.add("show");

      // Bind modal events
      this.bindAddServerModal();

      // Focus on IP input
      setTimeout(() => {
        if (serverIpInput) {
          serverIpInput.focus();
          serverIpInput.select(); // Select all text for easy editing
          console.log('Focused on server IP input for editing');
        }
      }, 100);
      
      console.log('Edit server dialog opened successfully for server:', server);
    } catch (error) {
      console.error('Error opening edit server dialog:', error);
    }
  }

  async removeManualServer(serverId) {
    // Find the server to remove
    const server = this.servers.find((s) => this.getServerId(s) === serverId);
    if (!server || !server.isManual) {
      console.error("Server not found or not a manual server:", serverId);
      return;
    }

    // Confirm removal
    const serverName = server.hostname || server.ip;
    const confirmed = await this.confirmToast(
      `Are you sure you want to remove the manual server "${serverName}"?`,
      { title: 'Remove Server', okLabel: 'Remove', cancelLabel: 'Cancel', severity: 'warning' }
    );
    if (!confirmed) return;

    try {
      // Remove from backend
      const result = await this.api.removeManualServer(serverId);

      if (result.success) {
        // Remove from local servers array
        this.servers = this.servers.filter(
          (s) => this.getServerId(s) !== serverId
        );

        // Clear selection if removed server was selected
        if (this.selectedServerId === serverId) {
          this.selectedServerId = null;
          this.selectedServerIp = null;
        }

        // Update UI
        this.updateUI();

        this.updateScanStatus(`Removed manual server: ${serverName}`);
        console.log("Manual server removed successfully:", serverName);
      } else {
        console.error("Failed to remove manual server:", result.error);
        this.showToast({ title: 'Remove Failed', message: String(result.error || 'Unknown error'), severity: 'error' });
      }
    } catch (error) {
      console.error("Error removing manual server:", error);
      this.showToast({ title: 'Remove Failed', message: 'Failed to remove server. Please try again.', severity: 'error' });
    }
  }

  // ==================== LOKI LOG VIEWER METHODS ====================
    showLokiLogViewer() {
    // Enhanced server selection validation
    if (!this.selectedServerIp) {
      this.showToast({ title: 'No Server Selected', message: 'Select a server first before opening the log viewer.', severity: 'info' });
      return;
    }
    
    // Additional validation to ensure the selected server exists
    const selectedServer = this.servers.find(
      (server) => this.getServerId(server) === this.selectedServerId
    );
    
    if (!selectedServer) {
      this.showToast({ title: 'Server Not Found', message: 'Refresh the server list and try again.', severity: 'error' });
      return;
    }
    
    console.log(`Opening Loki Log Viewer for server: ${this.selectedServerIp} (${selectedServer.hostname || selectedServer.ip})`);
      // Check if this server has Loki port (3022) configured
    const hasLokiPort = selectedServer.ports && selectedServer.ports.includes(3022);
    if (!hasLokiPort) {
      console.warn(`Port 3022 not detected during scan for ${this.selectedServerIp}. Loki may not be running or may be on a different system.`);
      
      // Show a less intrusive notification instead of blocking the user
      const notification = document.createElement('div');
      notification.className = 'notification warning';
      notification.innerHTML = `
        <div class="notification-content">
          <strong>⚠️ Loki Port Not Detected</strong><br>
          Port 3022 wasn't found during the network scan for this server.<br>
          <small>Loki may be running on a different system or port. You can still try to connect.</small>
        </div>
        <button onclick="this.parentElement.remove()" class="notification-close">×</button>
      `;
      
      // Add notification to the modal body when it's created
      setTimeout(() => {
       
        const modalBody = document.querySelector('.log-viewer-modal .modal-body');
        if (modalBody) {
          modalBody.insertBefore(notification, modalBody.firstChild);
          // Auto-remove after 8 seconds
          setTimeout(() => {
            if (notification.parentElement) {
              notification.remove();
            }
          }, 8000);
        }
      }, 100);
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
              <label for="lokiAppSelect">App:</label>
              <select id="lokiAppSelect">
                <option value="__all__">All apps</option>
              </select>
            </div>
            <div class="control-group" style="flex: 1;">
              <label for="logQuery">Manual Query:</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <input type="text" id="logQuery" placeholder="{app=~\".+\"}" style="flex:1;">
                <button id="queryLogsBtn" class="btn btn-primary">Query Logs</button>
              </div>
            </div>
            <div class="control-group">
              <label for="logLimit">Limit:</label>
              <input type="number" id="logLimit" value="200" min="10" max="5000" style="width:100px;">
            </div>
            <div class="control-group">
              <label for="logSince">Since:</label>
              <select id="logSince" style="width:140px;">
                <option value="5m">5 minutes</option>
                <option value="15m">15 minutes</option>
                <option value="1h" selected>1 hour</option>
                <option value="3h">3 hours</option>
                <option value="6h">6 hours</option>
                <option value="12h">12 hours</option>
                <option value="24h">24 hours</option>
              </select>
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
            </div>            <div id="logStreamControls">
              <label class="toggle-label">
                <input type="checkbox" id="streamToggle">
                <span class="toggle-switch"></span>
                <span class="toggle-text">Enable Live Streaming</span>
              </label>
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
                <label class="toggle-label" title="Toggle auto-scroll">
                  <input type="checkbox" id="autoScrollLogs" checked>
                  <span class="toggle-switch"></span>
                  <span class="toggle-text">Auto-scroll</span>
                </label>
              </div>
            </div>
            <div id="logContainer" class="log-container">
              <div class="log-placeholder">
                No logs to display. Click "Query Logs" or enable live streaming to begin.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;    document.body.appendChild(modal);
    
    // Show the modal
    modal.style.display = "flex";
    modal.classList.add("show");
    // Overlay click closes modal
    const overlayEl = modal.querySelector('.modal-overlay');
    if (overlayEl) {
      overlayEl.addEventListener('click', () => {
        modal.remove();
      });
    }
    
    this.setupLokiLogViewer();
  }
  async initializeTheme() {
    try {
      if (this.api && this.api.getAppSettings) {
        const settings = await this.api.getAppSettings();
        const dark = settings.enableDarkMode === true;
        this.setDarkMode(dark);
      }
    } catch (e) {
      this.setDarkMode(false);
    }
  }
  setDarkMode(enabled) {
    const cls = document.body.classList;
    if (enabled) {
      cls.add('dark-mode');
    } else {
      cls.remove('dark-mode');
    }
  }

  async setupLokiLogViewer() {
    // Close button (match settings modal behavior)
    const closeBtn = document.getElementById('closeLogViewerModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const modalEl = closeBtn.closest('.modal');
        if (modalEl) modalEl.remove();
      });
    }
    const streamToggle = document.getElementById('streamToggle');
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    const exportLogsBtn = document.getElementById('exportLogsBtn');
    const appSelect = document.getElementById('lokiAppSelect');
    const queryBtn = document.getElementById('queryLogsBtn');
    const queryInput = document.getElementById('logQuery');

    if (streamToggle) {
      streamToggle.addEventListener('change', () => this.toggleLokiStream());
    }
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => this.clearLogViewer());
    }
    if (exportLogsBtn) {
      exportLogsBtn.addEventListener('click', () => this.exportLogs());
    }

    if (this.api.isElectron) {
      window.electronAPI.onLokiLogs((logs) => this.displayLogs(logs));
      window.electronAPI.onLokiError((error) => this.displayLogError(error));
      window.electronAPI.onLokiStreamStarted(() => this.updateStreamStatus(true));
      window.electronAPI.onLokiStreamStopped(() => this.updateStreamStatus(false));
    }

    // Populate selector from Loki labels: prefer 'app', fallback to 'job'
    const populateLabelValues = async (label) => {
      try {
        const valuesResult = await this.api.lokiGetLabelValues(this.selectedServerIp, label);
        if (valuesResult.success && Array.isArray(valuesResult.data) && valuesResult.data.length > 0) {
          this.lokiLabelKey = label;
          appSelect.innerHTML = '';
          const allOpt = document.createElement('option');
          allOpt.value = '__all__';
          allOpt.textContent = label === 'app' ? 'All apps' : 'All jobs';
          appSelect.appendChild(allOpt);
          valuesResult.data.forEach((val) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            appSelect.appendChild(opt);
          });
          return true;
        }
      } catch (err) {
        console.warn(`Failed to load Loki label values for ${label}:`, err);
      }
      return false;
    };

    if (!(await populateLabelValues('app'))) {
      await populateLabelValues('job');
    }

    if (appSelect) {
      appSelect.addEventListener('change', async () => {
        const toggle = document.getElementById('streamToggle');
        // Update manual query input to reflect current selection, if empty or previously auto-set
        if (queryInput && (!queryInput.dataset.userEdited || queryInput.value.trim() === '')) {
          queryInput.value = this.getSelectedAppQuery();
        }
        if (toggle && toggle.checked) {
          await this.stopLokiStream();
          await this.startLokiStream();
        }
      });
    }

    // Tenant input removed

    // Initialize manual query with selected app query
    if (queryInput && (!queryInput.value || queryInput.value.trim() === '')) {
      queryInput.value = this.getSelectedAppQuery();
    }
    // Track user edits so we don't overwrite manual input on app changes
    if (queryInput) {
      queryInput.addEventListener('input', () => {
        queryInput.dataset.userEdited = 'true';
      });
    }
    if (queryBtn) {
      queryBtn.addEventListener('click', () => this.queryLokiLogs());
    }

    // Bind auto-scroll checkbox to state
    const autoScrollEl = document.getElementById('autoScrollLogs');
    if (autoScrollEl) {
      // initialize from DOM
      this.autoScrollEnabled = !!autoScrollEl.checked;
      autoScrollEl.addEventListener('change', () => {
        this.autoScrollEnabled = !!autoScrollEl.checked;
      });
    }

    this.testLokiConnection();
  }
  async testLokiConnection() {
    // Validate server selection
    if (!this.selectedServerIp) {
      const statusElement = document.getElementById('lokiConnectionStatus');
      const statusText = statusElement.querySelector('.status-text');
      statusElement.className = 'connection-status error';
      statusText.textContent = 'Error: No server selected';
      return;
    }
    
    const statusElement = document.getElementById('lokiConnectionStatus');
    const statusText = statusElement.querySelector('.status-text');
    
    statusText.textContent = `Testing connection to ${this.selectedServerIp}:3022...`;
    statusElement.className = 'connection-status testing';

    try {
      console.log(`Testing Loki connection to: ${this.selectedServerIp}`);
      const result = await this.api.lokiTestConnection(this.selectedServerIp);
      
      console.log('Loki connection test result:', result);
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
      console.error('Loki connection test error:', error);
      statusElement.className = 'connection-status error';
      statusText.textContent = `Error: ${error.message}`;
    }
  }
  async queryLokiLogs() {
    // Manual or selected App query snapshot with defaults
    const manual = (document.getElementById('logQuery')?.value || '').trim();
    const query = manual || this.getSelectedAppQuery();
    const limit = parseInt(document.getElementById('logLimit')?.value, 10) || 200; // default snapshot size
    const since = document.getElementById('logSince')?.value || '1h';
    // Clear previous logs so only this query's results show
    this.clearLogViewer();
    try {
      const result = await this.api.lokiQueryLogs(this.selectedServerIp, query, limit, since);
      if (result.success) {
        if (Array.isArray(result.data) && result.data.length === 0) {
          this.showLogPlaceholder('No logs to show for the specified timeframe.');
          this.updateLogStats();
        } else {
          this.displayLogs(result.data);
        }
      } else {
        this.displayLogError(result.error);
      }
    } catch (error) {
      this.displayLogError(error.message);
    }
  }
  async toggleLokiStream() {
    const streamToggle = document.getElementById('streamToggle');
    const isStreaming = streamToggle.checked;
    
    if (isStreaming) {
      await this.startLokiStream();
    } else {
      await this.stopLokiStream();
    }
  }  async startLokiStream() {
    const query = this.getSelectedAppQuery();
    const refreshInterval = 2000; // 2 seconds

    const streamToggle = document.getElementById('streamToggle');
    
    // Disable toggle during operation
    streamToggle.disabled = true;

    try {
      const result = await this.api.lokiStartStream(this.selectedServerIp, query, refreshInterval);
      
      if (result.success) {
        this.updateStreamStatus(true);
        
        // Keep toggle checked
        streamToggle.checked = true;
        streamToggle.disabled = false;
      } else {
        this.displayLogError(result.error);
        // Uncheck toggle on failure
        streamToggle.checked = false;
        streamToggle.disabled = false;
      }
    } catch (error) {
      this.displayLogError(error.message);
      // Uncheck toggle on error
      streamToggle.checked = false;
      streamToggle.disabled = false;
    }
  }  async stopLokiStream() {
    const streamToggle = document.getElementById('streamToggle');
    
    // Disable toggle during operation
    streamToggle.disabled = true;

    try {
      const result = await this.api.lokiStopStream(this.selectedServerIp);
      
      if (result.success) {
        this.updateStreamStatus(false);
        
        // Uncheck toggle
        streamToggle.checked = false;
        streamToggle.disabled = false;
      }
    } catch (error) {
      this.displayLogError(error.message);
    } finally {
      if (streamToggle.disabled) {
        streamToggle.disabled = false;
      }
    }
  }

  getSelectedAppQuery() {
    const appSelect = document.getElementById('lokiAppSelect');
    const value = appSelect ? appSelect.value : '__all__';
    const label = this.lokiLabelKey || 'app';
    if (!value || value === '__all__') return `{${label}=~".+"}`;
    const escaped = String(value).replace(/"/g, '\\"');
    return `{${label}="${escaped}"}`;
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
    if (!container) return;
    const autoScroll = this.autoScrollEnabled;
    
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
    if (!container) return;
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
    if (!container) return;
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
    if (!container) return;
    this.showLogPlaceholder('Logs cleared. Enable live streaming to begin.');
    this.updateLogStats();
    // Keep scroll at top on clear if auto-scroll disabled
    if (!this.autoScrollEnabled) {
      container.scrollTop = 0;
    }
  }

  showLogPlaceholder(message) {
    const container = document.getElementById('logContainer');
    if (!container) return;
    container.innerHTML = `<div class="log-placeholder">${this.escapeHtml(message)}</div>`;
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
  initializeStartupWarnings() {
    try {
      console.log("Renderer: Initializing startup warnings...");
      // Set up startup warning listener if in Electron environment
      if (this.api && this.api.onStartupWarning) {
        console.log("Renderer: Setting up startup warning listener...");
        this.api.onStartupWarning((notification) => {
          console.log('Renderer: Received startup warning:', notification);
          this.showStartupToast(notification);
        });
        
        console.log("Startup warning listeners initialized");
      } else {
        console.log("Startup warnings not available (probably in web mode)");
      }
    } catch (error) {
      console.error('Error initializing startup warnings:', error);
    }
  }
  showStartupWarning(notification) { this.showStartupToast(notification); }

  showStartupToast(notification) {
    try {
      const container = document.getElementById('toastContainer') || this.ensureToastContainer();
      const toast = document.createElement('div');
      const severity = notification.severity || 'warning';
      toast.className = `toast ${severity}`;

      const icon = document.createElement('div');
      icon.className = 'toast-icon';
      icon.textContent = notification.icon || (severity === 'warning' ? '⚠️' : 'ℹ️');

      const content = document.createElement('div');
      content.className = 'toast-content';
      const title = document.createElement('div');
      title.className = 'toast-title';
      title.textContent = notification.title || 'Startup Warning';
      const message = document.createElement('div');
      message.className = 'toast-message';
      message.textContent = notification.message || 'An issue was detected during startup.';
      content.appendChild(title);
      content.appendChild(message);

      const close = document.createElement('button');
      close.className = 'toast-close';
      close.innerHTML = '&times;';
      close.onclick = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200);
      };

      // Optional primary action if provided
      if (notification.actions && notification.actions.length > 0) {
        const actions = document.createElement('div');
        actions.className = 'toast-actions';
        notification.actions.forEach(action => {
          const btn = document.createElement('button');
          btn.className = action.primary ? 'btn btn-primary btn-sm' : 'btn btn-sm';
          btn.textContent = action.label;
          btn.onclick = () => this.handleStartupWarningAction(action.id, notification);
          actions.appendChild(btn);
        });
        content.appendChild(actions);
      }

      toast.appendChild(icon);
      toast.appendChild(content);
      toast.appendChild(close);
      container.appendChild(toast);

      // Trigger animation
      setTimeout(() => toast.classList.add('show'), 10);
      // Auto-dismiss after 6s
      setTimeout(() => {
        if (toast.isConnected) {
          toast.classList.remove('show');
          setTimeout(() => toast.remove(), 200);
        }
      }, 6000);
    } catch (error) {
      console.error('Error showing startup toast:', error);
    }
  }

  ensureToastContainer() {
    const el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  }

  // Generic toast helper
  showToast({ title = 'Notice', message = '', severity = 'info', icon = '', actions = [], duration = 6000 } = {}) {
    try {
      const container = document.getElementById('toastContainer') || this.ensureToastContainer();
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
    } catch (e) {
      console.error('showToast failed', e);
    }
  }

  confirmToast(message, { title = 'Please Confirm', okLabel = 'OK', cancelLabel = 'Cancel', severity = 'warning' } = {}) {
    return new Promise((resolve) => {
      this.showToast({
        title,
        message,
        severity,
        actions: [
          { label: cancelLabel, onClick: () => resolve(false) },
          { label: okLabel, primary: true, onClick: () => resolve(true) },
        ],
        duration: 0,
      });
    });
  }

  async handleStartupWarningAction(actionId, notification) {
    try {
      console.log('Handling startup warning action:', actionId, notification.type);

      switch (actionId) {
        case 'refresh':
          // Refresh the startup checks
          this.hideStartupWarning();
          await this.performStartupChecksManually();
          break;
          
        case 'retry':
          // Retry the operation (for port conflicts, etc.)
          this.hideStartupWarning();
          await this.performStartupChecksManually();
          break;
          
        case 'continue':
          // Continue anyway - just dismiss the warning
          this.hideStartupWarning();
          if (this.api && this.api.dismissStartupWarning) {
            await this.api.dismissStartupWarning(notification.type);
          }
          break;
          
        case 'ok':
        default:
          // Default action - just dismiss
          this.hideStartupWarning();
          if (this.api && this.api.dismissStartupWarning) {
            await this.api.dismissStartupWarning(notification.type);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling startup warning action:', error);
      this.hideStartupWarning(); // Always hide on error
    }
  }

  async performStartupChecksManually() {
    try {
      if (this.api && this.api.performStartupChecks) {
        const result = await this.api.performStartupChecks();
        if (result.success && result.result) {
          // Check if there are still warnings
          if (result.result.warnings && result.result.warnings.length > 0) {
            // Show first warning again
            const notification = this.createNotificationFromCheck(result.result);
            if (notification) {
              setTimeout(() => this.showStartupWarning(notification), 500);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error performing manual startup checks:', error);
    }
  }

  createNotificationFromCheck(checkResult) {
    // This mimics the backend logic for creating notifications
    if (!checkResult.warnings || checkResult.warnings.length === 0) {
      return null;
    }

    // Prioritize Watchout running warning
    const watchoutWarning = checkResult.warnings.find(w => w.type === 'watchout-running');
    if (watchoutWarning) {
      return {
        type: 'watchout-running',
        title: watchoutWarning.title,
        message: watchoutWarning.message,
        icon: '⚠️',
        actions: [
          { id: 'refresh', label: 'Refresh Check', primary: true },
          { id: 'continue', label: 'Continue', secondary: true }
        ],
        severity: 'info'
      };
    }

    // Handle port conflicts
    const portWarning = checkResult.warnings.find(w => w.type === 'port-occupied');
    if (portWarning) {
      return {
        type: 'port-occupied',
        title: portWarning.title,
        message: portWarning.message,
        icon: '🔌',
        actions: [
          { id: 'retry', label: 'Retry', primary: true },
          { id: 'continue', label: 'Continue', secondary: true }
        ],
        severity: 'warning'
      };
    }

    // Handle multicast port warnings
    const multicastWarning = checkResult.warnings.find(w => w.type === 'multicast-port-occupied');
    if (multicastWarning) {
      return {
        type: 'multicast-port-occupied',
        title: multicastWarning.title,
        message: multicastWarning.message,
        icon: '🔌',
        actions: [
          { id: 'ok', label: 'OK', primary: true }
        ],
        severity: 'info'
      };
    }

    // Handle other warnings
    if (checkResult.warnings.length > 0) {
      const warning = checkResult.warnings[0];
      return {
        type: warning.type,
        title: warning.title,
        message: warning.message,
        icon: '⚠️',
        actions: [
          { id: 'ok', label: 'OK', primary: true }
        ],
        severity: warning.severity || 'info'
      };
    }

    return null;
  }  hideStartupWarning() {
    try {
      const modal = document.getElementById('startupWarningModal');
      if (modal) {
        modal.classList.remove('show');
        // Wait for animation to complete before hiding
        setTimeout(() => {
          modal.style.display = 'none';
          // Ensure no interference with other elements
          modal.style.visibility = 'hidden';
          modal.style.opacity = '0';
        }, 300);
        console.log('Startup warning modal hidden');
      }
    } catch (error) {
      console.error('Error hiding startup warning:', error);
    }
  }

  async waitForDOMElements() {
    const requiredElements = [
      'scanButton',
      'serverList',
      'serversContainer',
      'settingsButton'
    ];

    const maxAttempts = 50; // 5 seconds total
    let attempts = 0;

    while (attempts < maxAttempts) {
      const missingElements = requiredElements.filter(id => !document.getElementById(id));
      
      if (missingElements.length === 0) {
        console.log('All required DOM elements found');
        return;
      }

      console.log(`Waiting for DOM elements: ${missingElements.join(', ')}`);
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    throw new Error(`Required DOM elements not found: ${requiredElements.filter(id => !document.getElementById(id)).join(', ')}`);
  }

  handleInitializationError(error) {
    // Show error message in UI
    const container = document.getElementById('serversContainer');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #ff4444;">
          <h3>Application Startup Error</h3>
          <p>The application failed to initialize properly.</p>
          <p>Error: ${error.message}</p>
          <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px;">
            Restart Application
          </button>
        </div>
      `;
    }
  }

  async performStartupDiagnostics() {
    console.log('=== Startup Diagnostics ===');
    console.log('Document ready state:', document.readyState);
    console.log('Window loaded:', document.readyState === 'complete');
    
    // Check for required DOM elements
    const requiredElements = [
      'scanButton', 'serverList', 'serversContainer', 'settingsButton',
      'minimizeBtn', 'maximizeBtn', 'closeBtn'
    ];
    
    requiredElements.forEach(id => {
      const element = document.getElementById(id);
      console.log(`Element ${id}:`, element ? 'Found' : 'Missing');
    });

    // Check API availability
    console.log('Window electronAPI:', typeof window.electronAPI);
    console.log('ApiAdapter available:', typeof ApiAdapter !== 'undefined');
    
    // Check for JavaScript errors
    window.addEventListener('error', (event) => {
      console.error('JavaScript error during startup:', event.error);
    });

    console.log('=== End Diagnostics ===');
  }  renderStatusVisualization(statusData) {
    if (!statusData || !statusData.data) return null;

    const data = statusData.data;
    const timelinesReference = statusData.timelinesReference;
    
    // Create status visualization container
    const statusContainer = document.createElement("div");
    statusContainer.className = "status-visualization";

    // Title
    const title = document.createElement("h4");
    title.className = "status-title";
    title.textContent = "Playback Status";
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

    statusContainer.appendChild(sectionsContainer);

    // Add raw data toggle
    const rawDataToggle = this.createRawDataToggle(statusData);
    statusContainer.appendChild(rawDataToggle);

    return statusContainer;
  }
  createTimelineStatusSection(data, timelinesReference) {
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
  }
  createRendererStatusSection(data) {
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
  }
  updateServerDetailsWithStatus(statusResult) {
    if (!this.selectedServerId || !statusResult.success || !statusResult.data) {
      return;
    }

    // Find the status information area in the commands panel
    const statusInformationArea = document.getElementById('statusInformationArea');
    const statusContent = document.getElementById('statusContent');
    
    if (!statusInformationArea || !statusContent) {
      return;
    }

    // Show the status information area; animate only the first time
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
      statusContent.appendChild(statusVisualization);
    }
  }

  hideStatusInformation() {
    const statusInformationArea = document.getElementById('statusInformationArea');
    if (statusInformationArea) {
      statusInformationArea.style.display = 'none';
    }
  }

  // Add ripple effect animation to buttons (no-op to remove visual effect)
  addRippleEffect(button) {
    // This method intentionally does nothing to remove the ripple effect
    // while keeping the function signature intact for compatibility
  }
}

// Initialize the app when DOM is ready
let app;

document.addEventListener('DOMContentLoaded', () => {
  try {
    console.log('DOM loaded, initializing app...');
    app = new WatchoutServerFinderApp();
    console.log('WatchoutServerFinderApp initialized successfully');
  } catch (error) {
    console.error('Failed to initialize WatchoutServerFinderApp:', error);
    // Show error message to user
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: fixed; top: 20px; left: 20px; background: #ff4444; color: white; padding: 10px; border-radius: 5px; z-index: 9999;';
    errorDiv.textContent = 'Application failed to start. Please restart the application.';
    document.body.appendChild(errorDiv);
  }
});

// Handle app cleanup on window unload
window.addEventListener('beforeunload', () => {
  if (app && typeof app.cleanup === 'function') {
    app.cleanup();
  }
});

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

/**
 * UIManager - Handles UI updates and rendering
 */
class UIManager {
  constructor(app) {
    this.app = app;
  }

  updateUI() {
    this.renderSidebar();
    this.updateServerCounts();
    this.updateClearOfflineButtonState();
    this.renderMainContent();
    if (this.app.commandManager) {
      this.app.commandManager.updateCommandsVisibility();
    }
  }

  renderSidebar() {
    const serverList = document.getElementById("serverList");
    const noServersSidebar = document.getElementById("noServersSidebar");

    if (this.app.servers.length === 0) {
      noServersSidebar.style.display = "flex";
      // Clear selection when no servers
      this.app.selectedServerId = null;
      // Remove any existing server items
      const existingItems = serverList.querySelectorAll(".server-item");
      existingItems.forEach((item) => item.remove());
      return;
    }

    noServersSidebar.style.display = "none";

    // Sort servers: online first, offline below
    const onlineServers = this.app.servers.filter(
      (server) => server.status === "online"
    );
    const offlineServers = this.app.servers.filter(
      (server) => server.status === "offline"
    );

    // Auto-select first server if none selected or selected server no longer exists
    // Prioritize online servers, fallback to offline servers
    let autoSelected = false;
    if (
      !this.app.selectedServerId ||
      !this.app.servers.some((s) => this.app.getServerId(s) === this.app.selectedServerId)
    ) {
      const firstServer =
        onlineServers.length > 0 ? onlineServers[0] : offlineServers[0];
      if (firstServer) {
        this.app.selectedServerId = this.app.getServerId(firstServer);
        this.app.selectedServerIp = firstServer.ip;
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
    });

    // Add divider if there are both online and offline servers
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
    if (autoSelected && this.app.selectedServerIp && onlineServers.length > 0) {
      setTimeout(() => this.app.testApiConnection(), 100);
    }
  }

  createServerItem(server) {
    const item = document.createElement("div");
    item.className = "server-item";

    const serverId = this.app.getServerId(server);
    item.dataset.serverId = serverId;

    // Check if this item should be selected
    if (this.app.selectedServerId === serverId) {
      item.classList.add("selected");
    }

    // Use hostRef as the primary name, fallback to hostname or IP
    const serverName =
      server.hostRef || server.hostname || server.ip || "Unknown Server";

    // Truncate long names for sidebar
    const displayName =
      serverName.length > 25 ? serverName.substring(0, 22) + "..." : serverName;

    // Determine simplified type
    const simplifiedType = this.app.getSimplifiedServerType(server);
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
        <div class="manual-server-actions">
          <button class="manual-edit-btn" title="Edit server" data-server-id="${serverId}">
            ✏️
          </button>
          <button class="manual-remove-btn" title="Remove server" data-server-id="${serverId}">
            🗑️
          </button>
        </div>
      `;
    }

    item.innerHTML = `
      <div class="server-item-content">
        <div class="server-item-name">${this.app.escapeHtml(displayName)}</div>
        <div class="server-item-details">
          <div class="server-item-ip">${this.app.escapeHtml(server.ip)}</div>
          <div class="server-item-type">${this.app.escapeHtml(simplifiedType)}</div>
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
      this.app.selectServer(serverId);
    });

    // Add event listeners for manual server action buttons
    if (server.isManual) {
      const editBtn = item.querySelector('.manual-edit-btn');
      const removeBtn = item.querySelector('.manual-remove-btn');
      
      if (editBtn) {
        editBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.app.serverManager.editManualServer(serverId);
        });
      }
      
      if (removeBtn) {
        removeBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.app.serverManager.removeManualServer(serverId);
        });
      }
    }

    return item;
  }



  updateServerCounts() {
    const count = this.app.servers.length;

    // Update sidebar server count
    const serverCountSidebar = document.getElementById("serverCountSidebar");
    if (serverCountSidebar) {
      serverCountSidebar.textContent = count.toString();
    }
  }

  updateClearOfflineButtonState() {
    const clearOfflineButton = document.getElementById("clearOfflineButton");
    const offlineCount = this.app.servers.filter(s => s.status === 'offline').length;
    
    if (clearOfflineButton) {
      clearOfflineButton.disabled = offlineCount === 0;
    }
  }

  updateScanStatus(message) {
    const statusElement = document.getElementById("scanStatus");
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  updateConnectionStatus(connected, message) {
    const statusElement = document.getElementById('connectionStatus');
    const indicatorElement = document.getElementById('apiStatusIndicator');
    const textElement = document.getElementById('apiStatusText');

    if (statusElement) {
      statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    }

    if (indicatorElement) {
      indicatorElement.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
    }

    if (textElement) {
      textElement.textContent = message || (connected ? 'Connected' : 'Disconnected');
    }
  }

  updateCommandButtonStates() {
    const hasServer = !!this.app.selectedServerId;
    const hasTimeline = this.app.getSelectedTimelineId() !== null;
    const isConnected = this.app.apiConnectionStatus;

    // Timeline-dependent commands
    const timelineDependentCommands = ['startTimelineBtn', 'pauseTimelineBtn', 'stopTimelineBtn', 'gotoTimeBtn'];
    timelineDependentCommands.forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.disabled = !hasServer || !hasTimeline || !isConnected;
      }
    });

    // Server-dependent commands (don't need timeline)
    const serverDependentCommands = ['standByBtn', 'onlineBtn', 'loadBtn', 'statusBtn', 'getTimelinesBtn', 'customBtn', 'lokiLogViewerBtn'];
    serverDependentCommands.forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.disabled = !hasServer || !isConnected;
      }
    });
  }

  // Helper method for rendering status visualization
  renderStatusVisualization(statusData) {
    if (!statusData || !statusData.data) return null;

    const data = statusData.data;
    const timelinesReference = statusData.timelinesReference;
    
    const statusContainer = document.createElement("div");
    statusContainer.className = "status-visualization";

    const title = document.createElement("h4");
    title.className = "status-title";
    title.textContent = "Playback Status";
    statusContainer.appendChild(title);

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

    let timelineStatuses = [];
    let allTimelineIds = new Set();
    
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
    }

    if (timelineStatuses.length > 0) {
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
            <span class="timeline-name">${this.app.escapeHtml(timeline.name)}</span>
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
    rawDataContent.innerHTML = `<pre>${this.app.escapeHtml(JSON.stringify(statusData, null, 2))}</pre>`;

    toggleContainer.appendChild(toggleButton);
    toggleContainer.appendChild(rawDataContent);

    return toggleContainer;
  }

  renderMainContent() {
    const container = document.getElementById("serversContainer");
    const noServers = document.getElementById("noServers");
    const noSelection = document.getElementById("noSelection");

    // Remove any existing server cards
    const existingCards = container.querySelectorAll(".server-card");
    existingCards.forEach((card) => card.remove());

    if (this.app.servers.length === 0) {
      noServers.style.display = "flex";
      noSelection.style.display = "none";
      return;
    }

    noServers.style.display = "none";

    if (!this.app.selectedServerId) {
      noSelection.style.display = "flex";
      return;
    }

    noSelection.style.display = "none";

    // Find and render the selected server
    const selectedServer = this.app.servers.find(
      (server) => this.app.getServerId(server) === this.app.selectedServerId
    );
    if (selectedServer) {
      const serverCard = this.createServerDetailsCard(selectedServer);
      container.appendChild(serverCard);
    }
  }

  createServerDetailsCard(server) {
    const card = document.createElement("div");
    card.className = "server-card";

    const discoveredTime = new Date(server.discoveredAt).toLocaleTimeString();

    // Use hostRef as the primary name, fallback to hostname or IP
    const serverName =
      server.hostRef || server.hostname || server.ip || "Unknown Server";

    // Build detailed info based on server data
    let detailsHtml = this.buildBasicDetails(server);

    // Add Watchout-specific details if available (from JSON response)
    if (server.hostRef || server.machineId || server.services) {
      detailsHtml += this.buildWatchoutDetails(server);
    }

    card.innerHTML = `
      <div class="server-header">
        <div>
          <div class="server-title">${this.app.escapeHtml(serverName)}</div>
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
        <div class="server-type">${this.app.escapeHtml(server.type)}</div>
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
        <span class="detail-value">${this.app.escapeHtml(server.ip)}</span>
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
          <span class="detail-value">${this.app.escapeHtml(server.hostname)}</span>
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
          <span class="detail-value">${this.app.escapeHtml(server.version)}</span>
        </div>
      `;
    }

    // Machine ID
    if (server.machineId) {
      html += `
        <div class="detail-item">
          <span class="detail-label">Machine ID:</span>
          <span class="detail-value machine-id">${this.app.escapeHtml(server.machineId)}</span>
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
                  `<span class="service-badge">${this.app.escapeHtml(service)}</span>`
              )
              .join("")}
          </div>
        </div>
      `;
    }

    // Show information
    if (server.dirShow) {
      const showName =
        typeof server.dirShow === "string"
          ? server.dirShow.replace(".watch", "").replace(/^[^_]*_/, "") // Remove UUID prefix and .watch extension
          : server.dirShow.name || "Unnamed Show";

      html += `
        <div class="detail-item">
          <span class="detail-label">Director Show:</span>
          <span class="detail-value">${this.app.escapeHtml(showName)}</span>
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
          <span class="detail-value">${this.app.escapeHtml(runShowName)}</span>
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

    // License status
    if (server.licensed !== undefined) {
      html += `
        <div class="detail-item">
          <span class="detail-label">License:</span>
          <span class="detail-value license-status ${
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

  // ...existing code...
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIManager;
} else {
  window.UIManager = UIManager;
}

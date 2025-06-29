/**
 * CommandManager - Handles Watchout command execution and timeline operations
 */
class CommandManager {
  constructor(app) {
    this.app = app;
  }

  async executeCommand(commandType) {
    if (!this.app.selectedServerIp) {
      alert('Please select a server first.');
      return;
    }

    // Check if timeline is required for this command
    const timelineCommands = ['run', 'pause', 'halt', 'gotoTime'];
    if (timelineCommands.includes(commandType)) {
      const timelineId = this.app.getSelectedTimelineId();
      if (timelineId === null) {
        alert('Please select a timeline first.');
        return;
      }
    }

    this.setCommandButtonLoading(commandType, true);

    try {
      let result;
      const timelineId = this.app.getSelectedTimelineId();

      switch (commandType) {
        case 'run':
          result = await this.app.api.executeWatchoutCommand(this.app.selectedServerIp, 'run', { timelineId });
          break;
        case 'pause':
          result = await this.app.api.executeWatchoutCommand(this.app.selectedServerIp, 'pause', { timelineId });
          break;
        case 'halt':
          result = await this.app.api.executeWatchoutCommand(this.app.selectedServerIp, 'halt', { timelineId });
          break;
        case 'standBy':
          result = await this.app.api.executeWatchoutCommand(this.app.selectedServerIp, 'standBy');
          break;
        case 'online':
          result = await this.app.api.executeWatchoutCommand(this.app.selectedServerIp, 'online');
          break;
        case 'load':
          result = await this.app.api.executeWatchoutCommand(this.app.selectedServerIp, 'load');
          break;
        case 'gotoTime':
          const time = prompt('Enter time in milliseconds:');
          if (time === null) return;
          result = await this.app.api.executeWatchoutCommand(this.app.selectedServerIp, 'gotoTime', { 
            timelineId, 
            time: parseInt(time) 
          });
          break;
        case 'getStatus':
          result = await this.app.api.executeWatchoutCommand(this.app.selectedServerIp, 'getStatus');
          if (result.success) {
            this.app.updateServerDetailsWithStatus(result);
          }
          break;
        case 'getTimelines':
          result = await this.app.api.executeWatchoutCommand(this.app.selectedServerIp, 'getTimelines');
          if (result.success && result.data) {
            this.app.populateTimelineSelector(result.data);
          }
          break;
        default:
          throw new Error(`Unknown command: ${commandType}`);
      }

      this.addCommandResponse(commandType, this.getCommandDisplayName(commandType), result);

    } catch (error) {
      console.error(`Command ${commandType} error:`, error);
      this.addCommandResponse(commandType, this.getCommandDisplayName(commandType), {
        success: false,
        error: error.message
      });
    } finally {
      this.setCommandButtonLoading(commandType, false);
    }
  }

  async testApiConnection(server) {
    // Cancel any ongoing connection test
    if (this.app.connectionTestAbortController) {
      this.app.connectionTestAbortController.abort();
    }

    // Clear any pending timeout
    if (this.app.connectionTestTimeoutId) {
      clearTimeout(this.app.connectionTestTimeoutId);
      this.app.connectionTestTimeoutId = null;
    }

    // Create new abort controller
    this.app.connectionTestAbortController = new AbortController();

    try {
      this.app.updateConnectionStatus(false, 'Testing connection...');
      
      // Test connection with timeout
      const result = await Promise.race([
        this.app.api.testApiConnection(server.ip),
        new Promise((_, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Connection test timeout'));
          }, this.app.connectionTestTimeout);
          
          // Store timeout ID for cleanup
          this.app.connectionTestTimeoutId = timeoutId;
        })
      ]);

      if (this.app.connectionTestAbortController.signal.aborted) {
        return; // Test was cancelled
      }

      if (result.success) {
        this.app.apiConnectionStatus = true;
        this.app.updateConnectionStatus(true, result.message || 'Connected to Watchout API');
      } else {
        this.app.apiConnectionStatus = false;
        this.app.updateConnectionStatus(false, result.error || 'Connection failed');
      }

    } catch (error) {
      if (this.app.connectionTestAbortController.signal.aborted) {
        return; // Test was cancelled
      }
      
      console.error('API connection test error:', error);
      this.app.apiConnectionStatus = false;
      this.app.updateConnectionStatus(false, `Connection error: ${error.message}`);
    } finally {
      // Clean up
      this.app.connectionTestAbortController = null;
      if (this.app.connectionTestTimeoutId) {
        clearTimeout(this.app.connectionTestTimeoutId);
        this.app.connectionTestTimeoutId = null;
      }
      
      // Update command button states
      this.app.updateCommandButtonStates();
    }
  }

  setCommandButtonLoading(commandType, loading) {
    const buttonMap = {
      'run': 'startTimelineBtn',
      'pause': 'pauseTimelineBtn',
      'halt': 'stopTimelineBtn',
      'standBy': 'standByBtn',
      'online': 'onlineBtn',
      'load': 'loadBtn',
      'gotoTime': 'gotoTimeBtn',
      'getStatus': 'statusBtn',
      'getTimelines': 'getTimelinesBtn'
    };

    const buttonId = buttonMap[commandType];
    if (!buttonId) return;

    const button = document.getElementById(buttonId);
    if (button) {
      button.disabled = loading;
      if (loading) {
        button.classList.add('loading');
        const originalText = button.textContent;
        button.dataset.originalText = originalText;
        button.textContent = 'Loading...';
      } else {
        button.classList.remove('loading');
        const originalText = button.dataset.originalText;
        if (originalText) {
          button.textContent = originalText;
        }
      }
    }
  }

  addCommandResponse(type, command, result) {
    const responseArea = document.getElementById('commandResponse');
    if (!responseArea) return;

    const timestamp = new Date().toLocaleTimeString();
    const responseItem = document.createElement('div');
    responseItem.className = `response-item ${result.success ? 'success' : 'error'}`;
    
    let responseContent;
    if (result.success) {
      if (result.data && typeof result.data === 'object') {
        responseContent = `<pre>${JSON.stringify(result.data, null, 2)}</pre>`;
      } else {
        responseContent = result.message || 'Command executed successfully';
      }
    } else {
      responseContent = result.error || 'Command failed';
    }
    
    responseItem.innerHTML = `
      <div class="response-header">
        <span class="response-command">${command}</span>
        <span class="response-timestamp">${timestamp}</span>
        <span class="response-status ${result.success ? 'success' : 'error'}">
          ${result.success ? '✓' : '✗'}
        </span>
      </div>
      <div class="response-content">${responseContent}</div>
    `;

    responseArea.insertBefore(responseItem, responseArea.firstChild);

    // Limit to last 10 responses
    const items = responseArea.querySelectorAll('.response-item');
    if (items.length > 10) {
      for (let i = 10; i < items.length; i++) {
        items[i].remove();
      }
    }

    // Auto-scroll to top of response area
    responseArea.scrollTop = 0;
  }

  getCommandDisplayName(command) {
    const commandNames = {
      'run': 'Start Timeline',
      'pause': 'Pause Timeline',
      'halt': 'Stop Timeline',
      'standBy': 'Stand By',
      'online': 'Go Online',
      'load': 'Load Show',
      'gotoTime': 'Go to Time',
      'getStatus': 'Get Status',
      'getTimelines': 'Get Timelines'
    };
    return commandNames[command] || command;
  }

  clearCommandResponse() {
    const responseArea = document.getElementById('commandResponse');
    if (responseArea) {
      responseArea.innerHTML = '<div class="response-placeholder">Command responses will appear here</div>';
    }
  }

  // Timeline Selection Methods
  getSelectedTimelineId() {
    const selector = document.getElementById("timelineSelector");
    const selectedValue = selector?.value;
    return selectedValue ? parseInt(selectedValue) : null;
  }

  populateTimelineSelector(timelinesData) {
    const selector = document.getElementById("timelineSelector");
    const timelineList = document.getElementById("timelineList");

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
    } else if (timelinesData.timelines && Array.isArray(timelinesData.timelines)) {
      timelines = timelinesData.timelines;
    } else if (timelinesData.data && Array.isArray(timelinesData.data)) {
      timelines = timelinesData.data;
    }

    // Store timelines data for later use
    this.app.availableTimelines = timelines;

    // Populate selector options
    timelines.forEach((timeline, index) => {
      const option = document.createElement('option');
      option.value = timeline.id !== undefined ? timeline.id : index;
      option.textContent = timeline.name || `Timeline ${timeline.id !== undefined ? timeline.id : index + 1}`;
      selector.appendChild(option);
    });

    // Populate timeline list display
    this.populateTimelineList(timelines);

    // Enable selector if we have timelines
    if (timelines.length > 0) {
      selector.disabled = false;
    } else {
      selector.disabled = true;
    }

    this.app.updateCommandButtonStates();
  }

  populateTimelineList(timelines) {
    const timelineList = document.getElementById("timelineList");

    if (!timelineList) return;

    // Clear existing items
    timelineList.innerHTML = "";

    if (!timelines || timelines.length === 0) {
      timelineList.innerHTML = '<div class="timeline-placeholder">No timelines available</div>';
      return;
    }

    // Create timeline list items
    timelines.forEach((timeline, index) => {
      const timelineItem = document.createElement("div");
      timelineItem.className = "timeline-list-item";
      timelineItem.dataset.timelineId = timeline.id !== undefined ? timeline.id : index;

      timelineItem.innerHTML = `
        <div class="timeline-name">${timeline.name || `Timeline ${timeline.id !== undefined ? timeline.id : index + 1}`}</div>
        <div class="timeline-details">
          ${timeline.id !== undefined ? `<span class="timeline-id">ID: ${timeline.id}</span>` : ''}
          ${timeline.duration ? `<span class="timeline-duration">Duration: ${Math.round(timeline.duration / 1000)}s</span>` : ''}
        </div>
      `;

      // Add click handler for timeline selection
      timelineItem.addEventListener('click', () => {
        const selector = document.getElementById("timelineSelector");
        if (selector) {
          selector.value = timeline.id !== undefined ? timeline.id : index;
          this.app.onTimelineSelectionChange();
        }
      });

      timelineList.appendChild(timelineItem);
    });
  }

  resetTimelineSelector() {
    const selector = document.getElementById("timelineSelector");
    const timelineList = document.getElementById("timelineList");

    if (selector) {
      selector.innerHTML = '<option value="">Select a timeline...</option>';
      selector.disabled = true;
    }

    if (timelineList) {
      timelineList.innerHTML = '<div class="timeline-placeholder">No timelines available</div>';
    }

    // Clear stored timelines
    this.app.availableTimelines = [];

    this.app.updateCommandButtonStates();
  }

  onTimelineSelectionChange() {
    this.updateTimelineInfo();
    this.app.updateCommandButtonStates();
  }

  updateTimelineInfo() {
    const selector = document.getElementById("timelineSelector");
    const timelineList = document.getElementById("timelineList");

    if (!selector || !timelineList) return;

    const selectedValue = selector.value;

    // Update timeline list items to show selection
    const timelineItems = timelineList.querySelectorAll(".timeline-list-item");
    timelineItems.forEach((item) => {
      const timelineId = item.dataset.timelineId;
      if (timelineId === selectedValue) {
        item.classList.add("selected");
      } else {
        item.classList.remove("selected");
      }
    });
  }

  updateCommandsVisibility() {
    const noServerSelected = document.getElementById("noServerSelected");
    const commandsArea = document.getElementById("commandsArea");

    if (this.app.selectedServerId && this.app.selectedServerIp) {
      noServerSelected.style.display = "none";
      commandsArea.style.display = "block";
    } else {
      noServerSelected.style.display = "flex";
      commandsArea.style.display = "none";
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommandManager;
} else {
  window.CommandManager = CommandManager;
}

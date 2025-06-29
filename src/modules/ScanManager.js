/**
 * ScanManager - Handles network scanning operations
 */
class ScanManager {
  constructor(app) {
    this.app = app;
  }

  startBackgroundScanning() {
    this.app.scanInterval = setInterval(() => {
      this.performBackgroundScan();
    }, this.app.scanIntervalMs);

    // Perform initial scan immediately (like the original)
    this.performBackgroundScan();
  }

  stopBackgroundScanning() {
    if (this.app.scanInterval) {
      clearInterval(this.app.scanInterval);
      this.app.scanInterval = null;
    }
  }

  async performBackgroundScan() {
    try {
      if (this.app.backgroundScanEnabled && !this.app.isScanning) {
        const previousCount = this.app.servers.length;
        
        // Perform scan without showing UI updates for background scans
        const result = await this.app.api.scanForServers();
        
        if (result.success) {
          this.app.servers = result.servers || [];
          this.app.updateUI();
          
          // Only show status update if server count changed
          if (this.app.servers.length !== previousCount) {
            const newCount = this.app.servers.length;
            const diff = newCount - previousCount;
            if (diff > 0) {
              this.app.updateScanStatus(`Found ${diff} new server${diff !== 1 ? 's' : ''}`);
            } else if (diff < 0) {
              this.app.updateScanStatus(`${Math.abs(diff)} server${Math.abs(diff) !== 1 ? 's' : ''} went offline`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Background scan error:', error);
    }
  }

  async startManualScan() {
    if (this.app.isScanning) return;

    try {
      this.app.isScanning = true;
      this.app.updateScanButton();
      this.app.updateScanStatus("Scanning for Watchout servers...");

      const result = await this.app.api.scanForServers();

      if (result.success) {
        this.app.servers = result.servers || [];
        this.app.updateUI();
        this.app.updateScanStatus(
          `Scan complete. Found ${this.app.servers.length} server${this.app.servers.length !== 1 ? 's' : ''}.`
        );
      } else {
        this.app.updateScanStatus(`Scan failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Scan error:", error);
      this.app.updateScanStatus(`Scan error: ${error.message}`);
    } finally {
      this.app.isScanning = false;
      this.app.updateScanButton();
    }
  }

  async clearOfflineServers() {
    try {
      const result = await this.app.api.clearOfflineServers();
      if (result.success) {
        // Refresh server list
        const scanResult = await this.app.api.scanForServers();
        if (scanResult.success) {
          this.app.servers = scanResult.servers || [];
          this.app.updateUI();
          this.app.updateScanStatus("Offline servers cleared.");
        }
      } else {
        this.app.updateScanStatus(`Failed to clear offline servers: ${result.error}`);
      }
    } catch (error) {
      console.error("Error clearing offline servers:", error);
      this.app.updateScanStatus(`Error: ${error.message}`);
    }
  }

  updateScanButton() {
    const button = document.getElementById("scanButton");
    if (!button) return;

    if (this.app.isScanning) {
      button.disabled = true;
      button.classList.add("scanning");
    } else {
      button.disabled = false;
      button.classList.remove("scanning");
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScanManager;
} else {
  window.ScanManager = ScanManager;
}

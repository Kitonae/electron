const ProcessDetector = require('./process-detector');

class StartupChecker {
    constructor() {
        this.processDetector = new ProcessDetector();
    }

    /**
     * Perform comprehensive startup checks
     * @param {number} webServerPort - The port the web server will use
     * @returns {Promise<{success: boolean, warnings: Array, errors: Array}>}
     */    async performStartupChecks(webServerPort = 3080) {
        console.log('StartupChecker: Performing startup checks...');
        const warnings = [];
        const errors = [];

        try {
            // Check for Watchout processes
            console.log('StartupChecker: Checking for Watchout processes...');            const watchoutCheck = await this.processDetector.checkWatchoutProcesses();
            console.log('StartupChecker: Watchout check result:', watchoutCheck);
            if (watchoutCheck.running) {
                console.log('StartupChecker: Watchout processes detected!');
                warnings.push({
                    type: 'watchout-running',
                    title: 'Watchout Software Detected',
                    message: `The following Watchout processes are running: ${watchoutCheck.processes.join(', ')}. This may interfere with server discovery. Consider closing Watchout before continuing.`,
                    processes: watchoutCheck.processes,
                    severity: 'warning'
                });
            }            // Check if web server port is occupied
            console.log('StartupChecker: Checking web server port', webServerPort);            const portInUse = await this.processDetector.isPortInUse(webServerPort);
            console.log('StartupChecker: Web server port check result:', portInUse);
            if (portInUse) {
                const portInfo = await this.processDetector.getPortInfo(webServerPort);
                const processInfo = portInfo ? ` (used by: ${portInfo})` : '';
                
                // Check if the port is being used by the current process
                const currentPid = process.pid;
                const isCurrentProcess = portInfo && portInfo.includes(`(PID: ${currentPid})`);
                
                if (!isCurrentProcess) {
                    console.log('StartupChecker: Web server port is in use by external process!');
                    warnings.push({
                        type: 'port-occupied',
                        title: 'Port Already in Use',
                        message: `Port ${webServerPort} is already in use${processInfo}. Web server functionality may not work properly.`,
                        port: webServerPort,
                        processInfo: portInfo,
                        severity: 'warning'
                    });
                } else {
                    console.log('StartupChecker: Web server port is in use by current process (normal)');
                }
            }            // Check multicast port (3012) - commonly used by Watchout
            console.log('StartupChecker: Checking multicast port 3012...');
            const multicastPortInUse = await this.processDetector.isPortInUse(3012);
            console.log('StartupChecker: Multicast port check result:', multicastPortInUse);
            if (multicastPortInUse) {
                const portInfo = await this.processDetector.getPortInfo(3012);
                const processInfo = portInfo ? ` (used by: ${portInfo})` : '';
                
                // Check if the port is being used by the current process
                const currentPid = process.pid;
                const isCurrentProcess = portInfo && portInfo.includes(`(PID: ${currentPid})`);
                
                if (!isCurrentProcess) {
                    console.log('StartupChecker: Multicast port is in use by external process!');
                    warnings.push({
                        type: 'multicast-port-occupied',
                        title: 'Multicast Port in Use',
                        message: `Multicast port 3012 is in use${processInfo}. Auto-discovery may be limited.`,
                        port: 3012,
                        processInfo: portInfo,
                        severity: 'info'
                    });
                } else {
                    console.log('StartupChecker: Multicast port is in use by current process (normal)');
                }
            }

        } catch (error) {
            console.error('Error during startup checks:', error);
            warnings.push({
                type: 'check-failed',
                title: 'Startup Check Failed',
                message: `Could not complete all startup checks: ${error.message}`,
                severity: 'info'
            });
        }

        console.log('StartupChecker: Checks completed. Warnings:', warnings.length, 'Errors:', errors.length);
        return {
            success: errors.length === 0,
            warnings,
            errors
        };
    }

    /**
     * Create startup issue notification data for the renderer
     * @param {Object} checkResult - Result from performStartupChecks
     * @returns {Object} Notification data for the renderer
     */
    createStartupNotification(checkResult) {
        if (checkResult.warnings.length === 0 && checkResult.errors.length === 0) {
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
                    { id: 'continue', label: 'Continue Anyway', secondary: true }
                ],
                severity: 'warning'
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
    }
}

module.exports = StartupChecker;

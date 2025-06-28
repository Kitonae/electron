const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ProcessDetector {
    constructor() {
        this.watchoutProcesses = [
            'runner',
            'process-manager', 
            'Producer',
            'director',
            'operative'
        ];
    }

    /**
     * Check if any Watchout processes are currently running
     * @returns {Promise<{running: boolean, processes: string[]}>}
     */
    async checkWatchoutProcesses() {
        try {
            const runningProcesses = [];
            
            // Use tasklist on Windows to check for running processes
            const { stdout } = await execAsync('tasklist /FO CSV', { encoding: 'utf8' });
            
            // Parse the CSV output
            const lines = stdout.split('\n');
            const processNames = [];
            
            for (let i = 1; i < lines.length; i++) { // Skip header line
                const line = lines[i].trim();
                if (line) {
                    // Parse CSV line - process name is the first field
                    const match = line.match(/^"([^"]+)"/);
                    if (match) {
                        processNames.push(match[1].toLowerCase());
                    }
                }
            }
            
            // Check for Watchout processes
            for (const watchoutProcess of this.watchoutProcesses) {
                const processPattern = watchoutProcess.toLowerCase();
                const found = processNames.some(name => 
                    name.includes(processPattern) || 
                    name.startsWith(processPattern) ||
                    name === `${processPattern}.exe`
                );
                
                if (found) {
                    runningProcesses.push(watchoutProcess);
                }
            }
            
            return {
                running: runningProcesses.length > 0,
                processes: runningProcesses
            };
            
        } catch (error) {
            console.warn('Error checking for Watchout processes:', error.message);
            // Return false if we can't check (don't block startup)
            return {
                running: false,
                processes: []
            };
        }
    }

    /**
     * Check if a specific port is in use
     * @param {number} port - The port to check
     * @returns {Promise<boolean>}
     */
    async isPortInUse(port) {
        try {
            // Use netstat to check if port is in use
            const { stdout } = await execAsync(`netstat -an`, { encoding: 'utf8' });
            
            // Look for the port in the output
            const portPattern = new RegExp(`:${port}\\s`, 'i');
            return portPattern.test(stdout);
            
        } catch (error) {
            console.warn('Error checking port usage:', error.message);
            return false;
        }
    }

    /**
     * Get detailed information about what's using a specific port
     * @param {number} port - The port to check
     * @returns {Promise<string|null>}
     */
    async getPortInfo(port) {
        try {
            // Use netstat -ano to get process IDs
            const { stdout } = await execAsync(`netstat -ano`, { encoding: 'utf8' });
              const lines = stdout.split('\n');
            for (const line of lines) {
                // Check for both TCP (LISTENING/ESTABLISHED) and UDP connections
                const isTcpConnection = line.includes(`:${port} `) && (line.includes('LISTENING') || line.includes('ESTABLISHED'));
                const isUdpConnection = line.includes('UDP') && line.includes(`:${port} `);
                
                if (isTcpConnection || isUdpConnection) {
                    // Extract PID from the end of the line
                    const parts = line.trim().split(/\s+/);
                    const pid = parts[parts.length - 1];
                    
                    if (pid && !isNaN(pid)) {
                        // Get process name from PID
                        try {
                            const { stdout: processInfo } = await execAsync(`tasklist /FO CSV /FI "PID eq ${pid}"`, { encoding: 'utf8' });
                            const processLines = processInfo.split('\n');
                            if (processLines.length > 1) {
                                const processMatch = processLines[1].match(/^"([^"]+)"/);
                                if (processMatch) {
                                    return `${processMatch[1]} (PID: ${pid})`;
                                }
                            }
                        } catch (e) {
                            return `PID: ${pid}`;
                        }
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            console.warn('Error getting port info:', error.message);
            return null;
        }
    }
}

module.exports = ProcessDetector;

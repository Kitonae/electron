# WATCHOUT Assistant

An Electron application designed to discover and control Watchout 7 servers on a local network.

## Features

### 🔍 **Server Discovery**
- **Multicast Discovery**: Uses official Watchout 7 protocol (239.2.2.2, ports 3011/3012)
- **Port Scanning**: Scans for Watchout services on standard ports (3040, 3041, 3042)
- **Bonjour/mDNS**: Discovers services advertised via Bonjour
- **Background Scanning**: Automatic discovery every 30 seconds
- **Server Caching**: Tracks discovered servers over time with offline detection

### 🖥️ **Modern User Interface**
- **Sidebar Navigation**: Clean server list with simplified labels
- **Server Selection**: Click to select and view detailed server information
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Real-time Updates**: Live status indicators and connection monitoring
- **Adaptive Layout**: Automatically switches between tabbed and grid panel layouts
  - **Standard screens (≤1600px)**: Traditional tabbed interface for most users
  - **Ultra-wide screens (>1600px)**: Horizontal grid layout showing server details and commands simultaneously without tabs

### ⚡ **Watchout Commands & Control**
- **Context-Aware Timeline Control**: Select specific timelines and control play/pause/stop
- **Timeline Management**: Load and browse available timelines from servers
- **Server Information**: Get status, show details, and system information
- **API Connection Testing**: Verify HTTP API connectivity with detailed feedback
- **Custom Commands**: Execute custom API endpoints with full flexibility
- **Command History**: View response history with timestamps per server

## Watchout 7 API Integration

This application integrates with the [Watchout 7 External Protocol](https://docs.dataton.com/watchout-7/external_protocol/ext_wo7.html) using HTTP API commands:

### Supported Commands

#### Timeline Control
- `POST /v0/play/{timelineId}` - Play specific timeline by ID
- `POST /v0/pause/{timelineId}` - Pause specific timeline by ID  
- `POST /v0/stop/{timelineId}` - Stop specific timeline by ID
- **Context-Aware**: Timeline ID is selected from dropdown interface

#### Information Retrieval
- `GET /v0/state` - Current playback status
- `GET /v0/show` - Current show information
- `GET /v0/timelines` - Available timelines for selection

#### Advanced Features
- Custom endpoint execution
- JSON request data support
- Real-time response viewing
- **Server-specific command history** - Each server maintains its own command history and connection status
- **Persistent command states** - Command history and connection status are preserved when switching between servers
- **Per-server API connection tracking** - Each server's API connection status is independently tracked and maintained

## Installation & Usage

### Prerequisites
- Node.js 16 or higher
- npm or yarn
- Optional: nmap (for enhanced port scanning)

### Setup
```bash
# Clone and install dependencies
cd watchout-assistant
npm install

# Run in development mode
npm run dev

# Build for production
npm start
```

### Usage
1. **Discovery**: The app automatically scans for Watchout servers every 30 seconds
2. **Manual Scan**: Click the refresh icon for immediate discovery
3. **Server Selection**: Click any server in the sidebar to view details and switch to commands
4. **Tabbed Interface**: Switch between "Server Details" and "Commands" tabs
5. **Command Execution**: Use the commands panel to control selected servers
6. **Server-Specific History**: Each server maintains its own command history and connection status
7. **Custom Commands**: Click "Custom Command" to execute any Watchout API endpoint
8. **Persistent Cache**: Server information persists across app sessions with 24-hour expiry

## Network Requirements

### Multicast Discovery
- Multicast group: `239.2.2.2`
- Query port: `3011` 
- Response port: `3012`

### HTTP API Access
- Default port: `3019` (configurable per server)
- Requires Watchout 7 with HTTP API enabled

### Standard Watchout Ports
- `3040`, `3041`, `3042` - Main Watchout services

## Architecture

- **Main Process**: Handles network discovery and API communication
- **Renderer Process**: Modern web-based UI with security isolation
- **IPC Communication**: Secure communication between processes
- **Caching System**: Persistent server tracking with offline detection

## Security

- Context isolation enabled
- Node integration disabled in renderer
- Secure IPC patterns
- No remote module access

## Development

### Project Structure
```
├── main.js                 # Main Electron process
├── src/
│   ├── index.html          # Main UI layout
│   ├── renderer.js         # Frontend logic
│   ├── styles.css          # Modern responsive styling
│   ├── preload.js          # Secure IPC bridge
│   ├── network-scanner.js  # Discovery logic
│   └── watchout-commands.js # API command handlers
└── package.json
```

### Key Technologies
- **Electron**: Desktop app framework
- **Node.js**: Network discovery and HTTP requests
- **Modern CSS**: Responsive design with flexbox/grid
- **Vanilla JavaScript**: No external UI frameworks

## Troubleshooting

### Common Issues
- **Port in use**: Restart app if multicast port is occupied
- **No servers found**: Check network connectivity and Watchout server settings
- **API not responding**: Verify Watchout HTTP API is enabled on target servers
- **Permission errors**: Run with appropriate network access permissions

### Watchout Server Configuration
Ensure your Watchout servers have:
- HTTP API enabled (default port 3019)
- Multicast discovery enabled
- Network access from the discovery machine

## License

This project is licensed under the MIT License.

# WATCHOUT Assistant

An Electron application designed to discover and control Watchout 7 servers on a local network.

## Features

### 🔍 **Server Discovery**
- **Multicast Discovery**: Uses official Watchout 7 protocol (239.2.2.2, ports 3011/3012)
- **Port Scanning**: Scans for Watchout services on standard ports (3040, 3041, 3042)
- **Bonjour/mDNS**: Discovers services advertised via Bonjour
- **nmap Detection**: Enhanced port scanning with nmap when available
- **Manual Server Management**: Add, edit, and remove servers manually as fallback for discovery
- **Discovery Scanning**: Automatic discovery every 30 seconds with intelligent offline detection
- **Server Caching**: Tracks discovered servers over time with 24-hour cache expiry
- **Offline Detection**: Marks servers offline after 10 consecutive missed scans

### 🖥️ **Modern User Interface**
- **Sidebar Navigation**: Clean server list with simplified labels and status indicators
- **Manual Server Actions**: Edit and remove buttons for manually added servers
- **Server Selection**: Click to select and view detailed server information
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Real-time Updates**: Live status indicators and connection monitoring
- **Interactive Animations**: Enhanced button press feedback with ripple effects and visual transitions
- **Adaptive Layout**: Automatically switches between tabbed and grid panel layouts
  - **Standard screens (≤1600px)**: Traditional tabbed interface for most users
  - **Ultra-wide screens (>1600px)**: Horizontal grid layout showing server details and commands simultaneously without tabs
- **Web Interface**: Access the application from any browser via built-in web server
- **Settings Management**: Configure cache behavior and web server options

### ⚡ **Watchout Commands & Control**
- **Context-Aware Timeline Control**: Select specific timelines and control play/pause/stop
- **Timeline Management**: Load and browse available timelines from servers
- **Server Information**: Get status, show details, and system information
- **Show Management**: Save show information to disk and upload .watch/.json files
- **API Connection Testing**: Verify HTTP API connectivity with detailed feedback
- **Custom Commands**: Execute custom API endpoints with full flexibility
- **Command History**: View response history with timestamps per server
- **Server-Specific State**: Each server maintains independent connection status and command history

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

#### Show Management
- `GET /v0/show` - Save current show information to disk
- `POST /v1/show` - Upload .watch or .json show files

#### Manual Server Management
- **Add Servers**: Manually add servers by IP address when discovery fails
- **Edit Servers**: Modify server details including name, ports, and type
- **Remove Servers**: Delete manually added servers with confirmation
- **Always Online**: Manual servers skip availability checks and remain always online

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
3. **Manual Servers**: Use the + button to add servers manually if discovery fails
4. **Server Selection**: Click any server in the sidebar to view details and switch to commands
5. **Server Management**: Edit or remove manual servers using the action buttons
6. **Tabbed Interface**: Switch between "Server Details" and "Commands" tabs
7. **Command Execution**: Use the commands panel to control selected servers
8. **Server-Specific History**: Each server maintains its own command history and connection status
9. **Custom Commands**: Click "Custom Command" to execute any Watchout API endpoint
10. **Show Management**: Save show info to disk or upload .watch/.json files
11. **Web Access**: Enable web server in settings to access from any browser
12. **Persistent Cache**: Server information persists across app sessions with 24-hour expiry

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

### Web Server Access
- **Default port**: `3080` (configurable)
- **Access URL**: `http://localhost:3080` (or machine IP for remote access)
- **Features**: Full functionality available through web browser
- **Compatibility**: Works on mobile devices and tablets

## Architecture

- **Main Process**: Handles network discovery, API communication, and web server
- **Renderer Process**: Modern web-based UI with security isolation
- **Web Server**: Optional HTTP server for browser-based access
- **IPC Communication**: Secure communication between processes
- **Caching System**: Persistent server tracking with offline detection
- **Manual Server Management**: Fallback discovery with persistent storage

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
│   ├── web.html            # Web browser UI layout
│   ├── renderer.js         # Desktop frontend logic
│   ├── renderer-web.js     # Web browser frontend logic
│   ├── styles.css          # Modern responsive styling
│   ├── preload.js          # Secure IPC bridge
│   ├── api-adapter.js      # Cross-platform API abstraction
│   ├── network-scanner.js  # Discovery logic with manual server support
│   ├── watchout-commands.js # API command handlers
│   ├── web-server.js       # Optional web server for browser access
│   └── startup-checker.js  # Startup validation and warnings
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
- **No servers found**: Check network connectivity and Watchout server settings, or add servers manually
- **API not responding**: Verify Watchout HTTP API is enabled on target servers
- **Permission errors**: Run with appropriate network access permissions
- **Manual servers not accessible**: Verify IP addresses and ensure servers are reachable
- **Web server not starting**: Check if port 3080 is available or change port in settings

### Watchout Server Configuration
Ensure your Watchout servers have:
- HTTP API enabled (default port 3019)
- Multicast discovery enabled
- Network access from the discovery machine

## License

This project is licensed under the MIT License.

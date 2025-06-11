# Watchout Server Finder

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

### ⚡ **Watchout Commands & Control**
- **Timeline Control**: Play, Pause, Stop timelines
- **Server Information**: Get status, timelines, and show details
- **API Connection Testing**: Verify HTTP API connectivity
- **Custom Commands**: Execute custom API endpoints with full flexibility
- **Command History**: View response history with timestamps

## Watchout 7 API Integration

This application integrates with the [Watchout 7 External Protocol](https://docs.dataton.com/watchout-7/external_protocol/ext_wo7.html) using HTTP API commands:

### Supported Commands

#### Timeline Control
- `POST /v0/play/0` - Play main timeline
- `POST /v0/pause/0` - Pause main timeline  
- `POST /v0/stop/0` - Stop main timeline

#### Information Retrieval
- `GET /v0/state` - Current playback status
- `GET /v0/show` - Current show information
- `GET /v0/timelines` - Available timelines

#### Advanced Features
- Custom endpoint execution
- JSON request data support
- Real-time response viewing

## Installation & Usage

### Prerequisites
- Node.js 16 or higher
- npm or yarn
- Optional: nmap (for enhanced port scanning)

### Setup
```bash
# Clone and install dependencies
cd watchout-server-finder
npm install

# Run in development mode
npm run dev

# Build for production
npm start
```

### Usage
1. **Discovery**: The app automatically scans for Watchout servers every 30 seconds
2. **Manual Scan**: Click "Manual Scan" for immediate discovery
3. **Server Selection**: Click any server in the sidebar to view details
4. **Command Execution**: Use the commands panel to control selected servers
5. **Custom Commands**: Click "Custom Command" to execute any Watchout API endpoint

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

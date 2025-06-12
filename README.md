# WATCHOUT Assistant

A comprehensive Electron application designed to discover and control Watchout 7 servers on local networks. This tool provides network discovery, server management, and full API control for Watchout media servers with both desktop and web interfaces.

## ✨ Key Features

### 🔍 **Multi-Method Server Discovery**
- **Multicast Discovery**: Uses official Watchout 7 protocol (239.2.2.2, ports 3011/3012)
- **Intelligent Port Scanning**: Scans for Watchout services on standard ports (3040, 3041, 3042)
- **Bonjour/mDNS Support**: Discovers services advertised via Bonjour/Zeroconf
- **Enhanced nmap Detection**: Advanced port scanning with nmap when available
- **Automatic Background Scanning**: Continuous discovery every 30 seconds
- **Smart Offline Detection**: Marks servers offline after 10 consecutive missed scans
- **Persistent Server Cache**: 24-hour cache with cross-session persistence

### 🖥️ **Modern Cross-Platform Interface**
- **Dual Interface Support**: 
  - **Desktop App**: Full-featured Electron application with custom window chrome
  - **Web Interface**: Browser-based access via built-in HTTP server (port 3080)
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Adaptive Layout System**:
  - **Standard screens (≤1600px)**: Traditional tabbed interface
  - **Ultra-wide screens (>1600px)**: Horizontal grid layout with simultaneous panels
- **Smart Server Management**:
  - **Organized Sidebar**: Clean server list with online/offline grouping and visual dividers
  - **Manual Server Actions**: Add, edit, and remove servers with intuitive controls
  - **Real-time Status**: Live connection monitoring and status indicators
- **Enhanced User Experience**:
  - **Animated Interactions**: Button press feedback with ripple effects
  - **Context-Aware Controls**: Timeline selection dropdowns and server-specific states
  - **Custom Window Chrome**: Frameless design with integrated controls (desktop only)

### ⚡ **Complete Watchout Control & Management**
- **Advanced Timeline Control**:
  - **Context-Aware Selection**: Choose specific timelines from server-provided lists
  - **Real-time Status Visualization**: Live display of currently playing timelines
  - **Free-Running Renderer Monitoring**: Track active renderer status
  - **Full Transport Controls**: Play, pause, stop with visual feedback
- **Comprehensive Show Management**:
  - **Show Information Retrieval**: Get detailed server and show status
  - **Show Export**: Save current show data to local JSON files
  - **Show Upload**: Upload .watch or .json show files with automatic format detection
  - **File Format Support**: Native Watchout .watch files and JSON exports
- **Advanced API Integration**:
  - **Full HTTP API Access**: Complete Watchout 7 External Protocol support
  - **Custom Command Execution**: Run any API endpoint with JSON payload support
  - **Server-Specific History**: Independent command history per server
  - **Connection Testing**: Verify API connectivity with detailed diagnostics
- **Manual Server Management**:
  - **Fallback Discovery**: Add servers manually when auto-discovery fails
  - **Server Editing**: Modify IP addresses, ports, and display names
  - **Always-Online Mode**: Manual servers bypass availability checks
  - **Persistent Storage**: Manual servers saved across application sessions

### 🔧 **System Integration & Security**
- **Startup Validation**: Automatic detection of conflicting Watchout processes
- **Process Monitoring**: Warns if Watchout Producer, Director, or other components are running
- **Configurable Settings**:
  - **Cache Management**: Toggle persistent server caching
  - **Web Server Control**: Enable/disable browser access
  - **Port Configuration**: Customize web server port (default 3080)
- **Security Architecture**:
  - **Process Isolation**: Secure IPC communication between main and renderer
  - **Context Isolation**: No direct Node.js access in UI layer
  - **Content Security Policy**: Protection against code injection

## 🚀 Quick Start

### Prerequisites
- **Node.js**: Version 16 or higher
- **Operating System**: Windows, macOS, or Linux
- **Network Access**: Local network connectivity to Watchout servers
- **Optional**: nmap installed for enhanced port scanning

### Installation & Launch
```bash
# Install dependencies
npm install

# Development mode (with DevTools)
npm run dev

# Production mode
npm start

# Build standalone executable
npm run build
```

## 🔌 Watchout 7 API Integration

This application provides full integration with the [Watchout 7 External Protocol](https://docs.dataton.com/watchout-7/external_protocol/ext_wo7.html) through HTTP API commands:

### 📋 Supported API Commands

#### **Timeline Control & Status**
- `GET /v0/state` - Retrieve current playback status and active timelines
- `GET /v0/timelines` - List all available timelines for selection
- `POST /v0/play/{timelineId}` - Start playback of specific timeline
- `POST /v0/pause/{timelineId}` - Pause specific timeline  
- `POST /v0/stop/{timelineId}` - Stop specific timeline
- **Visual Status Display**: Real-time visualization of playing timelines and free-running renderers

#### **Show Management & File Operations**
- `GET /v0/show` - Retrieve current show information and save to local JSON file
- `POST /v0/show` - Upload JSON show data to server
- `POST /v0/showfile` - Upload binary .watch show files
- **File Format Support**: Automatic detection and handling of .watch and .json formats
- **Local Storage**: Save show configurations for backup and transfer

#### **Server Information & Diagnostics**
- `GET /v0/state` - Comprehensive server status including timeline states
- **Connection Testing**: Verify API accessibility and response times
- **Error Handling**: Detailed error reporting with troubleshooting guidance

#### **Advanced Features**
- **Custom API Endpoints**: Execute any Watchout API command with full JSON payload support
- **Server-Specific History**: Independent command history and state tracking per server
- **Persistent Sessions**: Command history and connection status preserved across app restarts

## 📖 User Guide

### **Server Discovery & Management**
1. **Automatic Discovery**: App scans every 30 seconds using multiple methods
2. **Manual Discovery**: Click refresh icon for immediate scan
3. **Add Servers Manually**: Use `+` button when auto-discovery fails
4. **Server Organization**: Online servers grouped above offline with visual dividers
5. **Server Actions**: Edit or remove manually added servers with dedicated buttons

### **Timeline Control Workflow**
1. **Select Server**: Click any server in sidebar to view details
2. **Choose Timeline**: Use timeline dropdown to select from available options
3. **Transport Controls**: Use play, pause, stop buttons with visual feedback
4. **Monitor Status**: View real-time timeline status and renderer information
5. **Command History**: Review all executed commands with timestamps

### **Show Management Operations**
1. **Export Show**: Click "Save Show" to download current show as JSON
2. **Upload Show**: Use "Upload Show" to select .watch or .json files
3. **File Handling**: App automatically detects and processes file formats
4. **Backup Strategy**: Regular exports recommended for show configuration backup

### **Web Interface Access**
1. **Enable Web Server**: Toggle web server in settings (desktop app only)
2. **Access URL**: Navigate to `http://localhost:3080` or `http://[machine-ip]:3080`
3. **Mobile Access**: Full functionality available on tablets and phones
4. **Network Access**: Other devices on network can access via machine IP

### **Advanced Configuration**
1. **Settings Panel**: Configure cache behavior and web server options
2. **Startup Warnings**: App detects conflicting Watchout processes automatically
3. **Manual Server Persistence**: Manually added servers saved across sessions
4. **Cache Management**: 24-hour automatic expiry with manual clear options

## 🌐 Network Configuration

### **Discovery Protocols**
- **Multicast Group**: `239.2.2.2`
- **Query Port**: `3011` (outbound discovery requests)
- **Response Port**: `3012` (inbound server responses)
- **Standard Watchout Ports**: `3040`, `3041`, `3042` (service detection)

### **HTTP API Requirements**
- **Default API Port**: `3019` (configurable per server)
- **Protocol**: HTTP/HTTPS support
- **Authentication**: None required for standard operations
- **Watchout 7 Requirement**: HTTP API must be enabled in Watchout configuration

### **Web Server Configuration**
- **Default Port**: `3080` (configurable in settings)
- **Local Access**: `http://localhost:3080`
- **Network Access**: `http://[machine-ip]:3080` for remote devices
- **Security**: Local network access only (no external internet exposure)

### **Firewall Requirements**
```
Inbound: 3080 (web server), 3012 (multicast responses)
Outbound: 3011 (multicast queries), 3019 (API), 3040-3042 (port scanning)
```

## 🏗️ Technical Architecture

### **Application Structure**
- **Main Process** (`main.js`): Electron lifecycle, window management, and system integration
- **Renderer Process**: Secure web-based UI with context isolation
- **Web Server** (`web-server.js`): Optional HTTP server for browser access
- **IPC Bridge** (`preload.js`): Secure communication layer between processes

### **Core Components**
```
├── main.js                 # Main Electron process & app lifecycle
├── src/
│   ├── index.html          # Desktop UI layout
│   ├── web.html            # Web browser UI layout  
│   ├── renderer.js         # Desktop frontend logic
│   ├── renderer-web.js     # Web browser frontend logic
│   ├── styles.css          # Responsive CSS with modern design
│   ├── context-panels.css  # Panel-specific styling
│   ├── preload.js          # Secure IPC bridge
│   ├── api-adapter.js      # Cross-platform API abstraction
│   ├── network-scanner.js  # Multi-method server discovery
│   ├── watchout-commands.js# Watchout API command handlers
│   ├── web-server.js       # HTTP server for browser access
│   ├── startup-checker.js  # Process conflict detection
│   └── process-detector.js # System process monitoring
└── package.json
```

### **Security Model**
- **Context Isolation**: Complete separation between Node.js and web content
- **No Node Integration**: Renderer process cannot access Node.js APIs directly
- **Secure IPC**: All main↔renderer communication through preload script
- **Content Security Policy**: Protection against code injection attacks
- **Process Separation**: Network operations isolated in main process

### **Technology Stack**
- **Framework**: Electron 36.4.0 with modern security practices
- **Backend**: Node.js with native modules (dgram, bonjour-service, node-nmap)
- **Frontend**: Vanilla JavaScript with modern ES6+ features
- **Styling**: CSS Grid/Flexbox with responsive design patterns
- **HTTP Server**: Express.js with multipart file upload support

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

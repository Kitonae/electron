# Watchout Server Finder

An Electron application that discovers Watchout 7 media servers on your local network using multiple discovery methods.

## Features

- **Multiple Discovery Methods**: Uses port scanning, multicast listening, and Bonjour/mDNS discovery
- **Modern UI**: Clean, responsive interface with real-time updates
- **Comprehensive Server Info**: Displays IP addresses, hostnames, ports, and discovery methods
- **Cross-Platform**: Runs on Windows, macOS, and Linux
- **Secure Architecture**: Uses proper Electron security practices

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## How It Works

The application uses three discovery methods to find Watchout 7 servers:

1. **Port Scanning**: Scans the local network for Watchout ports:
   - Operational ports: 3040, 3041, 3042
   - Discovery ports: 3011 (query), 3012 (response)

2. **Multicast Discovery**: Uses the official Watchout multicast discovery protocol:
   - Multicast IP: 239.2.2.2
   - Sends discovery queries to port 3011
   - Listens for responses on port 3012

3. **Bonjour Discovery**: Uses mDNS/Bonjour to discover services that match Watchout patterns

## Requirements

- Node.js 14 or later
- For port scanning: `nmap` must be installed and available in PATH
- Network access to scan local subnets

## Watchout 7 Information

Watchout is a professional media server software by Dataton, commonly used in:
- Live events and productions
- Digital signage
- Multimedia installations
- Broadcast environments

Common Watchout server configurations:
- Production computers (run the show)
- Display computers (output to screens)
- Backup systems

## Troubleshooting

- **No servers found**: Ensure Watchout servers are running and accessible on the network
- **Port scan fails**: Install nmap and ensure it's in your system PATH
- **Permission errors**: Run as administrator if network scanning requires elevated privileges

## Development

The project structure:
```
├── main.js                 # Main Electron process
├── src/
│   ├── index.html          # Main UI
│   ├── styles.css          # Styling
│   ├── renderer.js         # Frontend logic
│   ├── preload.js          # IPC bridge
│   └── network-scanner.js  # Discovery logic
├── assets/                 # App icons and resources
└── package.json           # Dependencies and scripts
```

## Security

This application follows Electron security best practices:
- Context isolation enabled
- Node integration disabled in renderer
- Secure IPC communication via preload script
- No remote module access

## License

ISC License - See package.json for details.

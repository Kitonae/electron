<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# WATCHOUT Assistant - Copilot Instructions

This is an Electron application designed to discover Watchout 7 servers on a local network.

## Project Context
- **Technology Stack**: Electron, Node.js, HTML/CSS/JavaScript
- **Purpose**: Network discovery tool for Watchout 7 media servers
- **Architecture**: Main process (Node.js) + Renderer process (Web technologies)

## Key Components
- `main.js`: Main Electron process, handles app lifecycle and IPC
- `src/network-scanner.js`: Network discovery logic using multiple methods (nmap, multicast, Bonjour)
- `src/preload.js`: Secure bridge between main and renderer processes
- `src/index.html`: Main UI layout
- `src/styles.css`: Modern, responsive styling
- `src/renderer.js`: Frontend logic and UI interactions

## Development Guidelines
- Use secure IPC communication patterns
- Follow Electron security best practices (no node integration in renderer)
- Implement multiple network discovery methods for reliability
- Maintain modern, accessible UI design
- Handle network errors gracefully
- Use proper error handling and logging

## Watchout 7 Specifics
- Common ports: 3040, 3041, 3042
- May use multicast announcements
- Dataton is the manufacturer
- Servers typically run on production networks

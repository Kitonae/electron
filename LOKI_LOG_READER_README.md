# Loki Real-time Log Reader for Watchout 7 Assistant

## Overview

I've successfully integrated a comprehensive real-time log reader for Loki servers running on port 3022 into the existing Watchout 7 Assistant application. This feature allows users to monitor, query, and stream logs from their Watchout systems in real-time.

## Features Implemented

### 1. **LokiLogReader Class** (`src/loki-log-reader.js`)
- **Real-time log streaming** with automatic reconnection
- **Query-based log retrieval** with customizable time ranges and limits
- **Log parsing and formatting** with automatic log level detection
- **Connection testing** to verify Loki server availability
- **Label discovery** to explore available log sources and metadata
- **EventEmitter-based architecture** for real-time updates

### 2. **Integration with WatchoutCommands** (`src/watchout-commands.js`)
- Added Loki log management methods
- Seamless integration with existing command structure
- Support for both one-time queries and continuous streaming

### 3. **User Interface Components**
- **Modal-based log viewer** with modern, responsive design
- **Real-time log display** with color-coded log levels (Error, Warning, Info, Debug)
- **Query builder** with common predefined queries
- **Stream controls** (Start/Stop streaming)
- **Export functionality** to save logs as JSON
- **Connection status indicators** and stream status monitoring
- **Auto-scroll feature** for live log monitoring

### 4. **API Endpoints** (`src/web-server.js`)
- `POST /api/loki/:serverIp/test-connection` - Test Loki server connectivity
- `GET /api/loki/:serverIp/query` - Query logs with filters
- `POST /api/loki/:serverIp/stream/start` - Start log streaming
- `POST /api/loki/:serverIp/stream/stop` - Stop log streaming
- `GET /api/loki/:serverIp/labels` - Get available log labels
- `GET /api/loki/:serverIp/labels/:label/values` - Get label values
- `GET /api/loki/common-queries` - Get predefined query templates

### 5. **Cross-Platform Support**
- **Electron version** with IPC communication and event streaming
- **Web version** with HTTP polling for real-time updates
- **Unified API adapter** for consistent functionality across platforms

### 6. **Pre-defined Query Templates**
- All Logs: `{}`
- Watchout Logs: `{job="watchout"}`
- Error Logs: `{} |~ "(?i)error|err"`
- Warning Logs: `{} |~ "(?i)warn|warning"`
- Timeline Logs: `{} |~ "(?i)timeline|play|pause|stop"`
- Connection Logs: `{} |~ "(?i)connect|disconnect|network|tcp"`

## Technical Architecture

### Data Flow
1. **User Interface** → Query/Stream requests
2. **API Layer** → HTTP requests to Loki server (port 3022)
3. **Loki Server** → Log data retrieval
4. **Event System** → Real-time updates to UI
5. **Display Layer** → Formatted log visualization

### Log Processing
- **Timestamp conversion** from Loki's nanosecond format
- **Log level extraction** from message content
- **Label parsing** for metadata display
- **Message sanitization** and HTML escaping
- **Automatic log rotation** to prevent memory issues

### Error Handling
- **Connection timeouts** with retry logic
- **Graceful degradation** when Loki server is unavailable
- **User-friendly error messages** with troubleshooting hints
- **Automatic reconnection** with exponential backoff

## Usage Instructions

### 1. **Opening the Log Viewer**
- Select a Watchout server from the sidebar
- Click the "Log Viewer" button in the Advanced Commands section
- The modal will open with the log viewer interface

### 2. **Testing Connection**
- Click "Test Connection" to verify Loki server availability
- Status indicator will show connection state (Connected/Error/Testing)

### 3. **Querying Logs**
- Select a pre-defined query or enter a custom LogQL query
- Set the log limit (10-1000 logs) and time range (5m-24h)
- Click "Query Logs" to retrieve historical logs

### 4. **Streaming Logs**
- Click "Start Stream" to begin real-time log monitoring
- Stream status indicator shows "Live" when active
- Click "Stop Stream" to end the real-time feed

### 5. **Managing Logs**
- **Auto-scroll** keeps the latest logs in view
- **Clear** button removes all displayed logs
- **Export** button saves logs as JSON file
- **Log statistics** show count and time range

## Configuration

### Loki Server Requirements
- **Port**: 3022 (configurable in LokiLogReader class)
- **API Endpoints**: Standard Loki HTTP API (`/loki/api/v1/`)
- **Authentication**: Currently supports unauthenticated access
- **Query Language**: LogQL (Loki Query Language)

### Customization Options
- **Refresh interval** for streaming (default: 2 seconds)
- **Connection timeout** (default: 30 seconds)
- **Maximum displayed logs** (default: 1000)
- **Reconnection attempts** (default: 5)
- **Log level colors** and formatting

## Files Modified/Created

### New Files
- `src/loki-log-reader.js` - Core Loki integration class

### Modified Files
- `src/watchout-commands.js` - Added Loki methods integration
- `src/web-server.js` - Added Loki API endpoints
- `main.js` - Added IPC handlers for Loki functionality
- `src/preload.js` - Exposed Loki APIs to renderer
- `src/api-adapter.js` - Added cross-platform Loki methods
- `src/renderer.js` - Added log viewer UI and event handling
- `src/renderer-web.js` - Added web version log viewer
- `src/styles.css` - Added comprehensive log viewer styling
- `src/index.html` - Added log viewer button
- `src/web.html` - Added log viewer button for web version

## Benefits

1. **Real-time Monitoring**: Monitor Watchout system logs as they occur
2. **Historical Analysis**: Query and analyze past log events
3. **Troubleshooting**: Quickly identify errors and warnings
4. **Performance Monitoring**: Track timeline operations and system events
5. **Integration**: Seamlessly integrated with existing Watchout control interface
6. **Cross-platform**: Works in both Electron app and web browser
7. **Export Capability**: Save logs for offline analysis and reporting

## Future Enhancements

- **WebSocket support** for more efficient real-time streaming
- **Advanced filtering** with regex and LogQL query builder
- **Log visualization** with charts and graphs
- **Alert system** for critical log events
- **Authentication support** for secured Loki instances
- **Multi-server monitoring** with tabbed interface
- **Log aggregation** across multiple Watchout nodes

The implementation provides a robust, user-friendly interface for monitoring Watchout 7 systems through Loki logs, enhancing the troubleshooting and monitoring capabilities of the assistant application.

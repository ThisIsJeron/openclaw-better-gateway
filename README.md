# OpenClaw Better Gateway

An OpenClaw plugin that enhances the gateway web UI with automatic WebSocket reconnection and quality-of-life improvements.

## Features

✅ **Auto-Reconnect** — WebSocket disconnects are automatically recovered (up to 10 attempts)  
✅ **Connection Status Indicator** — Visual feedback showing connection state  
✅ **Network Awareness** — Detects online/offline and reconnects when back  
✅ **Drop-in Enhancement** — Same gateway UI, just better  

## Installation

### From npm (coming soon)
```bash
openclaw plugins install @thisisjeron/openclaw-better-gateway
```

### From source
```bash
git clone https://github.com/ThisIsJeron/openclaw-better-gateway.git
cd openclaw-better-gateway
npm install && npm run build
openclaw plugins install -l .
```

## Usage

After installation and gateway restart, access the enhanced UI at:
```
https://your-gateway/better-gateway/
```

### Endpoints

| Path | Description |
|------|-------------|
| `/better-gateway/` | Enhanced gateway UI with auto-reconnect |
| `/better-gateway/help` | Installation instructions & bookmarklet |
| `/better-gateway/inject.js` | Standalone script for manual injection |

## Configuration

In your OpenClaw config (`openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "better-gateway": {
        "enabled": true,
        "reconnectIntervalMs": 3000,
        "maxReconnectAttempts": 10
      }
    }
  }
}
```

## How It Works

The plugin:
1. Proxies the original gateway UI from `/` 
2. Injects an auto-reconnect script that wraps WebSocket
3. Serves the enhanced version at `/better-gateway/`

When a WebSocket connection drops unexpectedly, the script automatically attempts to reconnect instead of showing "please refresh" errors.

## Roadmap

### Phase 1: Core Stability ✅
- [x] Auto-reconnect on WebSocket disconnect
- [x] Connection status indicator
- [x] Network online/offline detection
- [x] Configurable retry attempts and intervals

### Phase 2: Enhanced UX
- [ ] Session state recovery after gateway restart
- [ ] Smarter reconnection (exponential backoff)
- [ ] Toast notifications for connection events
- [ ] Persist UI state across reconnects

### Phase 3: Customization
- [ ] Theme support (dark/light/custom)
- [ ] Custom CSS injection
- [ ] Widget system for dashboard additions
- [ ] User preferences storage

### Phase 4: Power Features
- [ ] Multi-gateway dashboard
- [ ] Session comparison view
- [ ] Performance metrics overlay
- [ ] Keyboard shortcuts
- [ ] Command palette

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## Contributing

PRs welcome! Please include tests for new features.

## License

MIT

---

Built with 🐾 by [ThisIsJeron](https://github.com/ThisIsJeron) and Clawd

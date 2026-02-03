# OpenClaw Better Gateway

An OpenClaw plugin that enhances the gateway web UI with automatic refresh and better WebSocket handling.

## Problem

The default OpenClaw gateway UI shows "please refresh" toast messages when state gets out of sync, requiring manual page refreshes.

## Solution

This plugin provides an enhanced UI at `/better-gateway/` that:
- Automatically reconnects WebSocket connections
- Auto-refreshes UI components when connection restores
- Provides smoother real-time updates without manual intervention

## Installation

```bash
openclaw plugins install @thisisjeron/openclaw-better-gateway
```

## Usage

After installation and gateway restart, access the enhanced UI at:
```
http://localhost:18789/better-gateway/
```

## License

MIT

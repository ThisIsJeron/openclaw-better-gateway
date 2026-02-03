(function () {
  "use strict";

  const config = window.__BETTER_GATEWAY_CONFIG__ || {
    reconnectIntervalMs: 3000,
    maxReconnectAttempts: 10,
  };

  let reconnectAttempts = 0;
  let statusIndicator = null;
  let originalWebSocket = window.WebSocket;
  let activeConnections = new Set();

  function createStatusIndicator() {
    if (statusIndicator) return statusIndicator;

    statusIndicator = document.createElement("div");
    statusIndicator.id = "better-gateway-status";
    statusIndicator.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      padding: 8px 14px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 999999;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      cursor: default;
      user-select: none;
    `;

    document.body.appendChild(statusIndicator);
    return statusIndicator;
  }

  function updateStatus(state, message) {
    const indicator = createStatusIndicator();

    const styles = {
      connected: {
        background: "#10b981",
        color: "#ffffff",
        icon: "\u25cf",
      },
      disconnected: {
        background: "#ef4444",
        color: "#ffffff",
        icon: "\u25cf",
      },
      reconnecting: {
        background: "#f59e0b",
        color: "#ffffff",
        icon: "\u21bb",
      },
      failed: {
        background: "#6b7280",
        color: "#ffffff",
        icon: "\u2717",
      },
    };

    const style = styles[state] || styles.disconnected;
    indicator.style.background = style.background;
    indicator.style.color = style.color;
    indicator.innerHTML = `<span style="margin-right: 6px;">${style.icon}</span>${message}`;

    if (state === "connected") {
      setTimeout(function () {
        indicator.style.opacity = "0.7";
      }, 2000);
    } else {
      indicator.style.opacity = "1";
    }
  }

  function wrapWebSocket(OriginalWebSocket) {
    function BetterWebSocket(url, protocols) {
      const ws = new OriginalWebSocket(url, protocols);
      const wrappedWs = ws;

      activeConnections.add(wrappedWs);

      ws.addEventListener("open", function () {
        reconnectAttempts = 0;
        updateStatus("connected", "Connected");
      });

      ws.addEventListener("close", function (event) {
        activeConnections.delete(wrappedWs);

        if (!event.wasClean && reconnectAttempts < config.maxReconnectAttempts) {
          reconnectAttempts++;
          updateStatus(
            "reconnecting",
            "Reconnecting (" + reconnectAttempts + "/" + config.maxReconnectAttempts + ")..."
          );

          setTimeout(function () {
            try {
              new BetterWebSocket(url, protocols);
            } catch (e) {
              console.error("[BetterGateway] Reconnection failed:", e);
            }
          }, config.reconnectIntervalMs);
        } else if (reconnectAttempts >= config.maxReconnectAttempts) {
          updateStatus("failed", "Connection failed - refresh to retry");
        } else {
          updateStatus("disconnected", "Disconnected");
        }
      });

      ws.addEventListener("error", function () {
        updateStatus("disconnected", "Connection error");
      });

      return ws;
    }

    BetterWebSocket.prototype = OriginalWebSocket.prototype;
    BetterWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    BetterWebSocket.OPEN = OriginalWebSocket.OPEN;
    BetterWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    BetterWebSocket.CLOSED = OriginalWebSocket.CLOSED;

    return BetterWebSocket;
  }

  window.WebSocket = wrapWebSocket(originalWebSocket);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      updateStatus("connected", "Ready");
    });
  } else {
    updateStatus("connected", "Ready");
  }

  window.addEventListener("online", function () {
    updateStatus("connected", "Back online");
  });

  window.addEventListener("offline", function () {
    updateStatus("disconnected", "Offline");
  });

  console.log("[BetterGateway] Auto-reconnect enabled", config);
})();

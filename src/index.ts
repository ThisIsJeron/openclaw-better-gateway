import { IncomingMessage, ServerResponse, request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PluginConfig {
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
}

interface PluginApi {
  registerHttpHandler: (
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
  ) => void;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  dataDir: string;
  pluginConfig: PluginConfig;
}

const DEFAULT_CONFIG: PluginConfig = {
  reconnectIntervalMs: 3000,
  maxReconnectAttempts: 10,
};

let injectScript: string | null = null;

function loadInjectScript(): string {
  if (injectScript === null) {
    const scriptPath = join(__dirname, "inject.js");
    injectScript = readFileSync(scriptPath, "utf-8");
  }
  return injectScript;
}

function generateConfigScript(config: PluginConfig): string {
  return `window.__BETTER_GATEWAY_CONFIG__ = ${JSON.stringify({
    reconnectIntervalMs: config.reconnectIntervalMs,
    maxReconnectAttempts: config.maxReconnectAttempts,
  })};`;
}

function generateLandingPage(config: PluginConfig, gatewayHost: string): string {
  const script = loadInjectScript();
  const bookmarklet = `javascript:(function(){${encodeURIComponent(script.replace(/\n/g, " "))}})()`;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Better Gateway</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    h1 { color: #00d4ff; }
    h2 { color: #888; margin-top: 2em; }
    code {
      background: #2d2d44;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    pre {
      background: #2d2d44;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
    }
    .bookmarklet {
      display: inline-block;
      background: #00d4ff;
      color: #1a1a2e;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: bold;
      margin: 10px 0;
    }
    .bookmarklet:hover { background: #00b8e6; }
    .status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.85em;
    }
    .status.ok { background: #2d5a27; color: #7fff7f; }
    .feature { margin: 8px 0; padding-left: 20px; }
    .feature::before { content: "✓ "; color: #00d4ff; }
  </style>
</head>
<body>
  <h1>🔌 Better Gateway</h1>
  <p>Auto-reconnect enhancement for OpenClaw Gateway UI</p>
  
  <h2>Features</h2>
  <div class="feature">Automatic WebSocket reconnection on disconnect</div>
  <div class="feature">Visual connection status indicator</div>
  <div class="feature">Network online/offline detection</div>
  <div class="feature">Configurable retry attempts (${config.maxReconnectAttempts} max)</div>
  <div class="feature">Reconnect interval: ${config.reconnectIntervalMs}ms</div>

  <h2>Option 1: Bookmarklet</h2>
  <p>Drag this to your bookmarks bar, then click it when on the Gateway UI:</p>
  <p><a class="bookmarklet" href="${bookmarklet}">⚡ Better Gateway</a></p>
  
  <h2>Option 2: Console Injection</h2>
  <p>Open DevTools (F12) on the Gateway UI and paste:</p>
  <pre>fetch('/better-gateway/inject.js').then(r=>r.text()).then(eval)</pre>
  
  <h2>Option 3: Userscript (Tampermonkey)</h2>
  <p>Create a new userscript with:</p>
  <pre>// ==UserScript==
// @name         Better Gateway
// @match        ${gatewayHost}/*
// @grant        none
// ==/UserScript==

fetch('/better-gateway/inject.js').then(r=>r.text()).then(eval);</pre>

  <h2>Script URL</h2>
  <p><code>/better-gateway/inject.js</code></p>
  
  <hr style="margin: 40px 0; border-color: #333;">
  <p style="color: #666; font-size: 0.85em;">
    <a href="https://github.com/ThisIsJeron/openclaw-better-gateway" style="color: #00d4ff;">GitHub</a> · 
    Config: reconnect=${config.reconnectIntervalMs}ms, maxAttempts=${config.maxReconnectAttempts}
  </p>
</body>
</html>`;
}

function generateUserscript(config: PluginConfig, gatewayUrl: string): string {
  const script = loadInjectScript();
  return `// ==UserScript==
// @name         Better Gateway - Auto Reconnect
// @namespace    https://github.com/ThisIsJeron/openclaw-better-gateway
// @version      1.0.0
// @description  Adds automatic WebSocket reconnection to OpenClaw Gateway UI
// @match        ${gatewayUrl}/*
// @grant        none
// ==/UserScript==

window.__BETTER_GATEWAY_CONFIG__ = ${JSON.stringify({
  reconnectIntervalMs: config.reconnectIntervalMs,
  maxReconnectAttempts: config.maxReconnectAttempts,
})};

${script}`;
}

export default {
  id: "better-gateway",
  name: "Better Gateway",

  configSchema: {
    parse(raw: unknown): PluginConfig {
      const config = (raw as Partial<PluginConfig>) || {};
      return {
        reconnectIntervalMs:
          config.reconnectIntervalMs ?? DEFAULT_CONFIG.reconnectIntervalMs,
        maxReconnectAttempts:
          config.maxReconnectAttempts ?? DEFAULT_CONFIG.maxReconnectAttempts,
      };
    },
    uiHints: {
      reconnectIntervalMs: {
        label: "Reconnect Interval (ms)",
        placeholder: "3000",
      },
      maxReconnectAttempts: {
        label: "Max Reconnect Attempts",
        placeholder: "10",
      },
    },
  },

  register(api: PluginApi): void {
    const config = { ...DEFAULT_CONFIG, ...(api.pluginConfig || {}) };
    api.logger.info(
      `Better Gateway loaded (reconnect: ${config.reconnectIntervalMs}ms, max: ${config.maxReconnectAttempts})`
    );

    api.registerHttpHandler(
      async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
        const url = new URL(req.url || "/", `http://${req.headers.host}`);
        const pathname = url.pathname;

        if (!pathname.startsWith("/better-gateway")) {
          return false;
        }

        const hostHeader = req.headers.host || "localhost:18789";
        const gatewayHost = `http://${hostHeader}`;

        // Serve the inject script
        if (pathname === "/better-gateway/inject.js") {
          const script = loadInjectScript();
          const configuredScript = `${generateConfigScript(config)}\n${script}`;

          res.writeHead(200, {
            "Content-Type": "application/javascript",
            "Content-Length": Buffer.byteLength(configuredScript),
            "Cache-Control": "no-cache",
          });
          res.end(configuredScript);
          api.logger.debug("Served inject.js");
          return true;
        }

        // Serve userscript download
        if (pathname === "/better-gateway/userscript.user.js") {
          const userscript = generateUserscript(config, gatewayHost);
          res.writeHead(200, {
            "Content-Type": "application/javascript",
            "Content-Length": Buffer.byteLength(userscript),
            "Content-Disposition": "attachment; filename=better-gateway.user.js",
          });
          res.end(userscript);
          api.logger.debug("Served userscript");
          return true;
        }

        // Serve landing/help page at /better-gateway/help
        if (pathname === "/better-gateway/help") {
          const html = generateLandingPage(config, gatewayHost);
          res.writeHead(200, {
            "Content-Type": "text/html",
            "Content-Length": Buffer.byteLength(html),
          });
          res.end(html);
          api.logger.debug("Served help page");
          return true;
        }

        // Enhanced gateway UI - proxy ALL /better-gateway/* paths to internal gateway
        // Strip /better-gateway prefix and proxy the rest
        const internalPort = 18789;
        let targetPath = pathname.replace(/^\/better-gateway/, "") || "/";
        if (url.search) {
          targetPath += url.search;
        }

        const proxyReq = httpRequest(
          {
            hostname: "127.0.0.1",
            port: internalPort,
            path: targetPath,
            method: req.method || "GET",
            family: 4, // Force IPv4
            headers: {
              ...req.headers,
              "Host": "127.0.0.1:18789",
            },
          },
            (proxyRes) => {
              const contentType = proxyRes.headers["content-type"] || "";
              const chunks: Buffer[] = [];

              proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
              proxyRes.on("end", () => {
                let body = Buffer.concat(chunks).toString("utf-8");

                // If it's HTML, inject our script and fix relative URLs
                if (contentType.includes("text/html")) {
                  const injectTag = `<script>${generateConfigScript(config)}\n${loadInjectScript()}</script>`;
                  
                  // Add <base href="/"> to make relative URLs resolve from root
                  const baseTag = `<base href="/">`;
                  
                  if (body.includes("<head>")) {
                    body = body.replace("<head>", `<head>${baseTag}`);
                  }

                  if (body.includes("</head>")) {
                    body = body.replace("</head>", `${injectTag}</head>`);
                  } else if (body.includes("</body>")) {
                    body = body.replace("</body>", `${injectTag}</body>`);
                  } else {
                    body = body + injectTag;
                  }
                }

                const headers: Record<string, string | number> = {
                  "Content-Type": contentType,
                  "Content-Length": Buffer.byteLength(body),
                };

                res.writeHead(proxyRes.statusCode || 200, headers);
                res.end(body);
                api.logger.debug("Served enhanced gateway UI");
              });
            }
          );

          proxyReq.on("error", (err) => {
            api.logger.error(`Proxy error: ${err.message}`);
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Failed to fetch gateway UI");
          });

        proxyReq.end();
        return true;
      }
    );
  },
};

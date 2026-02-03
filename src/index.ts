import { IncomingMessage, ServerResponse, request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PluginConfig {
  upstreamHost: string;
  upstreamPort: number;
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
  upstreamHost: "localhost",
  upstreamPort: 18789,
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

function injectScriptIntoHtml(html: string, config: PluginConfig): string {
  const script = loadInjectScript();
  const configScript = `<script>
window.__BETTER_GATEWAY_CONFIG__ = ${JSON.stringify({
    reconnectIntervalMs: config.reconnectIntervalMs,
    maxReconnectAttempts: config.maxReconnectAttempts,
  })};
</script>`;
  const injection = `${configScript}<script>${script}</script>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injection}</body>`);
  }
  if (html.includes("</html>")) {
    return html.replace("</html>", `${injection}</html>`);
  }
  return html + injection;
}

async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: PluginConfig,
  targetPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proxyReq = httpRequest(
      {
        hostname: config.upstreamHost,
        port: config.upstreamPort,
        path: targetPath,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${config.upstreamHost}:${config.upstreamPort}`,
        },
      },
      (proxyRes) => {
        const contentType = proxyRes.headers["content-type"] || "";
        const isHtml = contentType.includes("text/html");

        if (isHtml) {
          const chunks: Buffer[] = [];
          proxyRes.on("data", (chunk) => chunks.push(chunk));
          proxyRes.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf-8");
            const modified = injectScriptIntoHtml(body, config);

            const headers = { ...proxyRes.headers };
            delete headers["content-length"];
            headers["content-length"] = String(Buffer.byteLength(modified));

            res.writeHead(proxyRes.statusCode || 200, headers);
            res.end(modified);
            resolve();
          });
        } else {
          const headers = { ...proxyRes.headers };
          res.writeHead(proxyRes.statusCode || 200, headers);
          proxyRes.pipe(res);
          proxyRes.on("end", resolve);
        }

        proxyRes.on("error", reject);
      }
    );

    proxyReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Upstream connection failed: ${err.message}`);
      resolve();
    });

    if (req.method !== "GET" && req.method !== "HEAD") {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  });
}

export default {
  id: "better-gateway",
  name: "Better Gateway",

  configSchema: {
    parse(raw: unknown): PluginConfig {
      const config = (raw as Partial<PluginConfig>) || {};
      return {
        upstreamHost: config.upstreamHost ?? DEFAULT_CONFIG.upstreamHost,
        upstreamPort: config.upstreamPort ?? DEFAULT_CONFIG.upstreamPort,
        reconnectIntervalMs:
          config.reconnectIntervalMs ?? DEFAULT_CONFIG.reconnectIntervalMs,
        maxReconnectAttempts:
          config.maxReconnectAttempts ?? DEFAULT_CONFIG.maxReconnectAttempts,
      };
    },
    uiHints: {
      upstreamHost: { label: "Upstream Host", placeholder: "localhost" },
      upstreamPort: { label: "Upstream Port", placeholder: "18789" },
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
    const config = api.pluginConfig;
    api.logger.info(
      `Better Gateway proxying to ${config.upstreamHost}:${config.upstreamPort}`
    );

    api.registerHttpHandler(
      async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
        const url = new URL(req.url || "/", `http://${req.headers.host}`);
        const pathname = url.pathname;

        if (!pathname.startsWith("/better-gateway")) {
          return false;
        }

        let targetPath = pathname.replace(/^\/better-gateway/, "") || "/";
        if (url.search) {
          targetPath += url.search;
        }

        api.logger.debug(`Proxying ${pathname} -> ${targetPath}`);

        await proxyRequest(req, res, config, targetPath);
        return true;
      }
    );
  },
};

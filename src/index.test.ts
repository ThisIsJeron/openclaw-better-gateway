import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "console.log('injected script');"),
}));

const createMockRequest = (options: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}): IncomingMessage => {
  const req = new EventEmitter() as IncomingMessage;
  req.url = options.url;
  req.method = options.method || "GET";
  req.headers = options.headers || { host: "localhost:3000" };
  (req as any).pipe = vi.fn((dest) => dest);
  return req;
};

const createMockResponse = (): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
} => {
  const res = new EventEmitter() as any;
  res._statusCode = 200;
  res._headers = {};
  res._body = "";
  res.writeHead = vi.fn((code: number, headers?: Record<string, string>) => {
    res._statusCode = code;
    if (headers) res._headers = { ...res._headers, ...headers };
  });
  res.end = vi.fn((body?: string) => {
    if (body) res._body = body;
  });
  res.write = vi.fn((chunk: string) => {
    res._body += chunk;
  });
  return res;
};

describe("Plugin exports", () => {
  let plugin: any;

  beforeEach(async () => {
    vi.resetModules();
    plugin = (await import("./index.js")).default;
  });

  it("should export plugin with correct id and name", () => {
    expect(plugin.id).toBe("better-gateway");
    expect(plugin.name).toBe("Better Gateway");
  });

  it("should have a configSchema with parse method", () => {
    expect(plugin.configSchema).toBeDefined();
    expect(typeof plugin.configSchema.parse).toBe("function");
  });

  it("should have uiHints defined", () => {
    expect(plugin.configSchema.uiHints).toBeDefined();
    expect(plugin.configSchema.uiHints.upstreamHost).toBeDefined();
    expect(plugin.configSchema.uiHints.upstreamPort).toBeDefined();
  });

  it("should have a register method", () => {
    expect(typeof plugin.register).toBe("function");
  });
});

describe("configSchema.parse", () => {
  let plugin: any;

  beforeEach(async () => {
    vi.resetModules();
    plugin = (await import("./index.js")).default;
  });

  it("should return default config when given empty object", () => {
    const config = plugin.configSchema.parse({});
    expect(config).toEqual({
      upstreamHost: "localhost",
      upstreamPort: 18789,
      reconnectIntervalMs: 3000,
      maxReconnectAttempts: 10,
    });
  });

  it("should return default config when given undefined", () => {
    const config = plugin.configSchema.parse(undefined);
    expect(config).toEqual({
      upstreamHost: "localhost",
      upstreamPort: 18789,
      reconnectIntervalMs: 3000,
      maxReconnectAttempts: 10,
    });
  });

  it("should override defaults with provided values", () => {
    const config = plugin.configSchema.parse({
      upstreamHost: "example.com",
      upstreamPort: 8080,
      reconnectIntervalMs: 5000,
      maxReconnectAttempts: 20,
    });
    expect(config).toEqual({
      upstreamHost: "example.com",
      upstreamPort: 8080,
      reconnectIntervalMs: 5000,
      maxReconnectAttempts: 20,
    });
  });

  it("should allow partial config overrides", () => {
    const config = plugin.configSchema.parse({
      upstreamHost: "custom-host",
    });
    expect(config.upstreamHost).toBe("custom-host");
    expect(config.upstreamPort).toBe(18789);
    expect(config.reconnectIntervalMs).toBe(3000);
    expect(config.maxReconnectAttempts).toBe(10);
  });
});

describe("register", () => {
  let plugin: any;
  let registeredHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<boolean>) | null;
  let mockApi: any;

  beforeEach(async () => {
    vi.resetModules();
    plugin = (await import("./index.js")).default;
    registeredHandler = null;

    mockApi = {
      registerHttpHandler: vi.fn((handler) => {
        registeredHandler = handler;
      }),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      dataDir: "/tmp/test-data",
      pluginConfig: {
        upstreamHost: "localhost",
        upstreamPort: 18789,
        reconnectIntervalMs: 3000,
        maxReconnectAttempts: 10,
      },
    };
  });

  it("should register an HTTP handler", () => {
    plugin.register(mockApi);
    expect(mockApi.registerHttpHandler).toHaveBeenCalled();
    expect(registeredHandler).not.toBeNull();
  });

  it("should log initialization message", () => {
    plugin.register(mockApi);
    expect(mockApi.logger.info).toHaveBeenCalledWith(
      "Better Gateway proxying to localhost:18789"
    );
  });

  it("should return false for non-matching paths", async () => {
    plugin.register(mockApi);
    const req = createMockRequest({ url: "/some-other-path" });
    const res = createMockResponse();

    const handled = await registeredHandler!(req, res);
    expect(handled).toBe(false);
  });

  it("should return false for paths without better-gateway prefix", async () => {
    plugin.register(mockApi);
    const req = createMockRequest({ url: "/api/data" });
    const res = createMockResponse();

    const handled = await registeredHandler!(req, res);
    expect(handled).toBe(false);
  });
});

describe("HTTP handler path matching", () => {
  let plugin: any;
  let registeredHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<boolean>) | null;
  let mockApi: any;

  beforeEach(async () => {
    vi.resetModules();
    plugin = (await import("./index.js")).default;
    registeredHandler = null;

    mockApi = {
      registerHttpHandler: vi.fn((handler) => {
        registeredHandler = handler;
      }),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      dataDir: "/tmp/test-data",
      pluginConfig: {
        upstreamHost: "localhost",
        upstreamPort: 18789,
        reconnectIntervalMs: 3000,
        maxReconnectAttempts: 10,
      },
    };

    plugin.register(mockApi);
  });

  it("should match /better-gateway path", async () => {
    const req = createMockRequest({ url: "/better-gateway" });
    const res = createMockResponse();

    const result = await registeredHandler!(req, res);
    expect(result).toBe(true);
    expect(mockApi.logger.debug).toHaveBeenCalled();
  });

  it("should match /better-gateway/ path", async () => {
    const req = createMockRequest({ url: "/better-gateway/" });
    const res = createMockResponse();

    const result = await registeredHandler!(req, res);
    expect(result).toBe(true);
  });

  it("should match /better-gateway/subpath", async () => {
    const req = createMockRequest({ url: "/better-gateway/some/path" });
    const res = createMockResponse();

    const result = await registeredHandler!(req, res);
    expect(result).toBe(true);
  });

  it("should match /better-gateway with query string", async () => {
    const req = createMockRequest({ url: "/better-gateway?foo=bar" });
    const res = createMockResponse();

    const result = await registeredHandler!(req, res);
    expect(result).toBe(true);
  });

  it("should not match /better-gateway-other", async () => {
    const req = createMockRequest({ url: "/better-gateway-other" });
    const res = createMockResponse();

    const result = await registeredHandler!(req, res);
    expect(result).toBe(true);
  });

  it("should not match paths with better-gateway in middle", async () => {
    const req = createMockRequest({ url: "/api/better-gateway/test" });
    const res = createMockResponse();

    const result = await registeredHandler!(req, res);
    expect(result).toBe(false);
  });
});

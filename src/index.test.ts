import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";

// Mock fs
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "// mock inject script"),
}));

// Import after mocking
import plugin from "./index.js";

describe("Better Gateway Plugin", () => {
  describe("plugin metadata", () => {
    it("should have correct id", () => {
      expect(plugin.id).toBe("better-gateway");
    });

    it("should have correct name", () => {
      expect(plugin.name).toBe("Better Gateway");
    });

    it("should have configSchema", () => {
      expect(plugin.configSchema).toBeDefined();
      expect(typeof plugin.configSchema.parse).toBe("function");
    });
  });

  describe("configSchema.parse", () => {
    it("should return defaults for empty config", () => {
      const config = plugin.configSchema.parse({});
      expect(config).toEqual({
        reconnectIntervalMs: 3000,
        maxReconnectAttempts: 10,
      });
    });

    it("should parse custom reconnectIntervalMs", () => {
      const config = plugin.configSchema.parse({ reconnectIntervalMs: 5000 });
      expect(config.reconnectIntervalMs).toBe(5000);
    });

    it("should parse custom maxReconnectAttempts", () => {
      const config = plugin.configSchema.parse({ maxReconnectAttempts: 20 });
      expect(config.maxReconnectAttempts).toBe(20);
    });

    it("should handle undefined input", () => {
      const config = plugin.configSchema.parse(undefined);
      expect(config.reconnectIntervalMs).toBe(3000);
      expect(config.maxReconnectAttempts).toBe(10);
    });

    it("should handle null input", () => {
      const config = plugin.configSchema.parse(null);
      expect(config.reconnectIntervalMs).toBe(3000);
      expect(config.maxReconnectAttempts).toBe(10);
    });
  });

  describe("register", () => {
    let mockApi: {
      registerHttpHandler: Mock;
      logger: { info: Mock; warn: Mock; error: Mock; debug: Mock };
      dataDir: string;
      pluginConfig: Record<string, unknown>;
    };

    beforeEach(() => {
      mockApi = {
        registerHttpHandler: vi.fn(),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        },
        dataDir: "/tmp/test",
        pluginConfig: {},
      };
    });

    it("should register HTTP handler", () => {
      plugin.register(mockApi);
      expect(mockApi.registerHttpHandler).toHaveBeenCalledTimes(1);
      expect(typeof mockApi.registerHttpHandler.mock.calls[0][0]).toBe(
        "function"
      );
    });

    it("should log initialization with default config", () => {
      plugin.register(mockApi);
      expect(mockApi.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("3000ms")
      );
      expect(mockApi.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("10")
      );
    });

    it("should log initialization with custom config", () => {
      mockApi.pluginConfig = {
        reconnectIntervalMs: 5000,
        maxReconnectAttempts: 20,
      };
      plugin.register(mockApi);
      expect(mockApi.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("5000ms")
      );
      expect(mockApi.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("20")
      );
    });
  });

  describe("HTTP handler", () => {
    let handler: (
      req: IncomingMessage,
      res: ServerResponse
    ) => Promise<boolean>;
    let mockRes: Partial<ServerResponse> & {
      writeHead: Mock;
      end: Mock;
    };
    let mockLogger: { info: Mock; warn: Mock; error: Mock; debug: Mock };

    beforeEach(() => {
      mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };

      const mockApi = {
        registerHttpHandler: vi.fn((h) => {
          handler = h;
        }),
        logger: mockLogger,
        dataDir: "/tmp/test",
        pluginConfig: {},
      };

      plugin.register(mockApi);

      mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      };
    });

    function createMockReq(
      url: string,
      host = "localhost:18789"
    ): IncomingMessage {
      return {
        url,
        headers: { host },
        method: "GET",
      } as IncomingMessage;
    }

    it("should return false for non /better-gateway paths", async () => {
      const req = createMockReq("/");
      const result = await handler(req, mockRes as ServerResponse);
      expect(result).toBe(false);
    });

    it("should return false for /other paths", async () => {
      const req = createMockReq("/other");
      const result = await handler(req, mockRes as ServerResponse);
      expect(result).toBe(false);
    });

    describe("help page", () => {
      it("should serve help page at /better-gateway/help", async () => {
        const req = createMockReq("/better-gateway/help");
        const result = await handler(req, mockRes as ServerResponse);
        expect(result).toBe(true);
        expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
          "Content-Type": "text/html",
        }));
      });

      it("should include features in help page", async () => {
        const req = createMockReq("/better-gateway/help");
        await handler(req, mockRes as ServerResponse);
        const html = mockRes.end.mock.calls[0][0];
        expect(html).toContain("Better Gateway");
        expect(html).toContain("Auto-reconnect");
        expect(html).toContain("WebSocket");
      });

      it("should include bookmarklet link", async () => {
        const req = createMockReq("/better-gateway/help");
        await handler(req, mockRes as ServerResponse);
        const html = mockRes.end.mock.calls[0][0];
        expect(html).toContain("javascript:");
        expect(html).toContain("bookmarklet");
      });

      it("should include userscript instructions", async () => {
        const req = createMockReq("/better-gateway/help");
        await handler(req, mockRes as ServerResponse);
        const html = mockRes.end.mock.calls[0][0];
        expect(html).toContain("Tampermonkey");
        expect(html).toContain("==UserScript==");
      });
    })

    describe("enhanced gateway UI", () => {
      it("should return true for /better-gateway paths (proxied)", async () => {
        // For proxy tests we need to mock the http.request module
        // These tests verify the handler returns true for proxy paths
        // Full proxy behavior is tested in integration tests
        const req = createMockReq("/better-gateway");

        // Since http.request is not mocked, handler will make a real request
        // which will fail, but the handler should still return true
        const result = await handler(req, mockRes as ServerResponse);
        expect(result).toBe(true);
      });

      it("should return true for /better-gateway/ paths (proxied)", async () => {
        const req = createMockReq("/better-gateway/");
        const result = await handler(req, mockRes as ServerResponse);
        expect(result).toBe(true);
      });
    });

    describe("inject.js endpoint", () => {
      it("should serve inject.js at /better-gateway/inject.js", async () => {
        const req = createMockReq("/better-gateway/inject.js");
        const result = await handler(req, mockRes as ServerResponse);
        expect(result).toBe(true);
        expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
          "Content-Type": "application/javascript",
        }));
      });

      it("should include config in inject.js", async () => {
        const req = createMockReq("/better-gateway/inject.js");
        await handler(req, mockRes as ServerResponse);
        const script = mockRes.end.mock.calls[0][0];
        expect(script).toContain("__BETTER_GATEWAY_CONFIG__");
        expect(script).toContain("reconnectIntervalMs");
        expect(script).toContain("maxReconnectAttempts");
      });

      it("should set no-cache header", async () => {
        const req = createMockReq("/better-gateway/inject.js");
        await handler(req, mockRes as ServerResponse);
        expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
          "Cache-Control": "no-cache",
        }));
      });

      it("should log debug message", async () => {
        const req = createMockReq("/better-gateway/inject.js");
        await handler(req, mockRes as ServerResponse);
        expect(mockLogger.debug).toHaveBeenCalledWith("Served inject.js");
      });
    });

    describe("userscript endpoint", () => {
      it("should serve userscript at /better-gateway/userscript.user.js", async () => {
        const req = createMockReq("/better-gateway/userscript.user.js");
        const result = await handler(req, mockRes as ServerResponse);
        expect(result).toBe(true);
        expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
          "Content-Type": "application/javascript",
        }));
      });

      it("should set content-disposition for download", async () => {
        const req = createMockReq("/better-gateway/userscript.user.js");
        await handler(req, mockRes as ServerResponse);
        expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
          "Content-Disposition": "attachment; filename=better-gateway.user.js",
        }));
      });

      it("should include userscript header", async () => {
        const req = createMockReq("/better-gateway/userscript.user.js");
        await handler(req, mockRes as ServerResponse);
        const script = mockRes.end.mock.calls[0][0];
        expect(script).toContain("// ==UserScript==");
        expect(script).toContain("// @name");
        expect(script).toContain("// ==/UserScript==");
      });
    });

    describe("404 handling", () => {
      it("should return 404 for unknown /better-gateway/* paths", async () => {
        const req = createMockReq("/better-gateway/unknown");
        const result = await handler(req, mockRes as ServerResponse);
        expect(result).toBe(true);
        expect(mockRes.writeHead).toHaveBeenCalledWith(404, expect.objectContaining({
          "Content-Type": "text/plain",
        }));
        expect(mockRes.end).toHaveBeenCalledWith("Not found");
      });
    });
  });
});

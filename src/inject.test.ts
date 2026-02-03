import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const injectScript = readFileSync(join(__dirname, "inject.js"), "utf-8");

describe("inject.js - WebSocket auto-reconnect", () => {
  let dom: JSDOM;
  let window: any;
  let OriginalWebSocket: any;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      runScripts: "dangerously",
      url: "http://localhost:3000",
    });
    window = dom.window;

    OriginalWebSocket = vi.fn().mockImplementation(function (
      this: any,
      url: string,
      protocols?: string | string[]
    ) {
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0;
      this.listeners = new Map();

      this.addEventListener = vi.fn((event: string, callback: Function) => {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
      });

      this.removeEventListener = vi.fn();
      this.send = vi.fn();
      this.close = vi.fn();

      this.triggerEvent = (event: string, data: any = {}) => {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach((cb: Function) => cb(data));
      };

      return this;
    });

    OriginalWebSocket.CONNECTING = 0;
    OriginalWebSocket.OPEN = 1;
    OriginalWebSocket.CLOSING = 2;
    OriginalWebSocket.CLOSED = 3;
    OriginalWebSocket.prototype = {};

    window.WebSocket = OriginalWebSocket;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe("initialization", () => {
    it("should wrap the WebSocket constructor", () => {
      window.eval(injectScript);
      expect(window.WebSocket).not.toBe(OriginalWebSocket);
    });

    it("should preserve WebSocket static constants", () => {
      window.eval(injectScript);
      expect(window.WebSocket.CONNECTING).toBe(0);
      expect(window.WebSocket.OPEN).toBe(1);
      expect(window.WebSocket.CLOSING).toBe(2);
      expect(window.WebSocket.CLOSED).toBe(3);
    });

    it("should use default config when not provided", () => {
      window.eval(injectScript);
      expect(window.__BETTER_GATEWAY_CONFIG__).toBeUndefined();
    });

    it("should use provided config", () => {
      window.__BETTER_GATEWAY_CONFIG__ = {
        reconnectIntervalMs: 5000,
        maxReconnectAttempts: 20,
      };
      window.eval(injectScript);
      // Config is used internally, we just verify it doesn't throw
    });

    it("should log initialization message", () => {
      const consoleSpy = vi.spyOn(window.console, "log");
      window.eval(injectScript);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[BetterGateway] Auto-reconnect enabled",
        expect.any(Object)
      );
    });
  });

  describe("status indicator", () => {
    it("should create status indicator element on init", () => {
      window.eval(injectScript);
      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator).not.toBeNull();
    });

    it("should show Ready status on initialization", () => {
      window.eval(injectScript);
      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.innerHTML).toContain("Ready");
    });

    it("should have fixed positioning", () => {
      window.eval(injectScript);
      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.style.position).toBe("fixed");
      expect(indicator?.style.bottom).toBe("12px");
      expect(indicator?.style.right).toBe("12px");
    });

    it("should have correct z-index for visibility", () => {
      window.eval(injectScript);
      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.style.zIndex).toBe("999999");
    });
  });

  describe("WebSocket wrapping", () => {
    it("should create WebSocket with correct url", () => {
      window.eval(injectScript);
      const ws = new window.WebSocket("ws://localhost:8080");
      expect(OriginalWebSocket).toHaveBeenCalledWith(
        "ws://localhost:8080",
        undefined
      );
    });

    it("should create WebSocket with protocols", () => {
      window.eval(injectScript);
      const ws = new window.WebSocket("ws://localhost:8080", ["protocol1"]);
      expect(OriginalWebSocket).toHaveBeenCalledWith("ws://localhost:8080", [
        "protocol1",
      ]);
    });

    it("should attach event listeners to WebSocket", () => {
      window.eval(injectScript);
      const ws = new window.WebSocket("ws://localhost:8080");
      expect(ws.addEventListener).toHaveBeenCalledWith(
        "open",
        expect.any(Function)
      );
      expect(ws.addEventListener).toHaveBeenCalledWith(
        "close",
        expect.any(Function)
      );
      expect(ws.addEventListener).toHaveBeenCalledWith(
        "error",
        expect.any(Function)
      );
    });
  });

  describe("connection status updates", () => {
    it("should show Connected status on open event", () => {
      window.eval(injectScript);
      const ws = new window.WebSocket("ws://localhost:8080");
      ws.triggerEvent("open");

      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.innerHTML).toContain("Connected");
    });

    it("should show Connection error on error event", () => {
      window.eval(injectScript);
      const ws = new window.WebSocket("ws://localhost:8080");
      ws.triggerEvent("error");

      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.innerHTML).toContain("Connection error");
    });

    it("should show Disconnected on clean close", () => {
      window.eval(injectScript);
      const ws = new window.WebSocket("ws://localhost:8080");
      ws.triggerEvent("close", { wasClean: true });

      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.innerHTML).toContain("Disconnected");
    });
  });

  describe("reconnection logic", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should attempt reconnection on unclean close", () => {
      window.eval(injectScript);
      const ws = new window.WebSocket("ws://localhost:8080");
      ws.triggerEvent("close", { wasClean: false });

      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.innerHTML).toContain("Reconnecting");
      expect(indicator?.innerHTML).toContain("1/10");
    });

    it("should show failed status after max attempts", () => {
      window.__BETTER_GATEWAY_CONFIG__ = {
        reconnectIntervalMs: 100,
        maxReconnectAttempts: 2,
      };
      window.eval(injectScript);

      // First connection
      let ws = new window.WebSocket("ws://localhost:8080");
      ws.triggerEvent("close", { wasClean: false });

      // First reconnect attempt
      vi.advanceTimersByTime(100);
      const instances = OriginalWebSocket.mock.instances;
      const ws2 = instances[instances.length - 1];
      ws2.triggerEvent("close", { wasClean: false });

      // Second reconnect attempt
      vi.advanceTimersByTime(100);
      const ws3 = OriginalWebSocket.mock.instances[OriginalWebSocket.mock.instances.length - 1];
      ws3.triggerEvent("close", { wasClean: false });

      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.innerHTML).toContain("failed");
    });

    it("should reset attempts on successful connection", () => {
      window.eval(injectScript);

      // First connection fails
      let ws = new window.WebSocket("ws://localhost:8080");
      ws.triggerEvent("close", { wasClean: false });

      // Reconnect
      vi.advanceTimersByTime(3000);
      const instances = OriginalWebSocket.mock.instances;
      const ws2 = instances[instances.length - 1];

      // Successful connection
      ws2.triggerEvent("open");

      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.innerHTML).toContain("Connected");

      // Another disconnect - should start from 1 again
      ws2.triggerEvent("close", { wasClean: false });
      expect(indicator?.innerHTML).toContain("1/10");
    });
  });

  describe("network events", () => {
    it("should show Back online on online event", () => {
      window.eval(injectScript);
      window.dispatchEvent(new window.Event("online"));

      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.innerHTML).toContain("Back online");
    });

    it("should show Offline on offline event", () => {
      window.eval(injectScript);
      window.dispatchEvent(new window.Event("offline"));

      const indicator = window.document.getElementById("better-gateway-status");
      expect(indicator?.innerHTML).toContain("Offline");
    });
  });
});

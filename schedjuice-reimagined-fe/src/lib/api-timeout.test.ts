import { afterEach, describe, expect, it, vi } from "vitest";

describe("axiosClient timeout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses 10s in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { API_CLIENT_TIMEOUT_MS, axiosClient } = await import("./api");
    expect(API_CLIENT_TIMEOUT_MS).toBe(10_000);
    expect(axiosClient.defaults.timeout).toBe(10_000);
  });

  it("uses 30s in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { API_CLIENT_TIMEOUT_MS, axiosClient } = await import("./api");
    expect(API_CLIENT_TIMEOUT_MS).toBe(30_000);
    expect(axiosClient.defaults.timeout).toBe(30_000);
  });
});

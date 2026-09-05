import { describe, expect, it } from "vitest";

import { API_CLIENT_TIMEOUT_MS, axiosClient } from "./api";

describe("axiosClient timeout", () => {
  it("fails the request instead of waiting forever when the backend hangs", () => {
    expect(API_CLIENT_TIMEOUT_MS).toBe(10_000);
    expect(axiosClient.defaults.timeout).toBe(API_CLIENT_TIMEOUT_MS);
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthTokenPayload } from "@/helpers/auth-session";

type FakeClient = {
  (config: unknown): unknown;
  defaults: Record<string, unknown>;
  interceptors: {
    request: { use: ReturnType<typeof vi.fn> };
    response: { use: ReturnType<typeof vi.fn> };
  };
  post: ReturnType<typeof vi.fn>;
  onRejected?: (error: unknown) => Promise<unknown>;
};

const instances: FakeClient[] = [];

vi.mock("axios", () => {
  const create = () => {
    const client = vi.fn() as unknown as FakeClient;
    client.defaults = {};
    client.post = vi.fn();
    client.interceptors = {
      request: { use: vi.fn() },
      response: {
        use: vi.fn((_onOk, onRejected) => {
          client.onRejected = onRejected;
        }),
      },
    };
    instances.push(client);
    return client;
  };
  return { default: { create } };
});

vi.mock("cookies-next", () => ({
  getCookie: vi.fn(() => undefined),
}));

const clearAuthCookies = vi.fn();
const getRefreshCredentials = vi.fn(() => ({
  refresh: "refresh-token",
  session_id: "session-1",
}));
const unwrapAuthTokenPayload = vi.fn(
  (_body: unknown): AuthTokenPayload | null => null,
);

vi.mock("@/helpers/auth-session", () => ({
  clearAuthCookies: () => clearAuthCookies(),
  getRefreshCredentials: () => getRefreshCredentials(),
  persistAuthCookies: vi.fn(),
  unwrapAuthTokenPayload: (body: unknown) => unwrapAuthTokenPayload(body),
}));

let axiosClient: FakeClient;
let refreshClient: FakeClient;

beforeAll(async () => {
  await import("./api");
  [axiosClient, refreshClient] = instances;
});

/** A 401 on a normal request, which is what sends the client into the refresh flow. */
function expiredAccessTokenError() {
  return {
    response: { status: 401 },
    config: { url: "users/me", headers: {} as Record<string, string> },
  };
}

async function runRefreshFlow(refreshOutcome: {
  rejectWith?: unknown;
  resolveWith?: unknown;
}): Promise<"resolved" | "rejected"> {
  if (refreshOutcome.rejectWith !== undefined) {
    refreshClient.post.mockRejectedValueOnce(refreshOutcome.rejectWith);
  } else {
    refreshClient.post.mockResolvedValueOnce(refreshOutcome.resolveWith);
  }
  return await axiosClient.onRejected!(expiredAccessTokenError()).then(
    () => "resolved" as const,
    () => "rejected" as const,
  );
}

describe("token refresh failure handling", () => {
  beforeEach(() => {
    clearAuthCookies.mockClear();
    refreshClient.post.mockReset();
    unwrapAuthTokenPayload.mockReset().mockReturnValue(null);
  });

  it("keeps the session when the refresh request times out", async () => {
    const outcome = await runRefreshFlow({
      rejectWith: {
        code: "ECONNABORTED",
        message: "timeout of 10000ms exceeded",
      },
    });

    expect(outcome).toBe("rejected");
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it("keeps the session when the refresh request fails with a 5xx", async () => {
    const outcome = await runRefreshFlow({
      rejectWith: { response: { status: 502 } },
    });

    expect(outcome).toBe("rejected");
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it("signs the user out when the backend rejects the refresh token", async () => {
    const outcome = await runRefreshFlow({
      rejectWith: { response: { status: 401 } },
    });

    expect(outcome).toBe("rejected");
    expect(clearAuthCookies).toHaveBeenCalled();
  });

  it("signs the user out when the refresh responds 200 with an error body", async () => {
    const outcome = await runRefreshFlow({
      resolveWith: { data: { isError: true, message: "Invalid refresh token" } },
    });

    expect(outcome).toBe("rejected");
    expect(clearAuthCookies).toHaveBeenCalled();
  });
});

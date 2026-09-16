import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPublicTenant } from "./tenant";

describe("fetchPublicTenant", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("forwards Host as Origin, revalidates for 60s, and aborts after 1.5s", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isError: false, data: { id: 9, name: "SU" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tenant = await fetchPublicTenant("suconnect.thiha.net");

    expect(tenant).toEqual({ id: 9, name: "SU" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { next?: { revalidate: number } }];
    expect(url).toBe("http://localhost:8000/api/v1/organizations/public");
    expect(init.headers).toEqual({ Origin: "suconnect.thiha.net" });
    expect(init.next).toEqual({ revalidate: 60 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws when the public tenant response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 504, json: async () => ({}) }),
    );

    await expect(fetchPublicTenant("suconnect.thiha.net")).rejects.toThrow(/504/);
  });
});

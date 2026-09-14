import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("@/lib/api", () => ({
  axiosClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

describe("listMobileDevices", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({
      data: {
        data: {
          items: [{ id: 1, display_name: "Phone", is_active: true }],
          count: 1,
        },
      },
    });
  });

  it("passes filters and default page size to mobile-devices list endpoint", async () => {
    const { listMobileDevices } = await import("@/app/client-api/mobile-devices");
    const result = await listMobileDevices({
      user_id: 7,
      is_active: true,
      q: "james",
      page: 2,
    });
    expect(result.count).toBe(1);
    expect(getMock).toHaveBeenCalledWith("mobile-devices", {
      params: {
        user_id: 7,
        is_active: true,
        q: "james",
        page: 2,
        size: 25,
      },
    });
  });
});

describe("bulkRevokeMobileDevices", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({
      data: {
        data: {
          revoked_count: 2,
          sessions_revoked: 2,
          device_ids: [1, 2],
        },
      },
    });
  });

  it("posts device_ids to bulk-revoke endpoint", async () => {
    const { bulkRevokeMobileDevices } = await import(
      "@/app/client-api/mobile-devices"
    );
    const result = await bulkRevokeMobileDevices({ device_ids: [1, 2] });
    expect(result.revoked_count).toBe(2);
    expect(postMock).toHaveBeenCalledWith("mobile-devices/bulk-revoke", {
      device_ids: [1, 2],
    });
  });
});

describe("revokeStaleMobileDevices", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({
      data: {
        data: {
          revoked_count: 1,
          sessions_revoked: 1,
          device_ids: [9],
        },
      },
    });
  });

  it("posts inactive_days to revoke-stale endpoint", async () => {
    const { revokeStaleMobileDevices } = await import(
      "@/app/client-api/mobile-devices"
    );
    const result = await revokeStaleMobileDevices(90);
    expect(result.device_ids).toEqual([9]);
    expect(postMock).toHaveBeenCalledWith("mobile-devices/revoke-stale", {
      inactive_days: 90,
    });
  });
});

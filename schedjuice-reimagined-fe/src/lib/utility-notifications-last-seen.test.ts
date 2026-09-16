import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UtilityNotificationItem } from "@/types/utility-notification";
import { UtilityNotificationSeverity } from "@/types/utility-notification";
import {
  UTILITY_NOTIFICATIONS_LAST_SEEN_KEY,
  getUtilityNotificationsLastSeenAt,
  getUtilityNotificationsUnreadCount,
  markUtilityNotificationsSeenNow,
  setUtilityNotificationsLastSeenAt,
} from "./utility-notifications-last-seen";

function item(
  id: string,
  created_at: string
): UtilityNotificationItem {
  return {
    id,
    kind: "today_schedule",
    severity: UtilityNotificationSeverity.Success,
    title: "T",
    body: "B",
    created_at,
    route: "/shortcuts/todays-classes",
    params: {},
  };
}

describe("getUtilityNotificationsUnreadCount", () => {
  const items = [
    item("1", "2024-01-01T10:00:00.000Z"),
    item("2", "2024-01-02T10:00:00.000Z"),
    item("3", "2024-01-03T10:00:00.000Z"),
  ];

  it("counts all items when lastSeenAt is null", () => {
    expect(getUtilityNotificationsUnreadCount(items, null)).toBe(3);
  });

  it("counts all items when lastSeenAt is invalid ISO", () => {
    expect(getUtilityNotificationsUnreadCount(items, "not-a-date")).toBe(3);
  });

  it("counts only items strictly after lastSeenAt", () => {
    expect(
      getUtilityNotificationsUnreadCount(items, "2024-01-02T10:00:00.000Z")
    ).toBe(1);
  });

  it("does not count item with created_at equal to lastSeenAt", () => {
    expect(
      getUtilityNotificationsUnreadCount(
        [item("a", "2024-01-02T10:00:00.000Z")],
        "2024-01-02T10:00:00.000Z"
      )
    ).toBe(0);
  });

  it("ignores items with invalid created_at", () => {
    expect(
      getUtilityNotificationsUnreadCount(
        [item("bad", "invalid"), item("good", "2024-01-03T00:00:00.000Z")],
        "2024-01-01T00:00:00.000Z"
      )
    ).toBe(1);
  });

  it("returns 0 for empty items", () => {
    expect(
      getUtilityNotificationsUnreadCount([], "2024-01-01T00:00:00.000Z")
    ).toBe(0);
  });
});

describe("utility notifications last-seen localStorage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("get/set round-trips last seen ISO", () => {
    setUtilityNotificationsLastSeenAt("2024-06-01T12:00:00.000Z");
    expect(getUtilityNotificationsLastSeenAt()).toBe(
      "2024-06-01T12:00:00.000Z"
    );
    expect(store.get(UTILITY_NOTIFICATIONS_LAST_SEEN_KEY)).toBe(
      "2024-06-01T12:00:00.000Z"
    );
  });

  it("markUtilityNotificationsSeenNow writes a parseable ISO timestamp", () => {
    const before = Date.now();
    markUtilityNotificationsSeenNow();
    const after = Date.now();
    const stored = getUtilityNotificationsLastSeenAt();
    expect(stored).not.toBeNull();
    const ms = Date.parse(stored!);
    expect(Number.isNaN(ms)).toBe(false);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });
});

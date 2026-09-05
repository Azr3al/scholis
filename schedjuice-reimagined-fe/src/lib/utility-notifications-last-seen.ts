import type { UtilityNotificationItem } from "@/types/utility-notification";

export const UTILITY_NOTIFICATIONS_LAST_SEEN_KEY =
  "utilityNotificationsLastSeenAt";

function canUseLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function getUtilityNotificationsLastSeenAt(): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  return localStorage.getItem(UTILITY_NOTIFICATIONS_LAST_SEEN_KEY);
}

export function setUtilityNotificationsLastSeenAt(iso: string): void {
  if (!canUseLocalStorage()) {
    return;
  }
  localStorage.setItem(UTILITY_NOTIFICATIONS_LAST_SEEN_KEY, iso);
}

export function markUtilityNotificationsSeenNow(): void {
  setUtilityNotificationsLastSeenAt(new Date().toISOString());
}

export function getUtilityNotificationsUnreadCount(
  items: UtilityNotificationItem[],
  lastSeenAt: string | null
): number {
  if (!lastSeenAt) {
    return items.length;
  }
  const lastSeenMs = Date.parse(lastSeenAt);
  if (Number.isNaN(lastSeenMs)) {
    return items.length;
  }
  return items.filter((item) => {
    const createdMs = Date.parse(item.created_at);
    return !Number.isNaN(createdMs) && createdMs > lastSeenMs;
  }).length;
}

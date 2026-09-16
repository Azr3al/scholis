import { axiosClient } from "@/lib/api";
import type { UtilityNotificationItem } from "@/types/utility-notification";

export async function fetchUtilityNotifications(): Promise<
  UtilityNotificationItem[]
> {
  const { data } = await axiosClient.get("utility-notifications/me");
  const items = (data as { data?: { items?: unknown } })?.data?.items;
  return Array.isArray(items) ? (items as UtilityNotificationItem[]) : [];
}

"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useUser } from "@/hooks/useUser";
import { fetchUtilityNotifications } from "@/lib/utility-notifications-api";
import {
  getUtilityNotificationsLastSeenAt,
  getUtilityNotificationsUnreadCount,
} from "@/lib/utility-notifications-last-seen";

export function useUtilityNotifications() {
  const { user } = useUser();

  const query = useQuery({
    queryKey: ["utility-notifications", user?.id],
    queryFn: fetchUtilityNotifications,
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
  });

  const items = query.data ?? [];

  const unreadCount = useMemo(() => {
    const lastSeenAt = getUtilityNotificationsLastSeenAt();
    return getUtilityNotificationsUnreadCount(items, lastSeenAt);
  }, [items]);

  return {
    items,
    unreadCount,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
  };
}

"use client";

import Link from "next/link";
import type { UtilityNotificationItem } from "@/types/utility-notification";
import { getUtilityNotificationIcon } from "@/lib/utility-notification-display";
import { resolveUtilityNotificationHref } from "@/lib/resolve-utility-notification-href";
import { formatRelativeTime } from "@/helpers/date";
import { cn } from "@/lib/utils";

export interface NotificationListItemProps {
  item: UtilityNotificationItem;
}

export function NotificationListItem({ item }: NotificationListItemProps) {
  const { Icon, colorClass } = getUtilityNotificationIcon(item.kind, item.severity);
  const href = resolveUtilityNotificationHref(item.route, item.params);
  const relativeTime = formatRelativeTime(item.created_at);

  const content = (
    <div className="flex items-start gap-3 p-4">
      <div className={cn("flex-shrink-0", colorClass)}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{item.title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{item.body}</div>
        <div className="mt-2 text-xs text-muted-foreground">{relativeTime}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block border-b border-border bg-card hover:bg-muted/50 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {content}
      </Link>
    );
  }

  // No resolvable href - render as non-interactive row
  return (
    <div className="border-b border-border bg-card opacity-60">
      {content}
    </div>
  );
}
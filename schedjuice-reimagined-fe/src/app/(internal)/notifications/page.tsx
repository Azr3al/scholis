"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useEffect, useMemo, useState } from "react";
import { Refresh as RefreshCw } from "iconoir-react";

import { Button } from "@/components/primitives";
import { Skeleton } from "@/components/primitives";
import { NotificationListItem } from "@/components/notification/notification-list-item";
import {
  NotificationSeverityFilter,
  type FilterSeverity,
} from "@/components/notification/notification-severity-filter";
import { useUtilityNotifications } from "@/hooks/useUtilityNotifications";
import { markUtilityNotificationsSeenNow } from "@/lib/utility-notifications-last-seen";
import { WebPushPrompt } from "@/components/web-push/web-push-prompt";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(internal)/notifications"),
);

export default function NotificationsPage() {
  const { items, isLoading, isRefetching, error, refetch } =
    useUtilityNotifications();
  const [severityFilter, setSeverityFilter] = useState<FilterSeverity>("all");

  useEffect(() => {
    markUtilityNotificationsSeenNow();
  }, []);

  const filteredItems = useMemo(() => {
    if (severityFilter === "all") {
      return items;
    }
    return items.filter((item) => item.severity === severityFilter);
  }, [items, severityFilter]);

  const handleRefresh = () => {
    refetch();
  };

  const headerConfig = useMemo(
    () => ({
      toolbarSecondary: (
        <p className="text-sm text-text-muted">Important updates and reminders</p>
      ),
      toolbar: (
        <NotificationSeverityFilter
          value={severityFilter}
          onChange={setSeverityFilter}
        />
      ),
      actions: (
        <Button
          variant="secondary"
          size="sm"
          className="w-auto min-w-[8rem]"
          onClick={handleRefresh}
          isLoading={isRefetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      ),
    }),
    [severityFilter, isRefetching],
  );
  usePageHeader(headerConfig);

  if (isLoading) {
    return (
      <PageContainer width={PAGE_WIDTH} className="w-full min-w-0 space-y-6">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>
            ))}
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer width={PAGE_WIDTH} className="w-full min-w-0 space-y-6">
        <div className="py-12 text-center">
          <p className="text-sm text-text-muted">
            Unable to load notifications right now. Please try again.
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={handleRefresh}
            isLoading={isRefetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width={PAGE_WIDTH} className="w-full min-w-0 space-y-6">
      <WebPushPrompt />

      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <EmptyState>
            {severityFilter === "all" ? (
              <EmptyCopy {...EMPTY_COPY_PRESETS.nothingNew} />
            ) : (
              <EmptyCopy
                enBefore="No "
                enHighlight={severityFilter}
                enAfter=" notifications"
                myBefore={`${severityFilter} အကြောင်းကြား`}
                myHighlight="မရှိ"
                myAfter="ပါ"
              />
            )}
          </EmptyState>
        ) : (
          <div className="space-y-0 overflow-hidden rounded-lg border border-border">
            {filteredItems.map((item) => (
              <NotificationListItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

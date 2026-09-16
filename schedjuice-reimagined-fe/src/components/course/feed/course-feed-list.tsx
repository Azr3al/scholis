"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";

import { searchEntities } from "@/app/client-api/utils";
import { CourseFeedTimeline } from "@/components/course/feed/course-feed-timeline";
import { EmptyState } from "@/components/primitives/empty";
import { Spinner } from "@/components/primitives/spinner";
import { useTenant } from "@/hooks/useTenant";
import { operatorEnum } from "@/types/api";
import type { CourseFeedPost } from "@/types/course-feed";
import type { MonthBounds } from "@/components/course/feed/course-feed-month-toolbar";

export function CourseFeedList({
  courseId,
  canEdit,
  microsoftGroupId,
  microsoftChannelId,
  editingPostId,
  onEditPost,
  monthBounds,
}: {
  courseId: number;
  canEdit: boolean;
  microsoftGroupId?: string | null;
  microsoftChannelId?: string | null;
  editingPostId: number | null;
  onEditPost: (id: number | null) => void;
  monthBounds: MonthBounds;
}) {
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const { tenant } = useTenant();
  const tz = tenant?.timezone ?? "UTC";
  const { startIso, endIso } = monthBounds;

  const monthLabel = formatInTimeZone(startIso, tz, "MMMM yyyy");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["courseFeed", courseId, startIso, endIso],
      queryFn: ({ pageParam }) =>
        searchEntities(
          "announcements",
          {
            page: pageParam,
            size: 10,
            sorts: ["-created_at"],
            expand: ["attachments", "created_by"],
          },
          {
            filter_params: [
              {
                field_name: "course",
                value: String(courseId),
                operator: operatorEnum.exact,
              },
              {
                field_name: "created_at",
                operator: operatorEnum.gte,
                value: startIso,
              },
              {
                field_name: "created_at",
                operator: operatorEnum.lte,
                value: endIso,
              },
            ],
          },
        ),
      refetchOnWindowFocus: false,
      getNextPageParam: (lastPage, pages) =>
        lastPage.data.links.next ? pages.length + 1 : undefined,
    });

  const posts: CourseFeedPost[] =
    data?.pages.flatMap((page) => page?.data.data ?? []) ?? [];

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center gap-2 py-6"
        aria-busy
      >
        <Spinner className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading feed…</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <EmptyState>
        <p className="text-sm text-muted-foreground">
          No posts in {monthLabel}.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col">
      <CourseFeedTimeline
        posts={posts}
        timezone={tz}
        canEdit={canEdit}
        microsoftGroupId={microsoftGroupId}
        microsoftChannelId={microsoftChannelId}
        editingPostId={editingPostId}
        onEditPost={onEditPost}
      />
      <span ref={sentinelRef} aria-hidden className="h-1 w-full" />
      {isFetchingNextPage && (
        <p className="text-center text-sm text-muted-foreground py-2">
          Loading more…
        </p>
      )}
    </div>
  );
}

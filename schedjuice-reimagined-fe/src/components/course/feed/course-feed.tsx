"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import { CourseFeedList } from "@/components/course/feed/course-feed-list";
import {
  CourseFeedMonthToolbar,
  defaultMonthBounds,
  type MonthBounds,
} from "@/components/course/feed/course-feed-month-toolbar";
import { useTenant } from "@/hooks/useTenant";

const CourseFeedComposer = dynamic(
  () =>
    import("@/components/course/feed/course-feed-composer").then(
      (m) => m.CourseFeedComposer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-24 w-full animate-pulse rounded-md bg-muted/40" />
    ),
  },
);

export function CourseFeed({
  courseId,
  canEdit,
  microsoftGroupId,
  microsoftChannelId,
}: {
  courseId: number;
  canEdit: boolean;
  microsoftGroupId?: string | null;
  microsoftChannelId?: string | null;
}) {
  const { tenant } = useTenant();
  const tz = tenant?.timezone ?? "UTC";
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [monthBounds, setMonthBounds] = useState<MonthBounds>(() =>
    defaultMonthBounds(tz),
  );

  const handleBoundsChange = useCallback((bounds: MonthBounds) => {
    setMonthBounds(bounds);
  }, []);

  const boundsKey = useMemo(
    () => `${monthBounds.startIso}-${monthBounds.endIso}`,
    [monthBounds],
  );

  return (
    <section aria-label="Course feed" className="flex flex-col gap-4">
      {canEdit && editingPostId === null && (
        <CourseFeedComposer
          courseId={courseId}
          mode="create"
          microsoftGroupId={microsoftGroupId}
          microsoftChannelId={microsoftChannelId}
          onCancel={() => {}}
          onSuccess={() => {}}
        />
      )}
      <CourseFeedMonthToolbar onBoundsChange={handleBoundsChange} />
      <CourseFeedList
        key={boundsKey}
        courseId={courseId}
        canEdit={canEdit}
        microsoftGroupId={microsoftGroupId}
        microsoftChannelId={microsoftChannelId}
        editingPostId={editingPostId}
        onEditPost={setEditingPostId}
        monthBounds={monthBounds}
      />
    </section>
  );
}

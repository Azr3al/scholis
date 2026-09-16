"use client";

import { useMemo } from "react";
import { useDateFormatter } from "react-aria";

import { CourseFeedCard } from "@/components/course/feed/course-feed-card";
import { buildFeedTimeline } from "@/lib/course-feed-timeline";
import type { CourseFeedPost } from "@/types/course-feed";
import { cn } from "@/lib/utils";

export function CourseFeedTimeline({
  posts,
  timezone,
  canEdit,
  microsoftGroupId,
  microsoftChannelId,
  editingPostId,
  onEditPost,
}: {
  posts: CourseFeedPost[];
  timezone: string;
  canEdit: boolean;
  microsoftGroupId?: string | null;
  microsoftChannelId?: string | null;
  editingPostId: number | null;
  onEditPost: (id: number | null) => void;
}) {
  const dateLabelFormatter = useDateFormatter({
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const formatDateLabel = useMemo(
    () => (ymd: string) => {
      const [y, m, d] = ymd.split("-").map(Number);
      return dateLabelFormatter.format(new Date(y, m - 1, d, 12, 0, 0));
    },
    [dateLabelFormatter],
  );

  const items = useMemo(
    () => buildFeedTimeline(posts, timezone, formatDateLabel),
    [posts, timezone, formatDateLabel],
  );

  let postOrdinal = 0;

  return (
    <ol aria-label="Course feed timeline" className="flex flex-col">
      {items.map((item) => {
        if (item.kind === "day-divider") {
          return (
            <li
              key={item.key}
              className="flex justify-center my-3 list-none"
              role="separator"
            >
              <span className="text-[11px] text-muted-foreground bg-muted/50 px-2.5 py-0.5 rounded-full">
                {item.label}
              </span>
            </li>
          );
        }

        const post = posts[item.postIndex];
        const isLastPost = item.postIndex === posts.length - 1;

        return (
          <li
            key={post.id}
            className={cn(
              "relative flex gap-3 pb-6 list-none",
              editingPostId === post.id && "pb-4",
            )}
          >
            {!isLastPost && (
              <span
                className="absolute left-[7px] top-5 h-[calc(100%-0.5rem)] w-px bg-border"
                aria-hidden
              />
            )}
            <span
              className="relative z-10 mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <CourseFeedCard
                post={post}
                timezone={timezone}
                canEdit={canEdit}
                microsoftGroupId={microsoftGroupId}
                microsoftChannelId={microsoftChannelId}
                isEditing={editingPostId === post.id}
                onEdit={() => onEditPost(post.id)}
                onCancelEdit={() => onEditPost(null)}
                onDelete={() => onEditPost(null)}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

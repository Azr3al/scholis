import type { JSONContent } from "@tiptap/core";

import {
  authorAvatar,
  authorId,
  authorName,
  dailyLessonDisplayHeader,
  type CourseFeedPost,
} from "@/types/course-feed";
import type { attachmentType } from "@/types/attachment";

import type { FeedPostAuthor, FeedPostViewModel } from "./feed-post-view-model";

export type AnnouncementRowAuthor =
  | number
  | { id: number; name?: string; profile_image?: string | null }
  | null
  | undefined;

export type AnnouncementRow = {
  id: number;
  post_type?: "announcement" | "daily_lesson";
  title?: string | null;
  finished_unit?: number | null;
  data?: string | null;
  html_data?: string | null;
  json_data?: JSONContent | Record<string, unknown> | null;
  created_at: string;
  created_by?: AnnouncementRowAuthor;
  is_pinned?: boolean;
  attachments?: attachmentType[];
};

function authorFromCreatedBy(createdBy: AnnouncementRowAuthor): FeedPostAuthor {
  if (typeof createdBy === "object" && createdBy !== null) {
    return {
      id: createdBy.id,
      name: createdBy.name ?? "Unknown",
      avatarUrl: createdBy.profile_image ?? null,
    };
  }
  if (typeof createdBy === "number") {
    return { id: createdBy, name: "Unknown", avatarUrl: null };
  }
  return { id: null, name: "Unknown", avatarUrl: null };
}

function resolveTitle(
  postType: FeedPostViewModel["postType"],
  title: string | null | undefined,
  finishedUnit: number | null | undefined,
): string {
  if (postType === "daily_lesson") {
    return dailyLessonDisplayHeader(finishedUnit ?? null);
  }
  return title?.trim() || "Announcement";
}

export function courseFeedPostToViewModel(post: CourseFeedPost): FeedPostViewModel {
  const postType = post.post_type ?? "announcement";
  return {
    id: post.id,
    postType,
    title: resolveTitle(postType, post.title, post.finished_unit),
    bodyHtml: post.data ?? post.html_data ?? null,
    bodyJson: post.json_data ?? null,
    createdAt: post.created_at,
    author: {
      id: authorId(post.created_by),
      name: authorName(post.created_by),
      avatarUrl: authorAvatar(post.created_by),
    },
    attachments: post.attachments ?? [],
    isPinned: false,
    finishedUnit: post.finished_unit,
  };
}

export function announcementRowToViewModel(row: AnnouncementRow): FeedPostViewModel {
  const postType = row.post_type ?? "announcement";
  return {
    id: row.id,
    postType,
    title: resolveTitle(postType, row.title, row.finished_unit),
    bodyHtml: row.data ?? row.html_data ?? null,
    bodyJson: row.json_data ?? null,
    createdAt: row.created_at,
    author: authorFromCreatedBy(row.created_by),
    attachments: row.attachments ?? [],
    isPinned: Boolean(row.is_pinned),
    finishedUnit: row.finished_unit ?? null,
  };
}

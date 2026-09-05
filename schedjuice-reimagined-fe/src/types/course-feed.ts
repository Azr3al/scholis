import * as z from "zod";
import type { attachmentType } from "@/types/attachment";

export const postTypeSchema = z.enum(["announcement", "daily_lesson"]);
export type PostType = z.infer<typeof postTypeSchema>;

export type CourseFeedPost = {
  id: number;
  post_type: PostType;
  course: number;
  title: string | null;
  finished_unit: number | null;
  html_data: string | null;
  data: string | null;
  json_data: Record<string, unknown> | null;
  created_by:
    | number
    | { id: number; name?: string; profile_image?: string | null };
  created_at: string;
  updated_at: string;
  send_to_microsoft?: boolean;
  microsoft_channel_id?: string | null;
  microsoft_teams_status?: "pending" | "sent" | "failed" | null;
  microsoft_teams_error?: string | null;
  attachments?: attachmentType[];
};

export function dailyLessonHeader(finishedUnit: number): string {
  return `Unit ${finishedUnit} covered today`;
}

export function dailyLessonDisplayHeader(finishedUnit: number | null): string {
  return finishedUnit != null ? dailyLessonHeader(finishedUnit) : "Daily lesson";
}

export type CourseFeedAuthor = Extract<CourseFeedPost["created_by"], object>;

export function authorName(
  createdBy: CourseFeedPost["created_by"],
): string {
  if (typeof createdBy === "object" && createdBy !== null) {
    return createdBy.name ?? "Unknown";
  }
  return "Unknown";
}

export function authorAvatar(
  createdBy: CourseFeedPost["created_by"],
): string | null {
  if (typeof createdBy === "object" && createdBy !== null) {
    return createdBy.profile_image ?? null;
  }
  return null;
}

export function authorId(
  createdBy: CourseFeedPost["created_by"],
): number | null {
  if (typeof createdBy === "number") {
    return createdBy;
  }
  if (typeof createdBy === "object" && createdBy !== null) {
    return createdBy.id;
  }
  return null;
}

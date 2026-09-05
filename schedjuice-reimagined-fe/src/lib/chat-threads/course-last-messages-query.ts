import { axiosClient } from "@/lib/api";
import type {
  CourseChatLastMessagePreview,
  CourseChatLastMessagesResponse,
} from "@/types/chat";

/** Stable query-key segment from course ids (sorted, comma-joined). */
export function buildCourseIdsKey(courseIds: number[]): string {
  return [...courseIds].sort((a, b) => a - b).join(",");
}

export function chatCourseLastMessagesQueryKey(courseIdsKey: string) {
  return ["chat-course-last-messages", courseIdsKey] as const;
}

export async function fetchCourseChatLastMessages(
  courseIds: number[]
): Promise<CourseChatLastMessagesResponse> {
  if (courseIds.length === 0) return {};
  const params = new URLSearchParams({ course_ids: courseIds.join(",") });
  const { data } = await axiosClient.get(
    `courses/chat/last-messages?${params.toString()}`
  );
  const inner = (data as { data?: unknown } | undefined)?.data;
  return inner && typeof inner === "object" && !Array.isArray(inner)
    ? (inner as CourseChatLastMessagesResponse)
    : {};
}

/** Map batch response to one course preview (missing / no-thread → null preview, 0 unread). */
export function getCoursePreviewFromBatch(
  response: CourseChatLastMessagesResponse,
  courseId: number
): CourseChatLastMessagePreview {
  const entry = response[String(courseId)];
  return {
    last_message: entry?.last_message ?? null,
    unread_count:
      typeof entry?.unread_count === "number" ? entry.unread_count : 0,
  };
}

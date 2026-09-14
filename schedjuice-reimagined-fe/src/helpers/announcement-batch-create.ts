import type { AnnouncementBatchCreateResult } from "@/types/announcement-batch";

export function parseAnnouncementBatchCreateResult(
  response: unknown,
): AnnouncementBatchCreateResult {
  const payload = response as {
    data?: { data?: AnnouncementBatchCreateResult };
  };
  const data = payload?.data?.data;
  return {
    created: data?.created ?? [],
    failed: data?.failed ?? [],
  };
}

export function getBatchCreateToastMessage(
  createdCount: number,
  failedCount: number,
): { type: "success" | "error"; description: string } {
  if (createdCount > 0 && failedCount === 0) {
    const description =
      createdCount === 1
        ? "Announcement created successfully"
        : `Created announcement for ${createdCount} courses`;
    return { type: "success", description };
  }
  if (createdCount > 0 && failedCount > 0) {
    const total = createdCount + failedCount;
    return {
      type: "error",
      description: `Created for ${createdCount} of ${total} courses. ${failedCount} failed.`,
    };
  }
  return {
    type: "error",
    description: "Could not create announcement.",
  };
}

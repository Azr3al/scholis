import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  axiosClient: { get: vi.fn() },
}));

import { getCoursePreviewFromBatch } from "@/lib/chat-threads/course-last-messages-query";

describe("getCoursePreviewFromBatch", () => {
  it("returns null preview and zero unread when course is missing", () => {
    expect(getCoursePreviewFromBatch({}, 7)).toEqual({
      last_message: null,
      unread_count: 0,
    });
  });

  it("handles explicit null last_message from backend", () => {
    expect(
      getCoursePreviewFromBatch(
        { "3": { last_message: null, unread_count: 0 } },
        3
      )
    ).toEqual({ last_message: null, unread_count: 0 });
  });
});

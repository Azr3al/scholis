import { describe, expect, it } from "vitest";

import {
  announcementRowToViewModel,
  courseFeedPostToViewModel,
} from "@/components/feed/feed-post-adapters";

describe("feed-post-adapters", () => {
  it("maps expanded created_by on announcement rows", () => {
    const vm = announcementRowToViewModel({
      id: 7,
      title: "Holiday notice",
      data: "<p>Closed Monday</p>",
      created_at: "2026-08-01T10:00:00Z",
      created_by: {
        id: 42,
        name: "Admin User",
        profile_image: "https://cdn.example.com/a.png",
      },
      is_pinned: true,
    });

    expect(vm.author).toEqual({
      id: 42,
      name: "Admin User",
      avatarUrl: "https://cdn.example.com/a.png",
    });
    expect(vm.title).toBe("Holiday notice");
    expect(vm.isPinned).toBe(true);
  });

  it("falls back to Announcement when title is empty", () => {
    const vm = announcementRowToViewModel({
      id: 1,
      title: "   ",
      created_at: "2026-08-01T10:00:00Z",
    });

    expect(vm.title).toBe("Announcement");
  });

  it("maps course feed posts with daily lesson headers", () => {
    const vm = courseFeedPostToViewModel({
      id: 3,
      post_type: "daily_lesson",
      course: 9,
      title: null,
      finished_unit: 4,
      html_data: null,
      data: null,
      json_data: null,
      created_by: { id: 2, name: "Teacher A", profile_image: null },
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:00:00Z",
    });

    expect(vm.title).toBe("Unit 4 covered today");
    expect(vm.author.name).toBe("Teacher A");
    expect(vm.isPinned).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { buildCourseFeedUpdateFormData } from "./course-feed-update-form-data";

describe("buildCourseFeedUpdateFormData", () => {
  it("appends fields, files, and deleted ids", () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    const fd = buildCourseFeedUpdateFormData({
      post_type: "daily_lesson",
      finished_unit: 3,
      html_data: "<p>Hi</p>",
      course: 12,
      send_to_microsoft: true,
      newFiles: [file],
      deletedAttachmentIds: [5, 6],
    });
    expect(fd.get("post_type")).toBe("daily_lesson");
    expect(fd.get("finished_unit")).toBe("3");
    expect(fd.get("send_to_microsoft")).toBe("true");
    expect(fd.getAll("files")).toHaveLength(1);
    expect(fd.get("deleted_attachment_ids")).toBe("[5,6]");
  });

  it("clears finished_unit when ineligible", () => {
    const fd = buildCourseFeedUpdateFormData({
      post_type: "daily_lesson",
      finished_unit: null,
      html_data: "<p>Hi</p>",
      course: 12,
    });
    expect(fd.get("finished_unit")).toBe("");
  });
});

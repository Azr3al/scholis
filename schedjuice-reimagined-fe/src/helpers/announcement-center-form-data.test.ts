import { describe, expect, it } from "vitest";
import { AnnouncementCenterScope } from "@/types/announcement-center";
import { buildAnnouncementCenterFormData } from "./announcement-center-form-data";

describe("buildAnnouncementCenterFormData", () => {
  it("omits course for org-wide scope", () => {
    const fd = buildAnnouncementCenterFormData({
      scope: AnnouncementCenterScope.OrgWide,
      title: "Hello",
      dataHtml: "<p>Hi</p>",
      createdById: 1,
      files: [],
    });
    expect(fd.get("title")).toBe("Hello");
    expect(fd.get("course")).toBeNull();
    expect(fd.get("post_type")).toBe("announcement");
  });

  it("includes course_ids for per-course scope", () => {
    const fd = buildAnnouncementCenterFormData({
      scope: AnnouncementCenterScope.PerCourse,
      courseIds: [42, 43],
      title: "Class note",
      dataHtml: "<p>Note</p>",
      createdById: 1,
      files: [],
    });
    expect(fd.get("course_ids")).toBe("[42,43]");
    expect(fd.get("course")).toBeNull();
  });

  it("appends Teams fields for org-wide broadcast", () => {
    const fd = buildAnnouncementCenterFormData({
      scope: AnnouncementCenterScope.OrgWide,
      title: "Teams",
      dataHtml: "<p>T</p>",
      createdById: 1,
      files: [],
      sendToMicrosoft: true,
      courseFilters: { month_type: "ALL", category_ids: [3] },
    });
    expect(fd.get("send_to_microsoft")).toBe("true");
    expect(fd.get("course_filters")).toBe(
      JSON.stringify({ month_type: "ALL", category_ids: [3] }),
    );
  });
});

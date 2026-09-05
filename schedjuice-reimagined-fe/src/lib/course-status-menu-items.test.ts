import { describe, expect, it } from "vitest";
import { getCourseStatusMenuItems } from "./course-status-menu-items";
import { courseStatus } from "@/types/course";

describe("getCourseStatusMenuItems", () => {
  it("returns pause and end for active courses", () => {
    expect(getCourseStatusMenuItems(courseStatus.active)).toEqual([
      "pause",
      "end",
    ]);
  });

  it("returns resume and end for paused courses", () => {
    expect(getCourseStatusMenuItems(courseStatus.paused)).toEqual([
      "resume",
      "end",
    ]);
  });

  it("returns end only for planned courses", () => {
    expect(getCourseStatusMenuItems(courseStatus.planned)).toEqual(["end"]);
  });

  it("returns reactivate only for ended courses", () => {
    expect(getCourseStatusMenuItems(courseStatus.ended)).toEqual([
      "reactivate",
    ]);
  });
});

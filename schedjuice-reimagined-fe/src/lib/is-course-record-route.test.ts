import { describe, expect, it } from "vitest";
import { isCourseRecordRoute } from "./is-course-record-route";

describe("isCourseRecordRoute", () => {
  it("matches course detail paths", () => {
    expect(isCourseRecordRoute("/courses/42")).toBe(true);
    expect(isCourseRecordRoute("/courses/42/schedule")).toBe(true);
    expect(isCourseRecordRoute("/courses/42/edit")).toBe(true);
  });

  it("rejects non-course paths", () => {
    expect(isCourseRecordRoute("/courses")).toBe(false);
    expect(isCourseRecordRoute("/courses/create")).toBe(false);
    expect(isCourseRecordRoute("/users/1")).toBe(false);
  });
});

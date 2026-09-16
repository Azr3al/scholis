import { describe, expect, it } from "vitest";
import {
  ADMISSIONS_CONTEXT_PARENT,
  ADMISSIONS_RECORD_NAV_ENTRIES,
  admissionsRecordNavActive,
} from "../admissions-record-nav";

describe("ADMISSIONS_CONTEXT_PARENT", () => {
  it("stays People at /admissions for the icon rail", () => {
    expect(ADMISSIONS_CONTEXT_PARENT).toEqual({
      label: "People",
      href: "/admissions",
    });
  });
});

describe("admissionsRecordNavActive", () => {
  const people = ADMISSIONS_RECORD_NAV_ENTRIES[0];
  const courses = ADMISSIONS_RECORD_NAV_ENTRIES[1];

  it("marks People only on /admissions", () => {
    expect(admissionsRecordNavActive(people, "/admissions")).toBe(true);
    expect(admissionsRecordNavActive(people, "/admissions/courses")).toBe(
      false,
    );
  });

  it("marks Courses on /admissions/courses", () => {
    expect(admissionsRecordNavActive(courses, "/admissions/courses")).toBe(
      true,
    );
    expect(admissionsRecordNavActive(courses, "/admissions")).toBe(false);
  });
});

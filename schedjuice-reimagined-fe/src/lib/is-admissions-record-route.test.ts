import { describe, expect, it } from "vitest";
import { isAdmissionsRecordRoute } from "./is-admissions-record-route";

describe("isAdmissionsRecordRoute", () => {
  it("matches admissions desk routes", () => {
    expect(isAdmissionsRecordRoute("/admissions")).toBe(true);
    expect(isAdmissionsRecordRoute("/admissions/courses")).toBe(true);
  });

  it("rejects unrelated routes and prefix collisions", () => {
    expect(isAdmissionsRecordRoute("/users")).toBe(false);
    expect(isAdmissionsRecordRoute("/admissionsx")).toBe(false);
  });
});

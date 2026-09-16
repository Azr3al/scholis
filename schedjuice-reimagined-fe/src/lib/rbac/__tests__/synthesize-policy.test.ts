import { describe, it, expect } from "vitest";
import { synthesizePolicy } from "../synthesize-policy";

const catalog = [
  { code: "course.view", sentence: "view courses they are connected to", data_class: "Academic", sensitive: false },
  { code: "course.update", sentence: "edit courses", data_class: "Academic", sensitive: false },
  { code: "course.manage_all", sentence: "manage every course across the school", data_class: "Academic", sensitive: true },
  { code: "course.view_all", sentence: "view every course in the school", data_class: "Academic", sensitive: false },
  { code: "payment.verify", sentence: "verify and approve student payments", data_class: "Financial", sensitive: true },
];

describe("synthesizePolicy", () => {
  it("marks org-wide breadth when manage_all is held", () => {
    const r = synthesizePolicy(["course.view", "course.update", "course.manage_all"], catalog);
    const course = r.can.find((g) => g.domain === "course")!;
    expect(course.scope).toBe("all");
    expect(course.text.toLowerCase()).toContain("across the school");
  });
  it("marks assigned-only when no breadth code", () => {
    const r = synthesizePolicy(["course.view", "course.update"], catalog);
    expect(r.can.find((g) => g.domain === "course")!.scope).toBe("own");
  });
  it("lists sensitive unheld codes under cannot", () => {
    const r = synthesizePolicy(["course.view"], catalog);
    expect(r.cannot.some((c) => c.code === "payment.verify")).toBe(true);
  });
  it("flags can-grant when rbac.manage held", () => {
    const r = synthesizePolicy(["rbac.manage"], [{ code: "rbac.manage", sentence: "edit roles and the matrix", data_class: "Operational", sensitive: true }]);
    expect(r.canGrantRoles).toBe(true);
  });
});

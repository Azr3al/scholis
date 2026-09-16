import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn() } }));

import { buildFindPageItems } from "../find-page-items";
import { makePermissionChecker } from "@/hooks/usePermissions";
import type { organizationType } from "@/types/organization";
import { accountType, role } from "@/types/user";

const STUDENT_PERMS = [
  "course.view",
  "payment.make",
  "library.view",
  "chat.participate",
  "grade.view",
  "assignment.submit",
  "quiz.take",
];

const tenant = { id: 1 } as unknown as organizationType;

describe("buildFindPageItems", () => {
  it("includes permission-visible nav pages for a student-like user", () => {
    const items = buildFindPageItems({
      checker: makePermissionChecker(STUDENT_PERMS),
      tenant,
      user: undefined,
    });
    const pageHrefs = items.filter((i) => i.group === "pages").map((i) => i.href);
    expect(pageHrefs).toContain("/home");
    expect(pageHrefs).toContain("/courses");
    expect(pageHrefs).not.toContain("/users");
  });

  it("includes shortcut tools for a teacher when tenant gates pass", () => {
    const teacher = { roles: [role.teacher] } as accountType;
    const items = buildFindPageItems({
      checker: makePermissionChecker(["course.view"]),
      tenant,
      user: teacher,
    });
    const shortcutHrefs = items
      .filter((i) => i.group === "shortcuts")
      .map((i) => i.href);
    expect(shortcutHrefs).toContain("/shortcuts/todays-classes");
  });

  it("drops shortcut entries whose href already appears in pages", () => {
    const teacher = { roles: [role.teacher] } as accountType;
    const items = buildFindPageItems({
      checker: makePermissionChecker(["course.view"]),
      tenant,
      user: teacher,
    });
    const shortcutsIndex = items.filter((i) => i.href === "/shortcuts");
    expect(shortcutsIndex).toHaveLength(1);
    expect(shortcutsIndex[0]?.group).toBe("pages");
  });

  it("skips unresolved :id nav hrefs when tenant id is missing", () => {
    const items = buildFindPageItems({
      checker: makePermissionChecker(["org.manage_all"]),
      tenant: undefined,
      user: { roles: [role.superadmin] } as accountType,
    });
    expect(items.every((i) => !i.href.includes(":id"))).toBe(true);
  });
});

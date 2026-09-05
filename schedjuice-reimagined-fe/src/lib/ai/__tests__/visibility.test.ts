import { describe, expect, it } from "vitest";

import { permissionsFor } from "@/helpers/authorization";
import {
  canManageAiMemory,
  canViewAiMemory,
  canViewAiSection,
  canViewAiUsage,
} from "@/lib/ai/visibility";
import type { accountType } from "@/types/user";

function user(
  id: number,
  permissions: string[],
  roles: string[] = ["admin"],
): accountType {
  return {
    id,
    name: `User ${id}`,
    email: `u${id}@test.com`,
    roles,
    permissions,
  } as accountType;
}

describe("ai visibility", () => {
  const selfPerms = [
    "ai.usage.view_own",
    "ai.memory.view_own",
    "ai.memory.manage_own",
  ];
  const adminPerms = [
    ...selfPerms,
    "ai.usage.view_all",
    "ai.memory.view_all",
    "ai.memory.manage_all",
  ];

  it("shows AI section for self with view_own", () => {
    const u = user(1, selfPerms);
    expect(canViewAiSection({ subject: u, viewer: u })).toBe(true);
  });

  it("hides AI section for other user without view_all", () => {
    const subject = user(2, selfPerms, ["teacher"]);
    const viewer = user(1, selfPerms, ["teacher"]);
    expect(canViewAiSection({ subject, viewer })).toBe(false);
  });

  it("allows admin to view another user's usage and memory", () => {
    const subject = user(2, selfPerms, ["teacher"]);
    const viewer = user(1, adminPerms);
    expect(canViewAiUsage({ subject, viewer })).toBe(true);
    expect(canViewAiMemory({ subject, viewer })).toBe(true);
    expect(canManageAiMemory({ subject, viewer })).toBe(true);
  });

  it("permissionsFor grantAll includes new codes for superadmin", () => {
    const sa = user(1, [], ["superadmin"]);
    expect(permissionsFor(sa).can("ai.memory.view_all")).toBe(true);
  });
});

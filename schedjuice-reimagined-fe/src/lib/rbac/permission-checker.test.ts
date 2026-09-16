import { describe, expect, it } from "vitest";
import { permissionsFor } from "@/helpers/authorization";
import { role } from "@/types/user";

describe("permissionsFor", () => {
  it("grants all codes for superadmin even when points permissions are missing from payload", () => {
    const checker = permissionsFor({
      id: 1,
      roles: [role.superadmin],
      permissions: ["course.view"],
    } as never);

    expect(checker.can("points.view")).toBe(true);
    expect(checker.can("points.configure")).toBe(true);
  });

  it("does not grant unknown codes to regular admins without explicit permission", () => {
    const checker = permissionsFor({
      id: 2,
      roles: [role.admin],
      permissions: ["course.view"],
    } as never);

    expect(checker.can("points.view")).toBe(false);
  });
});

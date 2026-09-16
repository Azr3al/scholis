import { describe, it, expect, vi } from "vitest";

// useUser imports @/lib/api at module load, which throws unless NEXT_PUBLIC_BASE_API_URL
// is set. normalizeAccountPayload is pure, so we stub the api module to import it safely.
vi.mock("@/lib/api", () => ({
  axiosClient: { get: vi.fn() },
}));

import { normalizeAccountPayload } from "../useUser";
import type { accountType } from "@/types/user";

describe("normalizeAccountPayload", () => {
  it("preserves permissions and rbac_version from the users/profile payload", () => {
    const raw = {
      id: 1,
      roles: ["teacher"],
      permissions: ["course.view"],
      rbac_version: 3,
    } as unknown as accountType;

    const result = normalizeAccountPayload(raw);

    expect(result.permissions).toEqual(["course.view"]);
    expect(result.rbac_version).toBe(3);
    expect(result.roles).toEqual(["teacher"]);
  });

  it("defaults missing roles to [] while still keeping permissions", () => {
    const raw = {
      id: 2,
      permissions: ["course.view", "course.update"],
    } as unknown as accountType;

    const result = normalizeAccountPayload(raw);

    expect(result.roles).toEqual([]);
    expect(result.permissions).toEqual(["course.view", "course.update"]);
  });
});

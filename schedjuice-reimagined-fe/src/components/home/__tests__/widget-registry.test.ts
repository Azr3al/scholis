// src/components/home/__tests__/widget-registry.test.ts
import { describe, it, expect } from "vitest";
import { visibleWidgets } from "../widget-registry";

describe("widget registry", () => {
  it("visibleWidgets filters by canAny", () => {
    const can = (codes: string[]) => codes.includes("payment.view_unpaid");
    const ids = visibleWidgets(can).map((w) => w.id);
    expect(ids).toContain("unpaid-students");
    expect(ids).not.toContain("pending-grading");
    expect(ids).not.toContain("unverified-payments");
  });
  it("widgets with empty requiredPermissions are always visible", () => {
    const can = () => false;
    expect(visibleWidgets(can).some((w) => w.requiredPermissions.length === 0)).toBe(true);
  });
});

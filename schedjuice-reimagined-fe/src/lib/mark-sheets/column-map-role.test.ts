import { describe, expect, it } from "vitest";

import {
  applyColumnMapRole,
  countIdentifierColumns,
  highestPriorityIdentifierField,
  isValidColumnMapRole,
  kindToDefaultColumnMapRole,
  normalizeColumnMapping,
  resolveColumnMapRole,
  shouldRematchOnRoleChange,
} from "@/lib/mark-sheets/column-map-role";

describe("column-map-role", () => {
  it("maps identifier kind via column_mapping", () => {
    expect(kindToDefaultColumnMapRole("identifier", { name: 1 }, 1)).toBe("name");
    expect(
      kindToDefaultColumnMapRole("identifier", { alternative_name: 2 }, 2),
    ).toBe("alternative_name");
  });

  it("coerces string column indices from API payloads", () => {
    const mapping = normalizeColumnMapping({ name: "1", email: "3" });
    expect(mapping).toEqual({ name: 1, email: 3 });
    expect(kindToDefaultColumnMapRole("identifier", mapping, 1)).toBe("name");
  });

  it("returns ignore for unknown or missing kind", () => {
    expect(kindToDefaultColumnMapRole(undefined, {}, 0)).toBe("ignore");
    expect(kindToDefaultColumnMapRole("ignored", {}, 0)).toBe("ignore");
    expect(kindToDefaultColumnMapRole("identifier", {}, 0)).toBe("ignore");
  });

  it("applyColumnMapRole remaps without duplicate keys", () => {
    const next = applyColumnMapRole("email", 2, { name: 1, email: 1 });
    expect(next).toEqual({ name: 1, email: 2 });
    expect(next.name).toBe(1);
    expect(next.email).toBe(2);
  });

  it("applyColumnMapRole ignore removes column from mapping", () => {
    const next = applyColumnMapRole("ignore", 1, { name: 0, email: 1 });
    expect(next).toEqual({ name: 0 });
    expect(next.email).toBeUndefined();
  });

  it("resolveColumnMapRole rejects invalid stored roles", () => {
    expect(
      resolveColumnMapRole(1, { 1: "not-a-role" as never }, "identifier", {
        name: 1,
      }),
    ).toBe("name");
    expect(isValidColumnMapRole("score")).toBe(true);
    expect(isValidColumnMapRole(undefined)).toBe(false);
    expect(isValidColumnMapRole("identifier")).toBe(false);
  });

  it("counts identifier match columns only", () => {
    expect(countIdentifierColumns({ name: 0, email: 1 })).toBe(2);
    expect(countIdentifierColumns({})).toBe(0);
  });

  it("picks highest priority identifier field", () => {
    expect(highestPriorityIdentifierField({ name: 0, email: 1 })).toBe("email");
    expect(highestPriorityIdentifierField({ name: 0 })).toBe("name");
    expect(highestPriorityIdentifierField({ alternative_name: 2, name: 0 })).toBe("name");
  });

  describe("shouldRematchOnRoleChange", () => {
    it("rematches when only one identifier column remains", () => {
      expect(
        shouldRematchOnRoleChange({ name: 0, email: 1 }, 1, { name: 0 }, "ignore"),
      ).toBe(true);
      expect(
        shouldRematchOnRoleChange({ name: 0 }, 0, { name: 0 }, "name"),
      ).toBe(true);
    });

    it("does not rematch when multiple identifiers and secondary column changes", () => {
      expect(
        shouldRematchOnRoleChange({ email: 1, name: 0 }, 0, { email: 1 }, "score"),
      ).toBe(false);
      expect(
        shouldRematchOnRoleChange(
          { email: 1, alternative_name: 2 },
          2,
          { email: 1, alternative_name: 2 },
          "alternative_name",
        ),
      ).toBe(false);
    });

    it("rematches when highest priority identifier column changes", () => {
      expect(
        shouldRematchOnRoleChange({ email: 1, name: 0 }, 1, { name: 0 }, "ignore"),
      ).toBe(true);
      expect(
        shouldRematchOnRoleChange({ name: 0 }, 0, { email: 0 }, "email"),
      ).toBe(true);
    });

    it("does not rematch when no identifier columns remain", () => {
      expect(
        shouldRematchOnRoleChange({ email: 0 }, 0, {}, "ignore"),
      ).toBe(false);
    });
  });
});

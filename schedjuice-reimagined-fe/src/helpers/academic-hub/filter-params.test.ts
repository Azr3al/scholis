import { describe, it, expect } from "vitest";
import { buildHubFilterParams } from "./filter-params";
import { HUB_PROGRAM_ALL } from "@/types/academic-hub";

const baseFilters = {
  program: HUB_PROGRAM_ALL,
  status: ["active"] as const,
  intake: null,
  subjects: [] as string[],
  categories: [] as string[],
  q: "",
  my: false,
  page: 1,
};

describe("buildHubFilterParams", () => {
  it("emits no program filter when 'all' is selected", () => {
    const fp = buildHubFilterParams({ ...baseFilters, status: ["active"] }, { userId: 42 });
    expect(fp.filter_params.find((f) => f.field_name === "program")).toBeUndefined();
  });

  it("expands paused into the active status filter", () => {
    const fp = buildHubFilterParams(
      { ...baseFilters, status: ["active"] },
      { userId: 42 },
    );
    const statusFilter = fp.filter_params.find((f) => f.field_name === "status");
    expect(statusFilter?.value).toBe("active,paused");
  });

  it("adds program/intake/subjects/categories filters when set", () => {
    const fp = buildHubFilterParams(
      {
        ...baseFilters,
        status: ["active"],
        program: "7",
        intake: "12",
        subjects: ["1", "2"],
        categories: ["9"],
      },
      { userId: 42 },
    );
    const byField = Object.fromEntries(
      fp.filter_params.map((f) => [f.field_name, f]),
    );
    expect(byField["program"].value).toBe("7");
    expect(byField["intake"].value).toBe("12");
    expect(byField["subject"].value).toBe("1,2");
    expect(byField["category"].value).toBe("9");
  });

  it("adds my-only filters when my is true", () => {
    const fp = buildHubFilterParams(
      { ...baseFilters, status: ["active"], my: true },
      { userId: 42 },
    );
    const fields = fp.filter_params.map((f) => f.field_name);
    expect(fields).toContain("user_courses__user_id|created_by");
    expect(fields).not.toContain("user_courses__assigned_as_role");
  });

  it("strips status filters when q is present", () => {
    const fp = buildHubFilterParams(
      { ...baseFilters, status: ["active"], q: "algebra" },
      { userId: 42 },
    );
    expect(fp.filter_params.find((f) => f.field_name === "status")).toBeUndefined();
  });
});

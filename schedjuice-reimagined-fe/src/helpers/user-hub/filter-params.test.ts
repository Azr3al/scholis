import { describe, expect, it } from "vitest";
import {
  buildHubUserFilterParams,
  buildHubUserTabCountFilterParams,
} from "./filter-params";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";

const baseState = {
  tab: "staff" as const,
  q: "",
  page: 1,
  includeInactive: false,
  incomplete: false,
  view: "grid" as const,
};

describe("buildHubUserFilterParams", () => {
  it("uses overlap for staff tab so custom roles do not exclude staff users", () => {
    const { filter_params } = buildHubUserFilterParams(baseState);
    const rolesFilter = filter_params.find((f) => f.field_name === "roles");
    expect(rolesFilter?.operator).toBe(operatorEnum.overlap);
    expect(rolesFilter?.value).toContain(role.teacher);
  });

  it("keeps contained_by for students tab", () => {
    const { filter_params } = buildHubUserFilterParams({
      ...baseState,
      tab: "students",
    });
    const rolesFilter = filter_params.find((f) => f.field_name === "roles");
    expect(rolesFilter?.operator).toBe(operatorEnum.contained_by);
    expect(rolesFilter?.value).toBe("{student}");
  });
});

describe("buildHubUserTabCountFilterParams", () => {
  it("returns staff role overlap and active-only filters", () => {
    const { filter_params } = buildHubUserTabCountFilterParams("staff");
    expect(filter_params).toHaveLength(2);
    expect(filter_params[0]).toMatchObject({
      field_name: "roles",
      operator: operatorEnum.overlap,
    });
    expect(filter_params[1]).toMatchObject({
      field_name: "is_active",
      operator: operatorEnum.exact,
      value: "true",
    });
  });

  it("returns student role contained_by and active-only filters", () => {
    const { filter_params } = buildHubUserTabCountFilterParams("students");
    expect(filter_params).toHaveLength(2);
    expect(filter_params[0]).toMatchObject({
      field_name: "roles",
      operator: operatorEnum.contained_by,
      value: "{student}",
    });
    expect(filter_params[1]).toMatchObject({
      field_name: "is_active",
      operator: operatorEnum.exact,
      value: "true",
    });
  });
});

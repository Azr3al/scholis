import { describe, expect, it } from "vitest";
import {
  buildAdmissionsPeopleFilterParams,
  buildAdmissionsPeopleTabCountFilterParams,
} from "./people-filter-params";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";

const students = {
  tab: "students" as const,
  q: "",
  page: 1,
  includeInactive: false,
  includeAlumni: false,
};

describe("buildAdmissionsPeopleFilterParams", () => {
  it("omits is_active on Students even when includeAlumni is off", () => {
    const { filter_params } = buildAdmissionsPeopleFilterParams(students);
    expect(filter_params.some((f) => f.field_name === "is_active")).toBe(false);
    expect(filter_params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_name: "roles",
          operator: operatorEnum.contained_by,
          value: `{${role.student}}`,
        }),
      ]),
    );
  });

  it("still sends is_active on Staff when includeInactive is off and q is empty", () => {
    const { filter_params } = buildAdmissionsPeopleFilterParams({
      ...students,
      tab: "staff",
    });
    expect(filter_params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_name: "is_active",
          operator: operatorEnum.exact,
          value: "true",
        }),
      ]),
    );
  });
});

describe("buildAdmissionsPeopleTabCountFilterParams", () => {
  it("counts Students by role only", () => {
    const { filter_params } = buildAdmissionsPeopleTabCountFilterParams("students");
    expect(filter_params.some((f) => f.field_name === "is_active")).toBe(false);
    expect(filter_params).toHaveLength(1);
  });

  it("counts Staff active-only", () => {
    const { filter_params } = buildAdmissionsPeopleTabCountFilterParams("staff");
    expect(filter_params).toHaveLength(2);
    expect(filter_params[1]).toMatchObject({
      field_name: "is_active",
      value: "true",
    });
  });
});

import { describe, expect, it } from "vitest";
import { getActiveCourseFilterParams } from "./date";
import { operatorEnum } from "@/types/api";

describe("getActiveCourseFilterParams", () => {
  it("omits start_date so planned courses are included", () => {
    const params = getActiveCourseFilterParams();
    expect(params.some((p) => p.field_name === "start_date")).toBe(false);
  });

  it("keeps end_date grace so long-ended courses stay hidden", () => {
    const params = getActiveCourseFilterParams();
    const endDate = params.find((p) => p.field_name === "end_date");
    expect(endDate).toMatchObject({
      field_name: "end_date",
      operator: operatorEnum.gte,
    });
    expect(endDate?.value).toEqual(expect.any(String));
  });
});

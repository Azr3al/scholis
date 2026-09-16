import { describe, expect, it } from "vitest";

import { toFilterBody } from "../core/list-args";

describe("toFilterBody", () => {
  it("accepts filter_params array", () => {
    expect(
      toFilterBody({
        page: 1,
        pageSize: 10,
        sorts: [],
        q: "",
        filterParams: [{ field_name: "status", operator: "exact", value: "1" }],
      }),
    ).toEqual({
      filter_params: [{ field_name: "status", operator: "exact", value: "1" }],
      exclude_params: [],
    });
  });

  it("accepts full filterParamsBody / getDataFilterParams object", () => {
    expect(
      toFilterBody({
        page: 1,
        pageSize: 10,
        sorts: [],
        q: "",
        filterParams: {
          filter_params: [{ field_name: "id", operator: "in", value: "1,2" }],
          exclude_params: [],
          facets: ["status"],
        },
      }),
    ).toEqual({
      filter_params: [{ field_name: "id", operator: "in", value: "1,2" }],
      exclude_params: [],
      facets: ["status"],
    });
  });
});

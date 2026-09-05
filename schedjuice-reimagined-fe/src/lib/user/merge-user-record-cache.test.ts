import { describe, expect, it } from "vitest";
import { mergeUserRecordCache } from "./merge-user-record-cache";

describe("mergeUserRecordCache", () => {
  it("deep-merges custom_data without dropping other section keys", () => {
    const prev = {
      data: {
        data: {
          id: 1,
          name: "Old",
          custom_data: { field_a: "A1", field_c: "keep" },
          visibility: { id: 9 },
        },
      },
    };
    const next = mergeUserRecordCache(prev, {
      id: 1,
      name: "New",
      custom_data: { field_b: "B1" },
    });
    expect(next.data?.data).toEqual({
      id: 1,
      name: "New",
      custom_data: { field_a: "A1", field_c: "keep", field_b: "B1" },
      visibility: { id: 9 },
    });
    expect(prev.data?.data?.name).toBe("Old");
  });

  it("preserves expand-only fields when PUT omits them", () => {
    const prev = {
      data: {
        data: {
          id: 2,
          user_events: [{ event: 1 }],
          custom_data: { x: "1" },
        },
      },
    };
    const next = mergeUserRecordCache(prev, {
      id: 2,
      phone_number: "555",
      custom_data: { y: "2" },
    });
    expect(next.data?.data?.user_events).toEqual([{ event: 1 }]);
    expect(next.data?.data?.phone_number).toBe("555");
    expect(next.data?.data?.custom_data).toEqual({ x: "1", y: "2" });
  });

  it("returns prev untouched when updated user is null", () => {
    const prev = { data: { data: { id: 3 } } };
    expect(mergeUserRecordCache(prev, null)).toBe(prev);
  });

  it("wraps updated user when cache is empty", () => {
    expect(
      mergeUserRecordCache(undefined, { id: 4, custom_data: { a: "1" } }),
    ).toEqual({ data: { data: { id: 4, custom_data: { a: "1" } } } });
  });
});

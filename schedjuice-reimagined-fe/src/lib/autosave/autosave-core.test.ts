import { describe, expect, it } from "vitest";

import {
  collectDirtyValidFields,
  deriveFormStatus,
  fieldsForFlush,
  invalidFieldsFromIssues,
  isUnitReady,
  mergeEntityDiff,
} from "./autosave-core";

describe("collectDirtyValidFields", () => {
  it("returns dirty fields that are not invalid, sorted", () => {
    expect(
      collectDirtyValidFields({
        dirtyFields: { name: true, price: true, code: false },
        invalidFields: ["price"],
      }),
    ).toEqual(["name"]);
  });

  it("returns empty when nothing is dirty", () => {
    expect(
      collectDirtyValidFields({ dirtyFields: { name: false }, invalidFields: [] }),
    ).toEqual([]);
  });
});

describe("fieldsForFlush", () => {
  it("returns the whole unit when the blurred field is in a unit", () => {
    expect(fieldsForFlush("start_date", [["start_date", "end_date"]])).toEqual([
      "start_date",
      "end_date",
    ]);
  });

  it("returns just the field when it is in no unit", () => {
    expect(fieldsForFlush("name", [["start_date", "end_date"]])).toEqual(["name"]);
  });
});

describe("isUnitReady", () => {
  it("is not ready while focus is still inside the unit", () => {
    expect(isUnitReady(["start_date", "end_date"], "end_date", [])).toBe(false);
  });

  it("is not ready when a unit field is invalid", () => {
    expect(isUnitReady(["start_date", "end_date"], null, ["end_date"])).toBe(false);
  });

  it("is ready when focus left the unit and all fields are valid", () => {
    expect(isUnitReady(["start_date", "end_date"], "name", [])).toBe(true);
  });
});

describe("deriveFormStatus", () => {
  it("returns error if any field errored", () => {
    expect(deriveFormStatus({ a: "saved", b: "error" })).toBe("error");
  });
  it("returns saving if any saving and none errored", () => {
    expect(deriveFormStatus({ a: "saved", b: "saving" })).toBe("saving");
  });
  it("returns saved if any saved and none saving/errored", () => {
    expect(deriveFormStatus({ a: "saved" })).toBe("saved");
  });
  it("returns idle when empty", () => {
    expect(deriveFormStatus({})).toBe("idle");
  });
});

describe("mergeEntityDiff", () => {
  it("merges a diff into the nested entity immutably", () => {
    const cache = { data: { data: { id: 1, name: "Old", price: 5 } } };
    const next = mergeEntityDiff(cache, { name: "New" });
    expect(next.data.data).toEqual({ id: 1, name: "New", price: 5 });
    expect(next).not.toBe(cache);
    expect(cache.data.data.name).toBe("Old");
  });
  it("returns the cache untouched when shape is unexpected", () => {
    const cache = { nope: true } as unknown as {
      data?: { data?: Record<string, unknown> };
    };
    expect(mergeEntityDiff(cache, { name: "x" })).toBe(cache);
  });
});

describe("invalidFieldsFromIssues", () => {
  it("returns intersection of issue top-level paths and candidate fields", () => {
    const issues = [{ path: ["email"] }, { path: ["age"] }, { path: ["unknown"] }];
    expect(invalidFieldsFromIssues(issues, ["email", "name", "age"])).toEqual([
      "email",
      "age",
    ]);
  });

  it("uses first path segment for nested issues", () => {
    const issues = [{ path: ["custom_data", "foo"] }];
    expect(invalidFieldsFromIssues(issues, ["custom_data"])).toEqual(["custom_data"]);
  });

  it("ignores empty paths and returns no duplicates", () => {
    const issues = [{ path: [] }, { path: ["email"] }, { path: ["email"] }];
    expect(invalidFieldsFromIssues(issues, ["email"])).toEqual(["email"]);
  });

  it("returns [] when nothing matches", () => {
    expect(invalidFieldsFromIssues([{ path: ["x"] }], ["email"])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { resolveTitlePick } from "./resolve-title-pick";

describe("resolveTitlePick", () => {
  const org = [{ id: 1, name: "Top 1" }];
  it("binds exact org name case-insensitively", () => {
    expect(resolveTitlePick("top 1", org, [])).toEqual({
      kind: "org",
      titleId: 1,
      name: "Top 1",
    });
  });
  it("binds this course local before creating", () => {
    expect(
      resolveTitlePick("Star of the week", [], [{ id: 9, name: "Star of the week" }]),
    ).toEqual({ kind: "local", titleId: 9, name: "Star of the week" });
  });
  it("creates when no match", () => {
    expect(resolveTitlePick("Star", org, [])).toEqual({
      kind: "create",
      name: "Star",
    });
  });
});

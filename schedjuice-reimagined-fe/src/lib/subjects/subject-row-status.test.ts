import { describe, expect, it } from "vitest";
import { computeRowStatus, summarizeStatuses } from "./subject-row-status";

const org = [
  { id: 1, name: "Financial Reporting" },
  { id: 2, name: "Taxation" },
];
const linked = new Set<number>([2]);

describe("computeRowStatus", () => {
  it("returns 'new' when no org subject matches", () => {
    expect(computeRowStatus("Dip IFR", org, linked)).toBe("new");
  });
  it("returns 'link' when org subject exists but is not linked", () => {
    expect(computeRowStatus("financial reporting", org, linked)).toBe("link");
  });
  it("returns 'skip' when already linked to this program", () => {
    expect(computeRowStatus("Taxation", org, linked)).toBe("skip");
  });
});

describe("summarizeStatuses", () => {
  it("counts new/link/skip and actionable total", () => {
    const s = summarizeStatuses(["new", "new", "link", "skip"]);
    expect(s).toEqual({ new: 2, link: 1, skip: 1, actionable: 3 });
  });
});

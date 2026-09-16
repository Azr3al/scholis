import { describe, expect, it } from "vitest";
import type { ChangelogEntry } from "@/content/changelog/types";
import {
  filterChangelogForUser,
  groupChangelogByMonth,
  getLastSummarizedCommits,
  isIncrementalSourceRange,
  paginateChangelogEntries,
} from "./changelog-utils";

const sampleEntries: ChangelogEntry[] = [
  {
    id: "2026-05-01-legacy",
    audience: "staff",
    title: "Legacy",
    publishedAt: "2026-05-01",
    summary: "Older",
    bullets: ["Old"],
    categories: ["internal"],
    affectedAreas: [],
    screenshots: [],
    screenshotStatus: "skipped",
    source: {
      sourceRange: "test",
      generatedAt: "2026-05-01T10:00:00Z",
      transcriptsFound: false,
    },
  },
  {
    id: "2026-06-10-alpha",
    audience: "everyone",
    title: "Alpha",
    publishedAt: "2026-06-10",
    summary: "First",
    bullets: ["One"],
    categories: ["feature"],
    affectedAreas: [],
    screenshots: [],
    screenshotStatus: "skipped",
    source: {
      sourceRange: "test",
      generatedAt: "2026-06-10T10:00:00Z",
      transcriptsFound: false,
    },
  },
  {
    id: "2026-06-16-beta",
    audience: "staff",
    title: "Beta",
    publishedAt: "2026-06-16",
    summary: "Second",
    bullets: ["Two"],
    categories: ["fix"],
    affectedAreas: [],
    screenshots: [],
    screenshotStatus: "needs_capture",
    source: {
      sourceRange: "test",
      generatedAt: "2026-06-16T08:00:00Z",
      transcriptsFound: true,
    },
  },
];

describe("changelog-utils", () => {
  it("groups entries by month newest-first within and across months", () => {
    const groups = groupChangelogByMonth(sampleEntries);
    expect(groups).toHaveLength(2);
    expect(groups[0].monthKey).toBe("2026-06");
    expect(groups[0].entries.map((e) => e.id)).toEqual([
      "2026-06-16-beta",
      "2026-06-10-alpha",
    ]);
    expect(groups[1].monthKey).toBe("2026-05");
    expect(groups[1].entries.map((e) => e.id)).toEqual(["2026-05-01-legacy"]);
  });

  it("detects incremental source range prompts", () => {
    expect(isIncrementalSourceRange("everything after last summarized commit")).toBe(
      true,
    );
    expect(isIncrementalSourceRange("since last changelog")).toBe(true);
    expect(isIncrementalSourceRange("unsummarized commits")).toBe(true);
    expect(isIncrementalSourceRange("today")).toBe(false);
  });

  it("returns last summarized commit tips from newest-generated entry", () => {
    const entries: ChangelogEntry[] = [
      {
        ...sampleEntries[1],
        source: {
          ...sampleEntries[1].source,
          generatedAt: "2026-06-16T12:00:00Z",
          summarizedCommits: { fe: "aaa1111", be: "bbb1111" },
        },
      },
      {
        ...sampleEntries[0],
        source: {
          ...sampleEntries[0].source,
          generatedAt: "2026-06-16T18:00:00Z",
          summarizedCommits: { fe: "ccc3333", be: "ddd3333" },
        },
      },
    ];
    const last = getLastSummarizedCommits(entries);
    expect(last.fe).toBe("ccc3333");
    expect(last.be).toBe("ddd3333");
  });

  it("falls back to commitRefs when summarizedCommits missing", () => {
    const entries: ChangelogEntry[] = [
      {
        ...sampleEntries[0],
        source: {
          sourceRange: "test",
          generatedAt: "2026-06-16T10:00:00Z",
          commitRefs: ["feabc12", "be def34"],
          transcriptsFound: false,
        },
      },
    ];
    const last = getLastSummarizedCommits(entries);
    expect(last.fe).toBe("feabc12");
    expect(last.be).toBe("be def34");
  });

  it("filters staff-only entries away from students", () => {
    const studentUser = { id: 1, roles: ["student"] } as import("@/types/user").accountType;
    const adminUser = { id: 2, roles: ["admin"] } as import("@/types/user").accountType;

    const mixed: ChangelogEntry[] = [
      { ...sampleEntries[1], audience: "everyone" },
      { ...sampleEntries[2], audience: "staff" },
    ];

    expect(filterChangelogForUser(mixed, studentUser)).toHaveLength(1);
    expect(filterChangelogForUser(mixed, studentUser)[0].audience).toBe("everyone");
    expect(filterChangelogForUser(mixed, adminUser)).toHaveLength(2);
  });

  it("paginates entries newest-first with clamped page bounds", () => {
    const entries: ChangelogEntry[] = [
      { ...sampleEntries[0], publishedAt: "2026-06-01" },
      { ...sampleEntries[2], publishedAt: "2026-06-16" },
      { ...sampleEntries[1], publishedAt: "2026-06-10" },
    ];

    const page1 = paginateChangelogEntries(entries, 1, 2);
    expect(page1.page).toBe(1);
    expect(page1.totalCount).toBe(3);
    expect(page1.entries.map((e) => e.id)).toEqual([
      "2026-06-16-beta",
      "2026-06-10-alpha",
    ]);

    const page2 = paginateChangelogEntries(entries, 2, 2);
    expect(page2.entries.map((e) => e.id)).toEqual(["2026-05-01-legacy"]);

    const beyond = paginateChangelogEntries(entries, 99, 2);
    expect(beyond.page).toBe(2);
    expect(beyond.entries).toHaveLength(1);
  });

  it("returns empty pagination for an empty list", () => {
    const result = paginateChangelogEntries([], 5, 10);
    expect(result.page).toBe(1);
    expect(result.totalCount).toBe(0);
    expect(result.entries).toEqual([]);
  });
});

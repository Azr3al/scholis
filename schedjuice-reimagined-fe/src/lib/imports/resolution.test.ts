import { describe, expect, it } from "vitest";

import type { UserRef } from "@/app/client-api/imports";
import {
  applyCoursePick,
  buildCourseResolutions,
  buildUserMatches,
  buildUserResolutions,
  cellStatusFromTokens,
  collectUnresolvedCourseTokens,
  computeCourseProgress,
  computeNameMismatch,
  confirmAllExactMatches,
  confirmUserMatch,
  countPendingExactMatches,
  countPendingNameMismatches,
  detectCourseConflicts,
  findDuplicateEmailRows,
  groupDuplicateEmails,
  isCourseTokenResolved,
  propagateCoursePick,
  pickRosterStudent,
  pickUserCandidate,
  rejectUserMatch,
  resolveRowUserResolution,
  resolveDuplicateEmails,
  type CellResolution,
  type MatchSpecResolved,
} from "@/lib/imports/resolution";
import type { UserMatchResult } from "@/app/client-api/imports";

describe("buildUserResolutions", () => {
  it("fans out a user map across rows by email", () => {
    const rows = [["a@x.edu"], ["b@x.edu"], ["bad"]];
    const userMap: Record<string, UserRef | null> = {
      "a@x.edu": {
        id: 1,
        name: "A",
        email: "a@x.edu",
        code: null,
        profile_image: null,
        roles: [],
      },
      "b@x.edu": null,
    };
    const out = buildUserResolutions(rows, 0, ["r0", "r1", "r2"], userMap);
    expect(out.get("r0:email")?.status).toBe("linked");
    expect(out.get("r1:email")?.status).toBe("new");
    expect(out.get("r2:email")?.status).toBe("error");
  });
});

describe("buildCourseResolutions", () => {
  it("aggregates per-token state to worst-of", () => {
    const rows = [["Y2 R1, Math"]];
    const map = {
      "Y2 R1": {
        status: "linked" as const,
        match: {
          id: 5,
          title: "Year 2 R1",
          code: null,
          academic_year: null,
          student_count: null,
          score: 95,
        },
        candidates: [],
      },
      Math: {
        status: "needs_attention" as const,
        match: null,
        candidates: [],
      },
    };
    const out = buildCourseResolutions(rows, 0, ["r0"], map);
    const cell = out.get("r0:courses");
    expect(cell?.status).toBe("needs_attention");
    expect(cell?.tokens?.length).toBe(2);
  });
});

describe("buildCourseResolutions origin", () => {
  it("tags backend auto-links with origin 'auto'", () => {
    const rows = [["Y2 R1"]];
    const map = {
      "Y2 R1": {
        status: "linked" as const,
        match: {
          id: 5,
          title: "Year 2 R1",
          code: null,
          academic_year: null,
          student_count: null,
          score: 95,
        },
        candidates: [],
      },
    };
    const out = buildCourseResolutions(rows, 0, ["r0"], map);
    expect(out.get("r0:courses")?.tokens?.[0].origin).toBe("auto");
  });
});

describe("cellStatusFromTokens", () => {
  it("returns linked when all tokens linked", () => {
    expect(
      cellStatusFromTokens([
        {
          raw: "a",
          status: "linked",
          match: { id: 1, title: "A" },
          candidates: [],
        },
      ]),
    ).toBe("linked");
  });
  it("returns needs_attention when any token needs attention", () => {
    expect(
      cellStatusFromTokens([
        {
          raw: "a",
          status: "linked",
          match: { id: 1, title: "A" },
          candidates: [],
        },
        { raw: "b", status: "needs_attention", match: null, candidates: [] },
      ]),
    ).toBe("needs_attention");
  });
});

describe("propagateCoursePick", () => {
  const rows = [["TX"], ["TX"], ["TX"], ["AA"]];
  const rowIds = ["r0", "r1", "r2", "r3"];
  function baseResolution() {
    return buildCourseResolutions(rows, 0, rowIds, {
      TX: { status: "needs_attention", match: null, candidates: [] },
      AA: { status: "needs_attention", match: null, candidates: [] },
    });
  }

  it("fans a pick out to all exact-match cells", () => {
    const { next, affected } = propagateCoursePick(
      baseResolution(),
      rows,
      0,
      rowIds,
      "r0",
      "TX",
      { id: 9, title: "TX Course" },
    );
    expect(next.get("r0:courses")?.tokens?.[0].origin).toBe("manual");
    expect(next.get("r1:courses")?.tokens?.[0].status).toBe("linked");
    expect(next.get("r1:courses")?.tokens?.[0].origin).toBe("propagated");
    expect(next.get("r2:courses")?.tokens?.[0].match?.id).toBe(9);
    expect(next.get("r3:courses")?.tokens?.[0].status).toBe("needs_attention");
    expect(affected.sort()).toEqual(["r0", "r1", "r2"]);
  });

  it("respects prior manual picks", () => {
    let res = baseResolution();
    res = propagateCoursePick(res, rows, 0, rowIds, "r1", "TX", {
      id: 1,
      title: "Manual",
    }).next;
    const { next } = propagateCoursePick(res, rows, 0, rowIds, "r0", "TX", {
      id: 9,
      title: "TX Course",
    });
    expect(next.get("r1:courses")?.tokens?.[0].match?.id).toBe(1);
    expect(next.get("r2:courses")?.tokens?.[0].match?.id).toBe(9);
  });

  it("does not propagate a 'no course' pick", () => {
    const { next, affected } = propagateCoursePick(
      baseResolution(),
      rows,
      0,
      rowIds,
      "r0",
      "TX",
      null,
    );
    expect(next.get("r0:courses")?.tokens?.[0].status).toBe("none");
    expect(next.get("r0:courses")?.tokens?.[0].origin).toBe("manual");
    expect(next.get("r1:courses")?.tokens?.[0].status).toBe("needs_attention");
    expect(affected).toEqual(["r0"]);
  });

  it("snapshot restores prior values", () => {
    const before = baseResolution();
    const { next, snapshot } = propagateCoursePick(
      before,
      rows,
      0,
      rowIds,
      "r0",
      "TX",
      { id: 9, title: "TX Course" },
    );
    const restored = new Map(next);
    snapshot.forEach((v, k) => restored.set(k, v));
    expect(restored.get("r1:courses")?.tokens?.[0].status).toBe(
      "needs_attention",
    );
  });
});

describe("isCourseTokenResolved", () => {
  it("linked is resolved; backend none is not; manual none is", () => {
    expect(
      isCourseTokenResolved({
        raw: "a",
        status: "linked",
        match: { id: 1, title: "A" },
        candidates: [],
      }),
    ).toBe(true);
    expect(
      isCourseTokenResolved({
        raw: "a",
        status: "none",
        match: null,
        candidates: [],
      }),
    ).toBe(false);
    expect(
      isCourseTokenResolved({
        raw: "a",
        status: "none",
        match: null,
        candidates: [],
        origin: "manual",
      }),
    ).toBe(true);
  });
});

describe("collectUnresolvedCourseTokens", () => {
  it("groups unresolved tokens by raw with counts", () => {
    const res = buildCourseResolutions([["TX"], ["TX"], ["AA"]], 0, [
      "r0",
      "r1",
      "r2",
    ], {
      TX: { status: "needs_attention", match: null, candidates: [] },
      AA: { status: "needs_attention", match: null, candidates: [] },
    });
    const groups = collectUnresolvedCourseTokens(res, ["r0", "r1", "r2"]);
    expect(groups.find((g) => g.raw === "TX")?.count).toBe(2);
    expect(groups.find((g) => g.raw === "AA")?.count).toBe(1);
  });
});

describe("computeCourseProgress", () => {
  it("counts resolved vs total unique raw values", () => {
    let res = buildCourseResolutions([["TX"], ["TX"], ["AA"]], 0, [
      "r0",
      "r1",
      "r2",
    ], {
      TX: { status: "needs_attention", match: null, candidates: [] },
      AA: { status: "needs_attention", match: null, candidates: [] },
    });
    res = propagateCoursePick(
      res,
      [["TX"], ["TX"], ["AA"]],
      0,
      ["r0", "r1", "r2"],
      "r0",
      "TX",
      { id: 9, title: "TX" },
    ).next;
    expect(computeCourseProgress(res, ["r0", "r1", "r2"])).toEqual({
      resolved: 1,
      total: 2,
    });
  });
});

describe("detectCourseConflicts", () => {
  it("flags a raw linked to two different course ids", () => {
    let res = buildCourseResolutions([["TX"], ["TX"]], 0, ["r0", "r1"], {
      TX: { status: "needs_attention", match: null, candidates: [] },
    });
    res = propagateCoursePick(res, [["TX"], ["TX"]], 0, ["r0", "r1"], "r0", "TX", {
      id: 1,
      title: "One",
    }).next;
    res = propagateCoursePick(res, [["TX"], ["TX"]], 0, ["r0", "r1"], "r1", "TX", {
      id: 2,
      title: "Two",
    }).next;
    const conflicts = detectCourseConflicts(res, ["r0", "r1"]);
    expect(conflicts.find((c) => c.raw === "TX")?.titles.sort()).toEqual([
      "One",
      "Two",
    ]);
  });
});

describe("findDuplicateEmailRows", () => {
  it("flags rows whose email repeats (case-insensitive)", () => {
    const rows = [["A@x.com"], ["b@x.com"], ["a@x.com"]];
    expect(findDuplicateEmailRows(rows, 0)).toEqual(new Set([0, 2]));
  });
});

describe("groupDuplicateEmails", () => {
  it("groups case-insensitive duplicate emails", () => {
    const rows = [["A@x.com"], ["b@x.com"], ["a@x.com"], ["c@x.com"], ["A@X.COM"]];
    const groups = groupDuplicateEmails(rows, 0);
    expect(groups.size).toBe(1);
    expect(groups.get("a@x.com")).toEqual([0, 2, 4]);
  });
});

describe("resolveDuplicateEmails", () => {
  const rows = [
    ["dup@x.com"],
    ["unique@x.com"],
    ["dup@x.com"],
    ["dup@x.com"],
  ];
  const rowIds = ["r0", "r1", "r2", "r3"];
  const resolution = new Map([
    [
      "r0:courses",
      {
        status: "linked" as const,
        tokens: [
          {
            raw: "A",
            status: "linked" as const,
            match: { id: 1, title: "A" },
            candidates: [],
          },
        ],
      },
    ],
    [
      "r2:courses",
      {
        status: "linked" as const,
        tokens: [
          {
            raw: "B",
            status: "linked" as const,
            match: { id: 2, title: "B" },
            candidates: [],
          },
        ],
      },
    ],
    [
      "r3:courses",
      {
        status: "linked" as const,
        tokens: [
          {
            raw: "C",
            status: "linked" as const,
            match: { id: 3, title: "C" },
            candidates: [],
          },
        ],
      },
    ],
  ]);

  it("keep_first keeps earliest row and skips later duplicates", () => {
    const result = resolveDuplicateEmails({
      strategy: "keep_first",
      rows,
      emailColIndex: 0,
      rowIds,
      resolution,
    });
    expect(result.keptRowIndices).toEqual(new Set([0, 1]));
    expect(result.skippedRowIndices).toEqual(new Set([2, 3]));
    expect(result.keptRowByEmail.get("dup@x.com")).toBe(0);
    expect(result.mergedCourseIdsByRow.size).toBe(0);
  });

  it("keep_last keeps the last duplicate row", () => {
    const result = resolveDuplicateEmails({
      strategy: "keep_last",
      rows,
      emailColIndex: 0,
      rowIds,
      resolution,
    });
    expect(result.keptRowByEmail.get("dup@x.com")).toBe(3);
    expect(result.skippedRowIndices).toEqual(new Set([0, 2]));
  });

  it("merge unions course ids onto the first row", () => {
    const result = resolveDuplicateEmails({
      strategy: "merge",
      rows,
      emailColIndex: 0,
      rowIds,
      resolution,
    });
    expect(result.keptRowByEmail.get("dup@x.com")).toBe(0);
    expect(result.skippedRowIndices).toEqual(new Set([2, 3]));
    expect(result.mergedCourseIdsByRow.get(0)?.sort()).toEqual([2, 3]);
  });
});

describe("applyCoursePick", () => {
  it("links a chosen token and updates cell status", () => {
    const cell = {
      status: "needs_attention" as const,
      tokens: [
        {
          raw: "Math",
          status: "needs_attention" as const,
          match: null,
          candidates: [],
        },
      ],
    };
    const next = applyCoursePick(cell, "Math", { id: 8, title: "Year 2 Math" });
    expect(next.tokens?.[0].status).toBe("linked");
    expect(next.status).toBe("linked");
  });
});

describe("computeNameMismatch", () => {
  it("returns false for primary email field even when names differ", () => {
    expect(computeNameMismatch("email", "Mi Pakao Htaw", "Mehm Samoi Htaw")).toBe(
      false,
    );
  });

  it("returns false when imported name is empty", () => {
    expect(computeNameMismatch("phone_number", "", "Mehm Samoi Htaw")).toBe(false);
    expect(computeNameMismatch("phone_number", "   ", "Mehm Samoi Htaw")).toBe(
      false,
    );
  });

  it("returns false when names match after normalization", () => {
    expect(
      computeNameMismatch("phone_number", "  POE Yati Hlaing ", "Poe Yati Hlaing"),
    ).toBe(false);
  });

  it("returns true for secondary field with different names", () => {
    expect(
      computeNameMismatch("phone_number", "Mi Pakao Htaw", "Mehm Samoi Htaw"),
    ).toBe(true);
    expect(
      computeNameMismatch(
        "communication_email",
        "Poe Yati Thant",
        "Poe Theingi Kyaw",
      ),
    ).toBe(true);
  });
});

describe("buildUserMatches", () => {
  const ref = (id: number, name: string) => ({
    id,
    name,
    email: `${name}@x.com`,
    code: null,
    profile_image: null,
    roles: [],
  });

  const specs: MatchSpecResolved[] = [
    { fieldKey: "email", colIndex: 0, type: "email", fuzzy: true },
    { fieldKey: "phone_number", colIndex: 1, type: "phone", fuzzy: false },
  ];

  it("exact email -> pending_match; fuzzy -> pending_candidates; none -> new", () => {
    const rows = [["a@x.com", "0911"], ["typo@x.com", "0912"], ["new@x.com", "0000"]];
    const rowIds = ["row-0", "row-1", "row-2"];
    const results: Record<string, Record<string, UserMatchResult>> = {
      email: {
        "a@x.com": {
          kind: "exact",
          user: ref(1, "amy"),
          field: "email",
          score: 100,
          candidates: [],
        },
        "typo@x.com": {
          kind: "fuzzy",
          user: null,
          field: null,
          score: 93,
          candidates: [{ user: ref(2, "tony"), score: 93, field: "email" }],
        },
        "new@x.com": {
          kind: "none",
          user: null,
          field: null,
          score: null,
          candidates: [],
        },
      },
      phone_number: {
        "0911": { kind: "none", user: null, field: null, score: null, candidates: [] },
        "0912": { kind: "none", user: null, field: null, score: null, candidates: [] },
        "0000": { kind: "none", user: null, field: null, score: null, candidates: [] },
      },
    };
    const out = buildUserMatches(
      rows,
      specs,
      ["email", "phone_number"],
      rowIds,
      results,
      null,
    );
    expect(out.get("row-0:email")?.status).toBe("pending_match");
    expect(out.get("row-1:email")?.status).toBe("pending_candidates");
    expect(out.get("row-2:email")?.status).toBe("new");
  });

  it("flags illegal email as error", () => {
    const bad = [["a b@x.com", ""]];
    const out = buildUserMatches(bad, specs, ["email"], ["row-0"], {
      email: {},
      phone_number: {},
    }, null);
    expect(out.get("row-0:email")?.status).toBe("error");
  });

  it("sets nameMismatch when phone match names differ", () => {
    const rows = [["new@x.com", "09123456789", "Mi Pakao Htaw"]];
    const specs: MatchSpecResolved[] = [
      { fieldKey: "email", colIndex: 0, type: "email", fuzzy: false },
      { fieldKey: "phone_number", colIndex: 1, type: "phone", fuzzy: false },
    ];
    const results: Record<string, Record<string, UserMatchResult>> = {
      email: {
        "new@x.com": {
          kind: "none",
          user: null,
          field: null,
          score: null,
          candidates: [],
        },
      },
      phone_number: {
        "09123456789": {
          kind: "exact",
          user: ref(10, "Mehm Samoi Htaw"),
          field: "phone_number",
          score: 100,
          candidates: [],
        },
      },
    };
    const out = buildUserMatches(
      rows,
      specs,
      ["email", "phone_number"],
      ["row-0"],
      results,
      2,
    );
    const cell = out.get("row-0:email");
    expect(cell?.status).toBe("pending_match");
    expect(cell?.matchField).toBe("phone_number");
    expect(cell?.nameMismatch).toBe(true);
  });

  it("does not set nameMismatch when names match via phone", () => {
    const rows = [["new@x.com", "09123456789", "Poe Yati Hlaing"]];
    const specs: MatchSpecResolved[] = [
      { fieldKey: "email", colIndex: 0, type: "email", fuzzy: false },
      { fieldKey: "phone_number", colIndex: 1, type: "phone", fuzzy: false },
    ];
    const results: Record<string, Record<string, UserMatchResult>> = {
      email: {
        "new@x.com": {
          kind: "none",
          user: null,
          field: null,
          score: null,
          candidates: [],
        },
      },
      phone_number: {
        "09123456789": {
          kind: "exact",
          user: ref(11, "Poe Yati Hlaing"),
          field: "phone_number",
          score: 100,
          candidates: [],
        },
      },
    };
    const out = buildUserMatches(
      rows,
      specs,
      ["email", "phone_number"],
      ["row-0"],
      results,
      2,
    );
    expect(out.get("row-0:email")?.nameMismatch).toBeFalsy();
  });

  it("does not set nameMismatch for primary email match with different names", () => {
    const rows = [["sibling@x.com", "", "Mi Pakao Htaw"]];
    const results: Record<string, Record<string, UserMatchResult>> = {
      email: {
        "sibling@x.com": {
          kind: "exact",
          user: ref(12, "Mehm Samoi Htaw"),
          field: "email",
          score: 100,
          candidates: [],
        },
      },
      phone_number: {},
    };
    const out = buildUserMatches(
      rows,
      [{ fieldKey: "email", colIndex: 0, type: "email", fuzzy: false }],
      ["email"],
      ["row-0"],
      results,
      2,
    );
    expect(out.get("row-0:email")?.nameMismatch).toBeFalsy();
  });

  it("skips name check when nameColIndex is null", () => {
    const rows = [["new@x.com", "09123456789", "Mi Pakao Htaw"]];
    const specs: MatchSpecResolved[] = [
      { fieldKey: "email", colIndex: 0, type: "email", fuzzy: false },
      { fieldKey: "phone_number", colIndex: 1, type: "phone", fuzzy: false },
    ];
    const results: Record<string, Record<string, UserMatchResult>> = {
      email: {
        "new@x.com": {
          kind: "none",
          user: null,
          field: null,
          score: null,
          candidates: [],
        },
      },
      phone_number: {
        "09123456789": {
          kind: "exact",
          user: ref(10, "Mehm Samoi Htaw"),
          field: "phone_number",
          score: 100,
          candidates: [],
        },
      },
    };
    const out = buildUserMatches(
      rows,
      specs,
      ["email", "phone_number"],
      ["row-0"],
      results,
      null,
    );
    expect(out.get("row-0:email")?.nameMismatch).toBeFalsy();
  });

  it("name-only row with no match -> new not idle", () => {
    const rows = [["Paul", ""]];
    const nameSpecs: MatchSpecResolved[] = [
      { fieldKey: "name", colIndex: 0, type: "email", fuzzy: true },
    ];
    const out = buildUserMatches(
      rows,
      nameSpecs,
      ["name"],
      ["row-0"],
      { name: {} },
      0,
    );
    expect(out.get("row-0:name")?.status).toBe("new");
  });

  it("name-only exact match stores resolution under name key", () => {
    const rows = [["Hla Hla"]];
    const nameSpecs: MatchSpecResolved[] = [
      { fieldKey: "name", colIndex: 0, type: "email", fuzzy: true },
    ];
    const out = buildUserMatches(
      rows,
      nameSpecs,
      ["email", "name", "alternative_name"],
      ["row-0"],
      {
        name: {
          "Hla Hla": {
            kind: "exact",
            user: { id: 1, name: "Hla Hla", email: "hlahla@hlahla.com" },
            field: "name",
            score: 100,
            candidates: [],
          },
        },
      },
      0,
    );
    expect(out.get("row-0:name")?.status).toBe("pending_match");
    expect(out.get("row-0:email")).toBeUndefined();
  });
});

describe("resolveRowUserResolution", () => {
  it("finds email-key resolution when name key is absent", () => {
    const resolution = new Map<string, CellResolution>([
      [
        "row-0:email",
        {
          status: "confirmed",
          entityRef: { id: 1, label: "Hla Hla" },
          confirmedUserId: 1,
        },
      ],
    ]);
    const mapping = { name: 0, email: 1 };
    const cell = resolveRowUserResolution(resolution, "row-0", mapping);
    expect(cell?.status).toBe("confirmed");
    expect(cell?.entityRef?.label).toBe("Hla Hla");
  });
});

describe("user match reducers", () => {
  it("confirm flips pending_match to confirmed", () => {
    const cell = {
      status: "pending_match" as const,
      entityRef: { id: 5, label: "Sam" },
    };
    const next = confirmUserMatch(cell);
    expect(next.status).toBe("confirmed");
    expect(next.confirmedUserId).toBe(5);
  });

  it("reject flips to new", () => {
    expect(
      rejectUserMatch({
        status: "pending_match",
        entityRef: { id: 5, label: "Sam" },
      }).status,
    ).toBe("new");
  });

  it("confirmAllExactMatches skips nameMismatch rows", () => {
    const map = new Map<string, CellResolution>([
      ["row-0:email", { status: "pending_match", entityRef: { id: 1, label: "A" } }],
      [
        "row-1:email",
        {
          status: "pending_match",
          entityRef: { id: 2, label: "B" },
          nameMismatch: true,
          matchField: "phone_number",
        },
      ],
    ]);
    const next = confirmAllExactMatches(map);
    expect(next.get("row-0:email")?.status).toBe("confirmed");
    expect(next.get("row-1:email")?.status).toBe("pending_match");
  });

  it("countPendingExactMatches uses name field when email not mapped", () => {
    const mapping = { name: 0 };
    const map = new Map<string, CellResolution>([
      ["row-0:name", { status: "pending_match", entityRef: { id: 1, label: "Kyaw Thu" } }],
    ]);
    expect(countPendingExactMatches(map, ["row-0"], mapping)).toBe(1);
    expect(countPendingExactMatches(map, ["row-0"])).toBe(0);
  });

  it("countPendingExactMatches excludes nameMismatch rows", () => {
    const map = new Map<string, CellResolution>([
      ["row-0:email", { status: "pending_match", entityRef: { id: 1, label: "A" } }],
      [
        "row-1:email",
        {
          status: "pending_match",
          entityRef: { id: 2, label: "B" },
          nameMismatch: true,
        },
      ],
    ]);
    expect(countPendingExactMatches(map, ["row-0", "row-1"])).toBe(1);
  });

  it("countPendingNameMismatches counts only nameMismatch pending rows", () => {
    const map = new Map<string, CellResolution>([
      ["row-0:email", { status: "pending_match", entityRef: { id: 1, label: "A" } }],
      [
        "row-1:email",
        {
          status: "pending_match",
          entityRef: { id: 2, label: "B" },
          nameMismatch: true,
        },
      ],
      ["row-2:email", { status: "pending_candidates", candidates: [] }],
    ]);
    expect(countPendingNameMismatches(map, ["row-0", "row-1", "row-2"])).toBe(1);
  });

  it("confirmAllExactMatches only touches pending_match", () => {
    const map = new Map<string, CellResolution>([
      ["row-0:email", { status: "pending_match", entityRef: { id: 1, label: "A" } }],
      ["row-1:email", { status: "pending_candidates", candidates: [] }],
    ]);
    const next = confirmAllExactMatches(map);
    expect(next.get("row-0:email")?.status).toBe("confirmed");
    expect(next.get("row-1:email")?.status).toBe("pending_candidates");
  });
});

describe("buildUserMatches strictNameConsistency", () => {
  const ref = (id: number, name: string, email: string) => ({
    id,
    name,
    email,
    code: null,
    profile_image: null,
    roles: [],
  });

  const specs: MatchSpecResolved[] = [
    { fieldKey: "email", colIndex: 1, type: "email", fuzzy: false },
    { fieldKey: "name", colIndex: 0, type: "email", fuzzy: true },
  ];

  it("flags email match when imported name differs under strictNameConsistency", () => {
    const rows = [["Su Su", "susu@su.com"]];
    const results: Record<string, Record<string, UserMatchResult>> = {
      email: {
        "susu@su.com": {
          kind: "exact",
          user: ref(1, "Su Su Hlaing", "susu@su.com"),
          field: "email",
          score: 100,
          candidates: [],
        },
      },
      name: {
        "Su Su": {
          kind: "none",
          user: null,
          field: null,
          score: null,
          candidates: [],
        },
      },
    };
    const out = buildUserMatches(
      rows,
      specs,
      ["email", "name"],
      ["row-0"],
      results,
      0,
      true,
    );
    const cell = out.get("row-0:email");
    expect(cell?.status).toBe("pending_match");
    expect(cell?.nameMismatch).toBe(true);
    expect(cell?.entityRef?.email).toBe("susu@su.com");
  });

  it("does not flag email match name drift without strictNameConsistency", () => {
    const rows = [["Su Su", "susu@su.com"]];
    const results: Record<string, Record<string, UserMatchResult>> = {
      email: {
        "susu@su.com": {
          kind: "exact",
          user: ref(1, "Su Su Hlaing", "susu@su.com"),
          field: "email",
          score: 100,
          candidates: [],
        },
      },
      name: {
        "Su Su": {
          kind: "none",
          user: null,
          field: null,
          score: null,
          candidates: [],
        },
      },
    };
    const out = buildUserMatches(
      rows,
      specs,
      ["email", "name"],
      ["row-0"],
      results,
      0,
      false,
    );
    expect(out.get("row-0:email")?.nameMismatch).toBeUndefined();
  });

  it("confirmAllExactMatches skips strict nameMismatch rows", () => {
    const map = new Map<string, CellResolution>([
      [
        "row-0:email",
        {
          status: "pending_match",
          entityRef: { id: 1, label: "Su Su Hlaing", email: "susu@su.com" },
          nameMismatch: true,
        },
      ],
    ]);
    const next = confirmAllExactMatches(map);
    expect(next.get("row-0:email")?.status).toBe("pending_match");
  });

  it("treats roster none results as new when identifiers present", () => {
    const rows = [["Su Su", "susu@su.com"]];
    const results: Record<string, Record<string, UserMatchResult>> = {
      email: {
        "susu@su.com": {
          kind: "none",
          user: null,
          field: null,
          score: null,
          candidates: [],
        },
      },
      name: {
        "Su Su": {
          kind: "none",
          user: null,
          field: null,
          score: null,
          candidates: [],
        },
      },
    };
    const out = buildUserMatches(
      rows,
      specs,
      ["email", "name"],
      ["row-0"],
      results,
      0,
      true,
    );
    expect(out.get("row-0:email")?.status).toBe("new");
  });
});

describe("pickRosterStudent", () => {
  it("sets confirmedUserId and email for manual roster picks", () => {
    const cell = pickRosterStudent(
      { status: "new" },
      { id: 77, name: "Su Su Hlaing", email: "susu@su.com" },
    );
    expect(cell.status).toBe("confirmed");
    expect(cell.confirmedUserId).toBe(77);
    expect(cell.matchField).toBe("manual");
    expect(cell.entityRef).toEqual({
      id: 77,
      label: "Su Su Hlaing",
      email: "susu@su.com",
    });
  });
});

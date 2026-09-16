import { describe, expect, it } from "vitest";

import type { ImportFieldDef } from "@/app/client-api/imports";
import { buildCommitRowIndexMap, buildCommitRows } from "@/lib/imports/commit-payload";
import {
  type CellResolution,
  cellKey,
  resolveDuplicateEmails,
} from "@/lib/imports/resolution";

const fields: ImportFieldDef[] = [
  {
    field_key: "email",
    field_label: "Email",
    field_type: "email",
    choices: null,
    source: "identity",
    special: "user",
    required_for_role: true,
  },
  {
    field_key: "date_of_birth",
    field_label: "DOB",
    field_type: "date",
    choices: null,
    source: "builtin",
    special: null,
    required_for_role: false,
  },
  {
    field_key: "guardian",
    field_label: "Guardian",
    field_type: "text",
    choices: null,
    source: "custom",
    special: null,
    required_for_role: false,
  },
  {
    field_key: "courses",
    field_label: "Courses",
    field_type: "text",
    choices: null,
    source: "special",
    special: "course",
    required_for_role: false,
  },
];

describe("buildCommitRows", () => {
  it("splits builtins, custom_data, and course_ids; applies defaults", () => {
    const rows = [["a@x.com", "1/2/2026", "", "Math, Sci"]];
    const rowIds = ["row-0"];
    const mapping = { 0: "email", 1: "date_of_birth", 2: "guardian", 3: "courses" };
    const resolution = new Map<string, CellResolution>([
      [
        cellKey("row-0", "courses"),
        {
          status: "linked",
          tokens: [
            {
              raw: "Math",
              status: "linked",
              match: { id: 5, title: "Math" },
              candidates: [],
            },
            {
              raw: "Sci",
              status: "linked",
              match: { id: 6, title: "Sci" },
              candidates: [],
            },
          ],
        },
      ],
    ]);
    const out = buildCommitRows({
      rows,
      rowIds,
      mapping,
      fields,
      fieldDefaults: { guardian: "N/A" },
      resolution,
    });
    expect(out[0].email).toBe("a@x.com");
    expect(out[0].date_of_birth).toBe("2026-01-02");
    expect(out[0].custom_data).toEqual({ guardian: "N/A" });
    expect(out[0].course_ids).toEqual([5, 6]);
  });

  it("skips duplicate rows and merges courses when strategy is merge", () => {
    const rows = [
      ["dup@x.com", "2001-01-01", "Parent A", "Math"],
      ["unique@x.com", "2002-02-02", "Parent B", ""],
      ["dup@x.com", "", "Parent C", "Sci"],
    ];
    const rowIds = ["row-0", "row-1", "row-2"];
    const mapping = { 0: "email", 1: "date_of_birth", 2: "guardian", 3: "courses" };
    const resolution = new Map<string, CellResolution>([
      [
        cellKey("row-0", "courses"),
        {
          status: "linked",
          tokens: [
            {
              raw: "Math",
              status: "linked",
              match: { id: 5, title: "Math" },
              candidates: [],
            },
          ],
        },
      ],
      [
        cellKey("row-2", "courses"),
        {
          status: "linked",
          tokens: [
            {
              raw: "Sci",
              status: "linked",
              match: { id: 6, title: "Sci" },
              candidates: [],
            },
          ],
        },
      ],
    ]);
    const duplicateResolution = resolveDuplicateEmails({
      strategy: "merge",
      rows,
      emailColIndex: 0,
      rowIds,
      resolution,
    });
    const out = buildCommitRows({
      rows,
      rowIds,
      mapping,
      fields,
      fieldDefaults: {},
      resolution,
      duplicateResolution,
      duplicateStrategy: "merge",
    });
    expect(out).toHaveLength(2);
    expect(out[0].email).toBe("dup@x.com");
    expect(out[0].custom_data).toEqual({ guardian: "Parent A" });
    expect(out[0].course_ids.sort()).toEqual([5, 6]);
    expect(out[1].email).toBe("unique@x.com");
  });

  it("maps commit indices to source rows when duplicates are skipped", () => {
    const rows = [
      ["dup@x.com", "2001-01-01", "Parent A", "Math"],
      ["unique@x.com", "2002-02-02", "Parent B", ""],
      ["dup@x.com", "", "Parent C", "Sci"],
    ];
    const rowIds = ["row-0", "row-1", "row-2"];
    const mapping = { 0: "email", 1: "date_of_birth", 2: "guardian", 3: "courses" };
    const resolution = new Map<string, CellResolution>();
    const duplicateResolution = resolveDuplicateEmails({
      strategy: "keep_first",
      rows,
      emailColIndex: 0,
      rowIds,
      resolution,
    });
    const map = buildCommitRowIndexMap({ rows, duplicateResolution });
    expect(map).toEqual([0, 1]);
    expect(buildCommitRows({
      rows,
      rowIds,
      mapping,
      fields,
      fieldDefaults: {},
      resolution,
      duplicateResolution,
    })).toHaveLength(2);
  });

  it("includes match_user_id from confirmed user-match resolution", () => {
    const rows = [["real@x.com", "Real"]];
    const rowIds = ["row-0"];
    const mapping = { 0: "email", 1: "name" };
    const nameField: ImportFieldDef = {
      field_key: "name",
      field_label: "Name",
      field_type: "text",
      choices: null,
      source: "identity",
      special: null,
      required_for_role: true,
    };
    const testFields = [fields[0], nameField];
    const resolution = new Map<string, CellResolution>([
      [
        "row-0:email",
        {
          status: "confirmed",
          entityRef: { id: 42, label: "Real" },
          confirmedUserId: 42,
        },
      ],
    ]);
    const out = buildCommitRows({
      rows,
      rowIds,
      mapping,
      fields: testFields,
      fieldDefaults: {},
      resolution,
    });
    expect(out[0].match_user_id).toBe(42);
  });
});

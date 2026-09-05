import { describe, expect, it } from "vitest";
import { UserPaymentStatus } from "@/types/finance";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import {
  flattenPaymentReportRows,
  type FlattenedPaymentRow,
} from "./flatten-payment-report-rows";

const part = (
  id: number,
  overrides: Partial<StudentPaymentAdminReportRow> = {},
): StudentPaymentAdminReportRow => ({
  id,
  status: UserPaymentStatus.pending_verification,
  parsed_amount: "100",
  ...overrides,
});

describe("flattenPaymentReportRows", () => {
  it("passes through non-group rows", () => {
    const rows = [part(1)];
    const out = flattenPaymentReportRows(rows, new Set());
    expect(out).toEqual([
      { kind: "standalone", row: rows[0], parentGroupId: null, partIndex: null },
    ]);
  });

  it("keeps group collapsed when not expanded", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-9",
      kind: "group",
      group_id: 9,
      status: UserPaymentStatus.pending_verification,
      parts: [part(11), part(12)],
    };
    const out = flattenPaymentReportRows([group], new Set());
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("group_parent");
  });

  it("injects parts after parent when expanded", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-9",
      kind: "group",
      group_id: 9,
      status: UserPaymentStatus.pending_verification,
      parts: [part(11), part(12)],
    };
    const out = flattenPaymentReportRows([group], new Set([9]));
    expect(out.map((r: FlattenedPaymentRow) => r.kind)).toEqual([
      "group_parent",
      "group_part",
      "group_part",
    ]);
    expect(out[1]?.row.id).toBe(11);
    expect(out[1]?.partIndex).toBe(0);
    expect(out[1]?.parentGroupId).toBe(9);
    expect(out[2]?.row.id).toBe(12);
    expect(out[2]?.partIndex).toBe(1);
  });

  it("uses group_id from id prefix when group_id missing", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-42",
      kind: "group",
      status: UserPaymentStatus.pending_verification,
      parts: [part(1)],
    };
    const out = flattenPaymentReportRows([group], new Set([42]));
    expect(out).toHaveLength(2);
    expect(out[1]?.parentGroupId).toBe(42);
  });

  it("flattens multi_course groups with one payment per course", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-9",
      kind: "group",
      group_kind: "multi_course",
      group_id: 9,
      status: UserPaymentStatus.pending_verification,
      parts: [
        part(11, { course: { id: 1, title: "Course A" } }),
        part(12, { course: { id: 2, title: "Course B" } }),
      ],
    };
    const out = flattenPaymentReportRows([group], new Set());
    expect(out.map((r) => r.kind)).toEqual(["standalone", "standalone"]);
    expect(out.map((r) => r.row.id)).toEqual([11, 12]);
  });

  it("flattens course-scoped multi_course groups to a single standalone row", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-9",
      kind: "group",
      group_kind: "multi_course",
      group_id: 9,
      status: UserPaymentStatus.pending_verification,
      parts: [part(11, { course: { id: 1, title: "Course A" } })],
    };
    const out = flattenPaymentReportRows([group], new Set());
    expect(out).toEqual([
      {
        kind: "standalone",
        row: group.parts![0],
        parentGroupId: null,
        partIndex: null,
      },
    ]);
  });

  it("keeps split_screenshots groups grouped", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-9",
      kind: "group",
      group_kind: "split_screenshots",
      group_id: 9,
      status: UserPaymentStatus.pending_verification,
      parts: [
        part(11, { course: { id: 1, title: "Course A" } }),
        part(12, { course: { id: 1, title: "Course A" } }),
      ],
    };
    const out = flattenPaymentReportRows([group], new Set());
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("group_parent");
  });

  it("keeps multi_course groups grouped when multiple parts share a course", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-9",
      kind: "group",
      group_kind: "multi_course",
      group_id: 9,
      status: UserPaymentStatus.pending_verification,
      parts: [
        part(11, { course: { id: 1, title: "Course A" } }),
        part(12, { course: { id: 1, title: "Course A" } }),
      ],
    };
    const out = flattenPaymentReportRows([group], new Set([9]));
    expect(out.map((r) => r.kind)).toEqual([
      "group_parent",
      "group_part",
      "group_part",
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { UserPaymentStatus } from "@/types/finance";
import {
  getPaymentScreenshotUrl,
  isGroupPaymentRow,
  isPaymentFieldEditable,
  isSyntheticPaymentRow,
  paymentFieldDisplayValue,
  paymentRowMissingScreenshot,
  syntheticAllowsInlineCreate,
  sharedScreenshotNote,
  sharedScreenshotNoteTitles,
  sharedTransactionLookupId,
  shouldFlattenMultiCourseGroup,
  truncateCourseTitle,
  canShowPaymentReceiptAction,
} from "@/lib/data-sheets/payment-row-utils";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";

const baseRow: StudentPaymentAdminReportRow = {
  id: 1,
  status: UserPaymentStatus.pending_verification,
  user: { id: 10, name: "Test Student" },
};

describe("payment-row-utils", () => {
  it("detects synthetic rows", () => {
    expect(isSyntheticPaymentRow({ ...baseRow, id: "new-10-1" })).toBe(true);
    expect(isSyntheticPaymentRow({ ...baseRow, id: "24184new" })).toBe(true);
    expect(isSyntheticPaymentRow(baseRow)).toBe(false);
  });

  it("allows edits on synthetic unpaid placeholder rows", () => {
    const synthetic = { ...baseRow, id: "24184new" };
    expect(isPaymentFieldEditable(synthetic, "transaction_id")).toBe(true);
    expect(isPaymentFieldEditable(synthetic, "description")).toBe(true);
    expect(isPaymentFieldEditable(synthetic, "parsed_amount")).toBe(true);
  });

  it("still blocks edits on dropped synthetic rows", () => {
    const dropped = { ...baseRow, id: "24184new", is_removed: true };
    expect(isPaymentFieldEditable(dropped, "transaction_id")).toBe(false);
  });

  it("blocks edits on dropped rows", () => {
    const dropped = { ...baseRow, is_removed: true };
    expect(isPaymentFieldEditable(dropped, "transaction_id")).toBe(false);
  });

  it("locks parsed_amount when verified", () => {
    const verified = { ...baseRow, status: UserPaymentStatus.verified };
    expect(isPaymentFieldEditable(verified, "parsed_amount")).toBe(false);
    expect(isPaymentFieldEditable(baseRow, "parsed_amount")).toBe(true);
  });

  it("allows synthetic inline create when not exempt", () => {
    expect(
      syntheticAllowsInlineCreate({ ...baseRow, id: "new-10-1" }),
    ).toBe(true);
    expect(
      syntheticAllowsInlineCreate({
        ...baseRow,
        id: "new-10-1",
        is_removed: true,
      }),
    ).toBe(false);
  });

  it("detects group rows by kind or id prefix", () => {
    expect(isGroupPaymentRow({ ...baseRow, kind: "group" })).toBe(true);
    expect(isGroupPaymentRow({ ...baseRow, id: "group-42" })).toBe(true);
    expect(isGroupPaymentRow(baseRow)).toBe(false);
    expect(isGroupPaymentRow({ ...baseRow, kind: "payment" })).toBe(false);
  });

  it("flattens multi_course groups with one payment per course", () => {
    const groupRow: StudentPaymentAdminReportRow = {
      ...baseRow,
      id: "group-9",
      kind: "group",
      group_kind: "multi_course",
      parts: [
        { ...baseRow, id: 11, course: { id: 1, title: "Course A" } },
        { ...baseRow, id: 12, course: { id: 2, title: "Course B" } },
      ],
    };
    expect(shouldFlattenMultiCourseGroup(groupRow)).toBe(true);
  });

  it("flattens course-scoped multi_course groups with a single visible part", () => {
    const groupRow: StudentPaymentAdminReportRow = {
      ...baseRow,
      id: "group-9",
      kind: "group",
      group_kind: "multi_course",
      parts: [{ ...baseRow, id: 11, course: { id: 1, title: "Course A" } }],
    };
    expect(shouldFlattenMultiCourseGroup(groupRow)).toBe(true);
  });

  it("does not flatten split_screenshots groups", () => {
    const groupRow: StudentPaymentAdminReportRow = {
      ...baseRow,
      id: "group-9",
      kind: "group",
      group_kind: "split_screenshots",
      parts: [
        { ...baseRow, id: 11, course: { id: 1, title: "Course A" } },
        { ...baseRow, id: 12, course: { id: 1, title: "Course A" } },
      ],
    };
    expect(shouldFlattenMultiCourseGroup(groupRow)).toBe(false);
  });

  it("does not flatten multi_course groups with multiple parts for the same course", () => {
    const groupRow: StudentPaymentAdminReportRow = {
      ...baseRow,
      id: "group-9",
      kind: "group",
      group_kind: "multi_course",
      parts: [
        { ...baseRow, id: 11, course: { id: 1, title: "Course A" } },
        { ...baseRow, id: 12, course: { id: 1, title: "Course A" } },
      ],
    };
    expect(shouldFlattenMultiCourseGroup(groupRow)).toBe(false);
  });

  it("does not flatten groups without parts", () => {
    expect(
      shouldFlattenMultiCourseGroup({
        ...baseRow,
        id: "group-9",
        kind: "group",
        group_kind: "multi_course",
        parts: [],
      }),
    ).toBe(false);
  });

  it("does not flatten non-group rows", () => {
    expect(shouldFlattenMultiCourseGroup(baseRow)).toBe(false);
  });

  it("locks part-owned fields on group rows", () => {
    const groupRow = { ...baseRow, kind: "group" as const, id: "group-1" };
    expect(isPaymentFieldEditable(groupRow, "parsed_amount")).toBe(false);
    expect(isPaymentFieldEditable(groupRow, "transaction_id")).toBe(false);
    expect(isPaymentFieldEditable(groupRow, "date_on_screenshot")).toBe(false);
    expect(isPaymentFieldEditable(groupRow, "description")).toBe(false);
    expect(isPaymentFieldEditable(groupRow, "remarks")).toBe(false);
    expect(isPaymentFieldEditable(groupRow, "payment_date")).toBe(false);
  });

  it("keeps verified lock for non-group rows", () => {
    const verified = { ...baseRow, status: UserPaymentStatus.verified };
    expect(isPaymentFieldEditable(verified, "parsed_amount")).toBe(false);
    expect(isPaymentFieldEditable(verified, "transaction_id")).toBe(true);
  });
});

describe("getPaymentScreenshotUrl", () => {

  it("falls back to first part screenshot", () => {
    expect(
      getPaymentScreenshotUrl({
        ...baseRow,
        id: 2,
        screenshot: null,
        parts: [
          { screenshot: null },
          { screenshot: "https://cdn.example/part.png" },
        ],
      } as StudentPaymentAdminReportRow),
    ).toBe("https://cdn.example/part.png");
  });

  it("returns null when neither row nor parts have a screenshot", () => {
    expect(
      getPaymentScreenshotUrl({
        ...baseRow,
        id: 3,
        screenshot: null,
        parts: [{ screenshot: null }],
      } as StudentPaymentAdminReportRow),
    ).toBeNull();
  });
});

describe("paymentRowMissingScreenshot", () => {
  it("is false for synthetic rows without a persisted payment", () => {
    expect(paymentRowMissingScreenshot({ ...baseRow, id: "new-1" })).toBe(false);
  });

  it("is true for leaf payments without screenshot", () => {
    expect(
      paymentRowMissingScreenshot({ ...baseRow, screenshot: null }),
    ).toBe(true);
  });

  it("is false for leaf with screenshot", () => {
    expect(
      paymentRowMissingScreenshot({
        ...baseRow,
        screenshot: "https://cdn/x.png",
      }),
    ).toBe(false);
  });

  it("is false for group parents", () => {
    expect(
      paymentRowMissingScreenshot({ ...baseRow, kind: "group", id: "group-1" }),
    ).toBe(false);
  });
});

describe("paymentFieldDisplayValue created_by", () => {
  it("shows SuConnect for Teams-synced payments", () => {
    expect(
      paymentFieldDisplayValue(
        { ...baseRow, microsoft_submission_id: "abc-123" },
        "created_by",
      ),
    ).toBe("SuConnect");
  });

  it("shows staff name for manually uploaded payments", () => {
    expect(
      paymentFieldDisplayValue(
        { ...baseRow, created_by: { name: "Jane Admin" } },
        "created_by",
      ),
    ).toBe("Jane Admin");
  });

  it("returns empty string when neither submission id nor creator is set", () => {
    expect(paymentFieldDisplayValue(baseRow, "created_by")).toBe("");
  });
});

describe("sharedScreenshotNote", () => {
  const base = { id: 1, status: UserPaymentStatus.verified } as StudentPaymentAdminReportRow;

  it("names the single other course sharing the screenshot", () => {
    expect(
      sharedScreenshotNote({
        ...base,
        shared_screenshot_courses: [{ id: 2, title: "IELTS Evening" }],
      }),
    ).toBe("Same transaction also paid IELTS Evening");
  });

  it("names two sibling courses sharing the screenshot", () => {
    expect(
      sharedScreenshotNote({
        ...base,
        shared_screenshot_courses: [
          { id: 2, title: "Business English" },
          { id: 3, title: "TOEFL Prep" },
        ],
      }),
    ).toBe("Same transaction also paid Business English, TOEFL Prep");
  });

  it("caps long sibling lists with +N more", () => {
    expect(
      sharedScreenshotNote({
        ...base,
        shared_screenshot_courses: [
          { id: 2, title: "A" },
          { id: 3, title: "B" },
          { id: 4, title: "C" },
          { id: 5, title: "D" },
        ],
      }),
    ).toBe("Same transaction also paid A, B +2 more");
  });

  it("names courses on a cross-course group row", () => {
    expect(
      sharedScreenshotNote({
        ...base,
        id: "group-9",
        kind: "group",
        group_kind: "multi_course",
        courses: [
          { id: 2, title: "Business English" },
          { id: 3, title: "IELTS Prep" },
        ],
      }),
    ).toBe("Covers Business English, IELTS Prep");
  });

  it("uses shared_screenshot_courses on a course-scoped group row", () => {
    expect(
      sharedScreenshotNote({
        ...base,
        id: "group-9",
        kind: "group",
        group_kind: "multi_course",
        part_count: 1,
        courses: [],
        shared_screenshot_courses: [{ id: 3, title: "TOEFL Prep" }],
      }),
    ).toBe("Same transaction also paid TOEFL Prep");
  });

  it("returns null for an ordinary single-course payment", () => {
    expect(sharedScreenshotNote(base)).toBeNull();
    expect(
      sharedScreenshotNote({ ...base, shared_screenshot_courses: [] }),
    ).toBeNull();
  });

  it("ignores blank sibling titles rather than rendering an empty note", () => {
    expect(
      sharedScreenshotNote({
        ...base,
        shared_screenshot_courses: [{ id: 2, title: "   " }],
      }),
    ).toBeNull();
  });

  it("compacts two long dated course titles to a count", () => {
    expect(
      sharedScreenshotNote({
        ...base,
        id: "group-9",
        kind: "group",
        group_kind: "multi_course",
        courses: [
          { id: 2, title: "ACCA AA - 2026 Oct - 2027 Mar" },
          { id: 3, title: "ACCA FR - 2026 Oct - 2027 Mar" },
        ],
      }),
    ).toBe("Covers 2 courses");
  });

  it("truncates a single long course title", () => {
    const longTitle = "ACCA AA - 2026 Oct - 2027 Mar";
    expect(
      sharedScreenshotNote({
        ...base,
        shared_screenshot_courses: [{ id: 2, title: longTitle }],
      }),
    ).toBe(`Same transaction also paid ${truncateCourseTitle(longTitle)}`);
  });
});

describe("sharedScreenshotNoteTitles", () => {
  it("returns full comma-separated course titles", () => {
    expect(
      sharedScreenshotNoteTitles({
        id: "group-9",
        status: UserPaymentStatus.verified,
        kind: "group",
        group_kind: "multi_course",
        courses: [
          { id: 2, title: "ACCA AA - 2026 Oct - 2027 Mar" },
          { id: 3, title: "ACCA FR - 2026 Oct - 2027 Mar" },
        ],
      }),
    ).toBe("ACCA AA - 2026 Oct - 2027 Mar, ACCA FR - 2026 Oct - 2027 Mar");
  });
});

describe("sharedTransactionLookupId", () => {
  it("returns trimmed transaction id when present", () => {
    expect(
      sharedTransactionLookupId({
        id: 1,
        status: UserPaymentStatus.verified,
        transaction_id: "  TXN-123  ",
      }),
    ).toBe("TXN-123");
  });

  it("returns null for blank transaction id", () => {
    expect(
      sharedTransactionLookupId({
        id: 1,
        status: UserPaymentStatus.verified,
        transaction_id: "   ",
      }),
    ).toBeNull();
  });
});

describe("canShowPaymentReceiptAction", () => {
  const base = { id: 1, status: UserPaymentStatus.verified } as StudentPaymentAdminReportRow;

  it("allows standalone payments without a group", () => {
    expect(canShowPaymentReceiptAction(base)).toBe(true);
  });

  it("allows flattened multi-course parts that still carry group_id", () => {
    expect(
      canShowPaymentReceiptAction(
        { id: base.id },
        "standalone",
      ),
    ).toBe(true);
  });

  it("allows group parent rows", () => {
    expect(
      canShowPaymentReceiptAction(
        { id: "group-9" },
        "group_parent",
      ),
    ).toBe(true);
  });

  it("hides receipt on expanded group_part rows", () => {
    expect(
      canShowPaymentReceiptAction(
        { id: base.id },
        "group_part",
      ),
    ).toBe(false);
  });

  it("hides receipt on synthetic rows", () => {
    expect(
      canShowPaymentReceiptAction({ id: "new-10-1" }),
    ).toBe(false);
  });
});

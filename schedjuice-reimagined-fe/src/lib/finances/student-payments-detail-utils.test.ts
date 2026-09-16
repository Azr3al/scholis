import { describe, expect, it } from "vitest";

import { UserPaymentStatus } from "@/types/finance";
import { operatorEnum } from "@/types/api";
import {
  buildStudentDetailFilterParams,
  sortStudentPaymentDetailRows,
  summarizeStudentPayments,
} from "@/lib/finances/student-payments-detail-utils";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import type { accountType } from "@/types/user";

const adminUser = { id: 1, role: "admin" } as unknown as accountType;

function row(
  over: Partial<StudentPaymentAdminReportRow>,
): StudentPaymentAdminReportRow {
  return {
    id: 1,
    status: UserPaymentStatus.pending_verification,
    user: { id: 10, name: "Nyein Chan" },
    ...over,
  };
}

const scope = {
  courseId: "42",
  monthDate: new Date(2026, 6, 15),
};

describe("student-payments-detail-utils", () => {
  it("returns empty filter params when studentId is blank", () => {
    expect(
      buildStudentDetailFilterParams(adminUser, "", scope).filter_params,
    ).toEqual([]);
  });

  it("returns empty when course scope is missing", () => {
    expect(buildStudentDetailFilterParams(adminUser, "10").filter_params).toEqual(
      [],
    );
  });

  it("adds course, month, and user_id filters for an unscoped admin", () => {
    const params = buildStudentDetailFilterParams(adminUser, "10", scope);
    expect(params.filter_params).toEqual([
      { field_name: "course_id", operator: operatorEnum.exact, value: "42" },
      {
        field_name: "issued_at",
        operator: operatorEnum.gte,
        value: expect.any(String),
      },
      {
        field_name: "issued_at",
        operator: operatorEnum.lte,
        value: expect.any(String),
      },
      { field_name: "user_id", operator: operatorEnum.exact, value: "10" },
    ]);
  });

  it("sorts rows by billing_start_date descending, newest first", () => {
    const rows = [
      row({ id: 1, billing_start_date: "2026-01-01" }),
      row({ id: 2, billing_start_date: "2026-03-01" }),
      row({ id: 3, billing_start_date: "2026-02-01" }),
    ];
    expect(sortStudentPaymentDetailRows(rows).map((r) => r.id)).toEqual([
      2, 3, 1,
    ]);
  });

  it("summarizes count, verified count, and total verified amount", () => {
    const rows = [
      row({ id: 1, status: UserPaymentStatus.verified, parsed_amount: "2000" }),
      row({ id: 2, status: UserPaymentStatus.verified, parsed_amount: "500.5" }),
      row({
        id: 3,
        status: UserPaymentStatus.pending_verification,
        parsed_amount: "999",
      }),
    ];
    expect(summarizeStudentPayments(rows)).toEqual({
      count: 3,
      verifiedCount: 2,
      totalVerifiedAmount: 2500.5,
    });
  });

  it("treats null/blank verified amounts as zero", () => {
    const rows = [
      row({ id: 1, status: UserPaymentStatus.verified, parsed_amount: null }),
      row({ id: 2, status: UserPaymentStatus.verified, parsed_amount: "" }),
    ];
    expect(summarizeStudentPayments(rows)).toEqual({
      count: 2,
      verifiedCount: 2,
      totalVerifiedAmount: 0,
    });
  });

  it("counts a payment group as one logical payment", () => {
    const rows = [
      row({
        id: "group-1",
        kind: "group",
        status: UserPaymentStatus.pending_verification,
        parsed_amount: "3000",
        part_count: 2,
        parts: [
          row({
            id: 101,
            status: UserPaymentStatus.verified,
            parsed_amount: "1500",
          }),
          row({
            id: 102,
            status: UserPaymentStatus.pending_verification,
            parsed_amount: "1500",
          }),
        ],
      }),
      row({ id: 2, status: UserPaymentStatus.verified, parsed_amount: "500" }),
    ];
    expect(summarizeStudentPayments(rows)).toEqual({
      count: 2,
      verifiedCount: 1,
      totalVerifiedAmount: 2000,
    });
  });

  it("sums verified part amounts even when group rollup is not verified", () => {
    const rows = [
      row({
        id: "group-2",
        kind: "group",
        status: UserPaymentStatus.pending_verification,
        parsed_amount: "4000",
        parts: [
          row({
            id: 201,
            status: UserPaymentStatus.verified,
            parsed_amount: "2500",
          }),
          row({
            id: 202,
            status: UserPaymentStatus.pending_verification,
            parsed_amount: "1500",
          }),
        ],
      }),
    ];
    expect(summarizeStudentPayments(rows)).toEqual({
      count: 1,
      verifiedCount: 0,
      totalVerifiedAmount: 2500,
    });
  });

  it("uses group parsed_amount when verified without nested parts", () => {
    const rows = [
      row({
        id: "group-3",
        kind: "group",
        status: UserPaymentStatus.verified,
        parsed_amount: "1200",
      }),
    ];
    expect(summarizeStudentPayments(rows)).toEqual({
      count: 1,
      verifiedCount: 1,
      totalVerifiedAmount: 1200,
    });
  });
});

import { describe, expect, it } from "vitest";

import type { UserPayment } from "@/sdk";

import { parseRecentTxnRowDrawerContext } from "./recent-transactions-row-utils";

function baseRow(overrides: Partial<UserPayment> = {}): UserPayment {
  return {
    id: 1,
    user: { id: 42, name: "Student" },
    course: { id: 7, title: "Edexcel Physics" },
    ...overrides,
  } as UserPayment;
}

describe("parseRecentTxnRowDrawerContext", () => {
  it("uses earliest covered month when payment_date is in a different month", () => {
    const ctx = parseRecentTxnRowDrawerContext(
      baseRow({
        payment_date: "2026-08-15T00:00:00.000Z",
        covered_months: [{ year: 2026, month_index: 9 }],
      }),
    );
    expect(ctx).not.toBeNull();
    expect(ctx!.monthDate.getFullYear()).toBe(2026);
    expect(ctx!.monthDate.getMonth()).toBe(8);
    expect(ctx!.studentId).toBe("42");
    expect(ctx!.courseId).toBe("7");
    expect(ctx!.courseTitle).toBe("Edexcel Physics");
  });

  it("picks earliest when covered_months are out of order", () => {
    const ctx = parseRecentTxnRowDrawerContext(
      baseRow({
        payment_date: "2026-08-01T00:00:00.000Z",
        covered_months: [
          { year: 2026, month_index: 11 },
          { year: 2026, month_index: 9 },
          { year: 2026, month_index: 10 },
        ],
      }),
    );
    expect(ctx!.monthDate.getFullYear()).toBe(2026);
    expect(ctx!.monthDate.getMonth()).toBe(8);
  });

  it("falls back to issued_at when covered_months is empty", () => {
    const ctx = parseRecentTxnRowDrawerContext(
      baseRow({
        payment_date: "2026-08-15T00:00:00.000Z",
        covered_months: [],
        issued_at: "2026-07-10T12:00:00.000Z",
      }),
    );
    expect(ctx!.monthDate.getFullYear()).toBe(2026);
    expect(ctx!.monthDate.getMonth()).toBe(6);
  });

  it("falls back to billing_start_date then payment_date", () => {
    const fromBilling = parseRecentTxnRowDrawerContext(
      baseRow({
        payment_date: "2026-08-15T00:00:00.000Z",
        billing_start_date: "2026-06-01T00:00:00.000Z",
      }),
    );
    expect(fromBilling!.monthDate.getMonth()).toBe(5);

    const fromPayment = parseRecentTxnRowDrawerContext(
      baseRow({
        payment_date: "2026-08-20T00:00:00.000Z",
      }),
    );
    expect(fromPayment!.monthDate.getMonth()).toBe(7);
  });

  it("returns null when user.id is missing", () => {
    expect(
      parseRecentTxnRowDrawerContext(
        baseRow({ user: { name: "No id" } as UserPayment["user"] }),
      ),
    ).toBeNull();
  });
});

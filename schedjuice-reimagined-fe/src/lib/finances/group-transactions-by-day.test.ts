import { describe, expect, it } from "vitest";
import { groupTransactionsByDay } from "./group-transactions-by-day";
import type { UserPayment } from "@/sdk";

const formatDayLabel = (dateKey: string) => dateKey;

function row(id: number, payment_date: string): UserPayment {
  return { id, payment_date } as UserPayment;
}

describe("groupTransactionsByDay", () => {
  it("groups rows by tenant timezone calendar day, newest day first", () => {
    const rows = [
      row(1, "2026-08-09T10:00:00.000Z"),
      row(2, "2026-08-10T08:00:00.000Z"),
      row(3, "2026-08-10T12:00:00.000Z"),
    ];
    const sections = groupTransactionsByDay({
      rows,
      timezone: "Asia/Yangon",
      dateField: "payment_date",
      formatDayLabel,
    });
    expect(sections.map((s) => s.dateKey)).toEqual(["2026-08-10", "2026-08-09"]);
    expect(sections[0].rows.map((r) => r.id)).toEqual([2, 3]);
  });

  it("puts rows with missing date in unknown section last", () => {
    const rows = [row(1, "2026-08-10T08:00:00.000Z"), { id: 2 } as UserPayment];
    const sections = groupTransactionsByDay({
      rows,
      timezone: "UTC",
      dateField: "payment_date",
      formatDayLabel,
    });
    expect(sections.at(-1)?.dateKey).toBe("unknown");
    expect(sections.at(-1)?.rows.map((r) => r.id)).toEqual([2]);
  });
});

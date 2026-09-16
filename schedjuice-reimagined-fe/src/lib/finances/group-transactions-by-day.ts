import { formatInTimeZone } from "date-fns-tz";
import type { UserPayment } from "@/sdk";

export type TransactionDaySection = {
  dateKey: string;
  label: string;
  rows: UserPayment[];
};

export function getRecentTxnDateField(): "payment_date" {
  return "payment_date";
}

function readRowDate(
  row: UserPayment,
  dateField: "payment_date",
): string | null {
  const raw = row[dateField];
  return typeof raw === "string" && raw.trim() ? raw : null;
}

export function groupTransactionsByDay(args: {
  rows: UserPayment[];
  timezone: string;
  dateField: "payment_date";
  formatDayLabel: (dateKey: string) => string;
}): TransactionDaySection[] {
  const { rows, timezone, dateField, formatDayLabel } = args;
  const byDay = new Map<string, UserPayment[]>();
  const unknown: UserPayment[] = [];

  for (const row of rows) {
    const raw = readRowDate(row, dateField);
    if (!raw) {
      unknown.push(row);
      continue;
    }
    const dateKey = formatInTimeZone(new Date(raw), timezone, "yyyy-MM-dd");
    const bucket = byDay.get(dateKey);
    if (bucket) bucket.push(row);
    else byDay.set(dateKey, [row]);
  }

  const sections: TransactionDaySection[] = Array.from(byDay.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayRows]) => ({
      dateKey,
      label: formatDayLabel(dateKey),
      rows: dayRows,
    }));

  if (unknown.length > 0) {
    sections.push({
      dateKey: "unknown",
      label: "Unknown date",
      rows: unknown,
    });
  }

  return sections;
}

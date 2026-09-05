import { column, type Column } from "@/components/data-table";
import { formatMonthLong } from "@/helpers/payment-coverage-months";
import type { ColumnLayoutMeta } from "@/lib/finances/apply-column-layout-meta";
import type { User } from "@/sdk";

export type UnpaidStudentRow = Pick<
  User,
  "id" | "name" | "email" | "paid_until" | "payment_status" | "course_title"
>;

export const unpaidStudentColumnLayout: ColumnLayoutMeta[] = [
  {
    id: "user__name",
    contentRole: "person",
    minWidth: "12rem",
    align: "left",
    truncate: true,
  },
  {
    id: "user__email",
    contentRole: "prose",
    minWidth: "14rem",
    align: "left",
    truncate: true,
  },
  {
    id: "course_title",
    contentRole: "prose",
    minWidth: "14rem",
    align: "left",
    truncate: true,
  },
  {
    id: "paid_until",
    contentRole: "date",
    minWidth: "9rem",
    align: "left",
    truncate: false,
  },
  {
    id: "payment_status",
    contentRole: "status",
    minWidth: "9rem",
    align: "left",
    truncate: false,
  },
];

export const unpaidStudentColumns: Column<UnpaidStudentRow>[] = [
  column.text<UnpaidStudentRow>({
    id: "user__name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person", width: { min: "12rem" } },
  }),
  column.text<UnpaidStudentRow>({
    id: "user__email",
    header: "Email",
    accessor: (row) => row.email,
    sizing: { role: "prose", width: { min: "14rem" }, wrap: "truncate" },
  }),
  {
    id: "paid_until",
    header: "Paid until",
    accessor: (row) => row.paid_until,
    enableSorting: false,
    sizing: { role: "date", width: { min: "9rem" } },
    cell: ({ row }) => {
      const paidUntil = row.paid_until;
      if (!paidUntil) return "—";
      return formatMonthLong(paidUntil.year, paidUntil.month_index);
    },
  },
  {
    id: "payment_status",
    header: "Status",
    accessor: (row) => row.payment_status,
    enableSorting: false,
    sizing: { role: "status", width: { min: "9rem" } },
    cell: ({ row }) => {
      const status = row.payment_status;
      if (status === "never_paid") {
        return (
          <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary">
            Never paid
          </span>
        );
      }
      return (
        <span className="inline-flex items-center rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
          Behind
        </span>
      );
    },
  },
];

// Backend sorts unpaid rows on UserCourse and rejects course__title, so this stays unsorted.
const courseColumn: Column<UnpaidStudentRow> = column.text<UnpaidStudentRow>({
  id: "course_title",
  header: "Course",
  accessor: (row) => row.course_title,
  enableSorting: false,
  sizing: { role: "prose", width: { min: "14rem" }, wrap: "truncate" },
});

/** Every course in the month is listed at once, so each row needs its course. */
export function getUnpaidStudentColumns(
  showCourse: boolean,
): Column<UnpaidStudentRow>[] {
  if (!showCourse) return unpaidStudentColumns;
  const [nameColumn, ...rest] = unpaidStudentColumns;
  return [nameColumn, courseColumn, ...rest];
}

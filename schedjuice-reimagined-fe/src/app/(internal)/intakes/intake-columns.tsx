import { column, type Column } from "@/components/data-table";
import type { Intake } from "@/sdk";

export const intakeColumns: Column<Intake>[] = [
  column.text<Intake>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
  column.text<Intake>({
    id: "program",
    header: "Program",
    accessor: (row) =>
      typeof row.program === "object" ? row.program?.name : String(row.program ?? ""),
    sizing: { role: "identifier" },
  }),
  column.text<Intake>({
    id: "term",
    header: "Term",
    accessor: (row) => {
      const start = row.start_date ?? "";
      const end = row.end_date ?? "";
      if (start && end) return `${start} – ${end}`;
      return start || end || null;
    },
    sizing: { role: "date" },
  }),
  column.numeric<Intake>({
    id: "courses_count",
    header: "Courses",
    accessor: (row) => row.courses_count,
  }),
];

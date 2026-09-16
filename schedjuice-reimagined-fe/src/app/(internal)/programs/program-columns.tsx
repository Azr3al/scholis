import { column, type Column } from "@/components/data-table";
import type { Program } from "@/sdk";

export const programColumns: Column<Program>[] = [
  column.text<Program>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
  column.status<Program>({
    id: "course_creation_method",
    header: "Creation",
    accessor: (row) =>
      row.course_creation_method === "intake_based" ? "Intake-based" : "Manual",
  }),
  column.text<Program>({
    id: "subject_strategy",
    header: "Subjects",
    accessor: (row) => row.subject_strategy,
    sizing: { role: "prose", wrap: "truncate" },
  }),
  column.status<Program>({
    id: "is_active",
    header: "Active",
    accessor: (row) => (row.is_active ? "Yes" : "No"),
  }),
];

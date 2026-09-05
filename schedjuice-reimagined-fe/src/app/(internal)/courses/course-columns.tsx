import { column, type Column } from "@/components/data-table";
import type { Course } from "@/sdk";

export const courseColumns: Column<Course>[] = [
  column.text<Course>({
    id: "title",
    header: "Course Title",
    accessor: (row) => row.title,
  }),
  column.text<Course>({
    id: "code",
    header: "Code",
    accessor: (row) => row.code,
  }),
  column.text<Course>({
    id: "status",
    header: "Status",
    accessor: (row) => row.status,
  }),
  column.date<Course>({
    id: "start_date",
    header: "Start Date",
    accessor: (row) => row.start_date,
  }),
  column.date<Course>({
    id: "end_date",
    header: "End Date",
    accessor: (row) => row.end_date,
  }),
];

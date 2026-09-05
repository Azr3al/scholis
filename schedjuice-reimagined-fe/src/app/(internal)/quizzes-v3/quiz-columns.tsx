import { column, type Column } from "@/components/data-table";
import type { Quiz } from "@/sdk";

export const quizColumns: Column<Quiz>[] = [
  column.text<Quiz>({
    id: "title",
    header: "Title",
    accessor: (row) => row.title,
  }),
  column.text<Quiz>({
    id: "status",
    header: "Status",
    accessor: (row) => row.status,
  }),
  column.date<Quiz>({
    id: "created_at",
    header: "Created At",
    accessor: (row) => row.created_at,
  }),
  column.text<Quiz>({
    id: "category",
    header: "Category",
    accessor: (row) => row.category?.title ?? row.category?.name,
  }),
  column.text<Quiz>({
    id: "created_by",
    header: "Created By",
    accessor: (row) => row.created_by?.name,
  }),
];

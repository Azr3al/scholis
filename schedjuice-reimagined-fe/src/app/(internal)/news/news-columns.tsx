import { column, type Column } from "@/components/data-table";
import type { News } from "@/sdk";

export const newsColumns: Column<News>[] = [
  column.text<News>({
    id: "title",
    header: "Title",
    accessor: (row) =>
      row.title.length > 50 ? `${row.title.slice(0, 50)}...` : row.title,
  }),
  column.text<News>({
    id: "created_by",
    header: "Created By",
    accessor: (row) => row.created_by?.name,
  }),
  column.date<News>({
    id: "created_at",
    header: "Created At",
    accessor: (row) => row.created_at,
  }),
];

import type { ReactNode } from "react";

import { formatDate } from "@/helpers/date";
import type { Column, ColumnSizing } from "./types";

type BuilderOpts<T, V> = {
  id: string;
  header: Column<T>["header"];
  accessor: (row: T) => V;
  enableSorting?: boolean;
  sizing?: ColumnSizing;
  align?: Column<T>["align"];
  headerMenu?: Column<T>["headerMenu"];
};

export const column = {
  text<T>(opts: BuilderOpts<T, string | null | undefined>): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      align: opts.align,
      sizing: opts.sizing ?? { role: "prose" },
      enableSorting: opts.enableSorting ?? true,
      headerMenu: opts.headerMenu,
      cell: ({ value }) => (value == null || value === "" ? "—" : String(value)),
    };
  },
  date<T>(opts: BuilderOpts<T, string | Date | null | undefined>): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      sizing: opts.sizing ?? { role: "date" },
      enableSorting: true,
      headerMenu: opts.headerMenu,
      cell: ({ value }) => {
        if (value == null || value === "") return "—";
        const d = value instanceof Date ? value : new Date(String(value));
        return Number.isNaN(d.getTime()) ? "—" : formatDate(d);
      },
    };
  },
  numeric<T>(opts: BuilderOpts<T, number | string | null | undefined>): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      align: "right",
      sizing: opts.sizing ?? { role: "numeric", tabular: true },
      enableSorting: opts.enableSorting ?? true,
      headerMenu: opts.headerMenu,
      cell: ({ value }) => (value == null || value === "" ? "—" : String(value)),
    };
  },
  status<T>(opts: BuilderOpts<T, string | null | undefined>): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      sizing: opts.sizing ?? { role: "status" },
      enableSorting: opts.enableSorting ?? false,
      headerMenu: opts.headerMenu,
      cell: ({ value }) => (value == null || value === "" ? "—" : String(value)),
    };
  },
  editableText<T>(opts: {
    id: string;
    header: Column<T>["header"];
    accessor: (row: T) => string | null | undefined;
    onSave: (row: T, value: string) => Promise<void>;
    sizing?: ColumnSizing;
    formatDisplay?: (value: string) => ReactNode;
  }): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      sizing: opts.sizing ?? { role: "control" },
      editable: {
        kind: "text",
        onSave: (row, value) => opts.onSave(row, String(value ?? "")),
        formatDisplay: opts.formatDisplay,
      },
    };
  },
};

import type { ReactNode } from "react";

export type ColumnAlign = "left" | "right" | "center";

export type ColumnContentRole =
  | "identifier"
  | "person"
  | "prose"
  | "date"
  | "numeric"
  | "status"
  | "action"
  | "control";

export type ColumnWrapPolicy = "truncate" | "wrap" | "nowrap";

export type ColumnWidthSpec = {
  min?: string;
  preferred?: string;
  max?: string;
};

/** Semantic sizing metadata — see docs/design/ui-contracts/table-column-sizing.md */
export type ColumnSizing = {
  role?: ColumnContentRole;
  width?: ColumnWidthSpec;
  wrap?: ColumnWrapPolicy;
  align?: ColumnAlign;
  tabular?: boolean;
  sticky?: "left";
};

export type ColumnHeaderMenuConfig = {
  /** When true, show Copy column in the ⋯ menu. */
  copy?: boolean;
  onCopy?: () => void;
};

export type Column<T> = {
  id: string;
  header: ReactNode;
  accessor: (row: T) => unknown;
  align?: ColumnAlign;
  sizing?: ColumnSizing;
  enableSorting?: boolean;
  /** Opt-in ⋯ menu (sort + optional copy) instead of label-click sort. */
  headerMenu?: ColumnHeaderMenuConfig;
  cell?: (ctx: { row: T; value: unknown }) => ReactNode;
  /** Opt-in editable — only set by column.editable* builders */
  editable?: {
    kind: "text" | "select" | "switch" | "date";
    options?: { label: string; value: string }[];
    onSave: (row: T, value: unknown) => Promise<void>;
    formatDisplay?: (value: string) => ReactNode;
  };
};

export type ResourceTableState = {
  page: number;
  pageSize: number;
  sorts: string[];
  q: string;
  filters: Record<string, unknown>;
};

export type ResourceListResult<T> = {
  rows: T[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};

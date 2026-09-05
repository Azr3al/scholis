import type { ColumnAlign, ColumnContentRole, ColumnSizing, ColumnWrapPolicy } from "./types";

export type ResolvedColumnSizing = {
  role: ColumnContentRole;
  width: { min: string; preferred: string; max?: string };
  wrap: ColumnWrapPolicy;
  align: ColumnAlign;
  tabular: boolean;
};

export type ColumnLayoutModel = {
  colStyle: { minWidth?: string; width?: string; maxWidth?: string };
  thClass: string;
  tdClass: string;
  wrapClass: string;
  sticky?: "left";
};

/** Parse CSS length (rem/px) to pixels for TanStack column sizing. */
export function cssLengthToPx(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.endsWith("rem")) {
    const n = parseFloat(trimmed);
    return Number.isNaN(n) ? undefined : Math.round(n * 16);
  }
  if (trimmed.endsWith("px")) {
    const n = parseFloat(trimmed);
    return Number.isNaN(n) ? undefined : Math.round(n);
  }
  return undefined;
}

const ROLE_DEFAULTS: Record<
  ColumnContentRole,
  Omit<ResolvedColumnSizing, "role">
> = {
  identifier: {
    width: { min: "8rem", preferred: "10rem", max: "14rem" },
    wrap: "truncate",
    align: "left",
    tabular: false,
  },
  person: {
    width: { min: "12rem", preferred: "14rem", max: "18rem" },
    wrap: "wrap",
    align: "left",
    tabular: false,
  },
  prose: {
    width: { min: "14rem", preferred: "20rem", max: "28rem" },
    wrap: "wrap",
    align: "left",
    tabular: false,
  },
  date: {
    width: { min: "9rem", preferred: "11rem", max: "14rem" },
    wrap: "nowrap",
    align: "left",
    tabular: false,
  },
  numeric: {
    width: { min: "7rem", preferred: "9rem", max: "12rem" },
    wrap: "nowrap",
    align: "right",
    tabular: true,
  },
  status: {
    width: { min: "9rem", preferred: "11rem", max: "14rem" },
    wrap: "nowrap",
    align: "left",
    tabular: false,
  },
  action: {
    width: { min: "5rem", preferred: "6rem", max: "8rem" },
    wrap: "nowrap",
    align: "center",
    tabular: false,
  },
  control: {
    width: { min: "10rem", preferred: "12rem" },
    wrap: "nowrap",
    align: "left",
    tabular: false,
  },
};

function alignClass(align: ColumnAlign): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function wrapClassFor(policy: ColumnWrapPolicy): string {
  if (policy === "wrap") return "whitespace-normal break-words";
  if (policy === "truncate") return "truncate whitespace-nowrap";
  return "whitespace-nowrap";
}

export function mergeColumnSizing(
  sizing: ColumnSizing,
  alignOverride?: ColumnAlign,
): ResolvedColumnSizing {
  const role = sizing.role ?? "prose";
  const base = ROLE_DEFAULTS[role];
  const width = {
    min: sizing?.width?.min ?? base.width.min,
    preferred: sizing?.width?.preferred ?? base.width.preferred,
    max: sizing?.width?.max ?? base.width.max,
  };
  return {
    role,
    width,
    wrap: sizing?.wrap ?? base.wrap,
    align: alignOverride ?? sizing?.align ?? base.align,
    tabular: sizing?.tabular ?? base.tabular,
  };
}

export function resolveColumnLayout(
  sizing: ColumnSizing | undefined,
  alignOverride?: ColumnAlign,
): ColumnLayoutModel {
  if (sizing == null) {
    const align = alignClass(alignOverride ?? "left");
    return {
      colStyle: {},
      thClass: align,
      tdClass: "",
      wrapClass: "",
      sticky: undefined,
    };
  }

  if (sizing.role == null) {
    const align = alignClass(alignOverride ?? sizing.align ?? "left");
    const colStyle: ColumnLayoutModel["colStyle"] = {};
    if (sizing.width?.min) colStyle.minWidth = sizing.width.min;
    if (sizing.width?.preferred) colStyle.width = sizing.width.preferred;
    if (sizing.width?.max) colStyle.maxWidth = sizing.width.max;
    return {
      colStyle,
      thClass: align,
      tdClass: sizing.tabular ? "tabular-nums" : "",
      wrapClass: sizing.wrap ? wrapClassFor(sizing.wrap) : "",
      sticky: sizing.sticky,
    };
  }

  const resolved = mergeColumnSizing(sizing, alignOverride);
  const colStyle: ColumnLayoutModel["colStyle"] = {
    minWidth: resolved.width.min,
    width: resolved.width.preferred,
  };
  if (resolved.width.max) {
    colStyle.maxWidth = resolved.width.max;
  }
  const align = alignClass(resolved.align);
  const wrap = wrapClassFor(resolved.wrap);
  const tabular = resolved.tabular ? "tabular-nums" : "";
  return {
    colStyle,
    thClass: align,
    tdClass: tabular,
    wrapClass: wrap,
    sticky: sizing.sticky,
  };
}

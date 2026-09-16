import type { PageWidth } from "@/lib/layout/page-width";

export type PageDensity = "comfortable" | "dense";

export type RouteFamily =
  | "admin-crud-list"
  | "admin-crud-create"
  | "admin-crud-detail"
  | "dashboard-analytics"
  | "finance-operations"
  | "record-body";

export type PageLayoutPreset = {
  width: PageWidth;
  density: PageDensity;
};

export const PAGE_DENSITY_CLASS: Record<PageDensity, string> = {
  comfortable: "pt-6 pb-20 gap-6",
  dense: "pt-4 pb-12 gap-4",
};

const ROUTE_FAMILY_PRESETS: Record<RouteFamily, PageLayoutPreset> = {
  "admin-crud-list": { width: "wide", density: "comfortable" },
  "admin-crud-create": { width: "narrow", density: "comfortable" },
  "admin-crud-detail": { width: "default", density: "comfortable" },
  "dashboard-analytics": { width: "wide", density: "comfortable" },
  "finance-operations": { width: "full", density: "dense" },
  "record-body": { width: "default", density: "comfortable" },
};

export function routeFamilyPageWidth(family: RouteFamily): PageLayoutPreset {
  return ROUTE_FAMILY_PRESETS[family];
}

export function resolvePageDensity(
  density: PageDensity | undefined,
  fallback: PageDensity = "comfortable",
): PageDensity {
  return density ?? fallback;
}

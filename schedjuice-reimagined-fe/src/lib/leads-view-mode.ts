export type LeadsViewMode = "board" | "table";

const STORAGE_KEY = "leads:view-mode";
const VALID = new Set<LeadsViewMode>(["board", "table"]);

export function isLeadsViewMode(value: unknown): value is LeadsViewMode {
  return typeof value === "string" && VALID.has(value as LeadsViewMode);
}

export function readLeadsViewMode(): LeadsViewMode {
  if (typeof localStorage === "undefined") return "board";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isLeadsViewMode(raw) ? raw : "board";
  } catch {
    return "board";
  }
}

export function writeLeadsViewMode(mode: LeadsViewMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable (private mode / quota) — ignore.
  }
}

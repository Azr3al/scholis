import { normalizeHeader } from "@/lib/imports/wizard-logic";

export const REMEMBERED_IMPORTS_KEY = "import-wizard:remembered-imports";
export const REMEMBERED_IMPORTS_MAX = 20;

export type RememberedImport = {
  signature: string;
  role: string;
  mapping: Record<number, string | null>;
  fieldDefaults: Record<string, string>;
  matchConfig?: Record<string, { match: boolean; fuzzy: boolean }>;
  matchPriority?: string[];
  updatedAt: number;
};

function canUseLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function computeHeaderSignature(headers: readonly string[]): string {
  return headers.map((h) => normalizeHeader(h)).join("\x1f");
}

export function loadRememberedImports(): RememberedImport[] {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(REMEMBERED_IMPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RememberedImport[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function findRememberedImport(
  headers: readonly string[],
): RememberedImport | null {
  const signature = computeHeaderSignature(headers);
  return loadRememberedImports().find((entry) => entry.signature === signature) ?? null;
}

export function saveRememberedImport(entry: Omit<RememberedImport, "updatedAt">): void {
  if (!canUseLocalStorage()) return;
  try {
    const now = Date.now();
    const next: RememberedImport = { ...entry, updatedAt: now };
    const existing = loadRememberedImports().filter(
      (item) => item.signature !== entry.signature,
    );
    const merged = [next, ...existing].slice(0, REMEMBERED_IMPORTS_MAX);
    localStorage.setItem(REMEMBERED_IMPORTS_KEY, JSON.stringify(merged));
  } catch {
    // ignore quota / parse errors
  }
}

/** Clears saved default values for a header layout; mapping and role are kept. */
export function clearRememberedImportFieldDefaults(headers: readonly string[]): void {
  if (!canUseLocalStorage()) return;
  const signature = computeHeaderSignature(headers);
  const entry = loadRememberedImports().find((item) => item.signature === signature);
  if (!entry) return;
  saveRememberedImport({
    signature: entry.signature,
    role: entry.role,
    mapping: entry.mapping,
    fieldDefaults: {},
    matchConfig: entry.matchConfig,
    matchPriority: entry.matchPriority,
  });
}

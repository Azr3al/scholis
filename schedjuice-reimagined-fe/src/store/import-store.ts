import { create } from "zustand";

import type { ParseResult } from "@/app/client-api/imports";
import type { CellResolution, DuplicateEmailStrategy } from "@/lib/imports/resolution";
import { type CourseScope, EMPTY_COURSE_SCOPE } from "@/lib/imports/course-scope";

type WizardStep = "upload" | "map" | "review";

type MatchColumnConfig = { match: boolean; fuzzy: boolean };

export interface ImportState {
  step: WizardStep;
  entity: "users";
  role: string;
  lastFile: File | null;
  parse: ParseResult | null;
  rowIds: string[];
  mapping: Record<number, string | null>;
  fieldDefaults: Record<string, string>;
  rememberedImportApplied: boolean;
  resolution: Map<string, CellResolution>;
  sendWelcomeEmails: boolean;
  courseScope: CourseScope;
  duplicateEmailStrategy: DuplicateEmailStrategy;
  matchConfig: Record<string, MatchColumnConfig>;
  matchPriority: string[];
  setStep: (step: WizardStep) => void;
  setRole: (role: string) => void;
  setLastFile: (file: File | null) => void;
  setParse: (parse: ParseResult) => void;
  setMapping: (mapping: Record<number, string | null>) => void;
  setColumnMapping: (colIndex: number, field: string | null) => void;
  setFieldDefault: (fieldKey: string, value: string) => void;
  setFieldDefaults: (values: Record<string, string>) => void;
  clearFieldDefaults: () => void;
  setRememberedImportApplied: (value: boolean) => void;
  mergeResolutions: (entries: Map<string, CellResolution>) => void;
  setCellResolution: (key: string, value: CellResolution) => void;
  setSendWelcomeEmails: (value: boolean) => void;
  setDuplicateEmailStrategy: (strategy: DuplicateEmailStrategy) => void;
  setMatchColumn: (fieldKey: string, patch: Partial<MatchColumnConfig>) => void;
  setMatchPriority: (order: string[]) => void;
  setCourseScope: (scope: CourseScope) => void;
  setRowCellValue: (rowIndex: number, sourceColIndex: number, value: string) => void;
  appendParsedRows: (
    rows: (string | number | null)[][],
  ) => { startIndex: number; rowIds: string[] };
  appendBlankRowsAtEnd: (count: number) => number[];
  removeParsedRows: (sourceIndices: number[]) => void;
  reset: () => void;
}

function makeRowIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `row-${i}`);
}

function allocateRowIds(count: number, existing: string[]): string[] {
  const used = new Set(existing);
  const out: string[] = [];
  for (let n = 0; out.length < count; n++) {
    const id = `row-${n}`;
    if (!used.has(id)) out.push(id);
  }
  return out;
}

const useImportStore = create<ImportState>((set, get) => ({
  step: "upload",
  entity: "users",
  role: "student",
  lastFile: null,
  parse: null,
  rowIds: [],
  mapping: {},
  fieldDefaults: {},
  rememberedImportApplied: false,
  resolution: new Map(),
  sendWelcomeEmails: false,
  courseScope: EMPTY_COURSE_SCOPE,
  duplicateEmailStrategy: "keep_first",
  matchConfig: { email: { match: true, fuzzy: false } },
  matchPriority: ["email", "communication_email", "phone_number"],
  setStep: (step) => set({ step }),
  setRole: (role) => set({ role }),
  setLastFile: (file) => set({ lastFile: file }),
  setParse: (parse) =>
    set({ parse, rowIds: makeRowIds(parse.rows.length), resolution: new Map() }),
  setMapping: (mapping) => set({ mapping }),
  setColumnMapping: (colIndex, field) =>
    set({ mapping: { ...get().mapping, [colIndex]: field } }),
  setFieldDefault: (fieldKey, value) =>
    set({ fieldDefaults: { ...get().fieldDefaults, [fieldKey]: value } }),
  setFieldDefaults: (values) => set({ fieldDefaults: { ...values } }),
  clearFieldDefaults: () => set({ fieldDefaults: {} }),
  setRememberedImportApplied: (value) => set({ rememberedImportApplied: value }),
  mergeResolutions: (entries) => {
    const next = new Map(get().resolution);
    entries.forEach((v, k) => next.set(k, v));
    set({ resolution: next });
  },
  setCellResolution: (key, value) => {
    const next = new Map(get().resolution);
    next.set(key, value);
    set({ resolution: next });
  },
  setSendWelcomeEmails: (value) => set({ sendWelcomeEmails: value }),
  setDuplicateEmailStrategy: (strategy) => set({ duplicateEmailStrategy: strategy }),
  setMatchColumn: (fieldKey, patch) => {
    const prev = get().matchConfig[fieldKey] ?? { match: false, fuzzy: false };
    set({
      matchConfig: {
        ...get().matchConfig,
        [fieldKey]: { ...prev, ...patch },
      },
    });
  },
  setMatchPriority: (order) => set({ matchPriority: order }),
  setCourseScope: (scope) => set({ courseScope: scope }),
  setRowCellValue: (rowIndex, sourceColIndex, value) => {
    const current = get().parse;
    if (!current) return;
    const rows = current.rows.map((row, i) =>
      i === rowIndex
        ? row.map((cell, j) => (j === sourceColIndex ? value : cell))
        : row,
    );
    set({ parse: { ...current, rows } });
  },
  appendParsedRows: (newRows) => {
    const current = get().parse;
    const existingRowIds = get().rowIds;
    if (!current || newRows.length === 0) {
      return { startIndex: 0, rowIds: [] };
    }
    const newRowIds = allocateRowIds(newRows.length, existingRowIds);
    set({
      parse: {
        ...current,
        rows: [...newRows, ...current.rows],
        rowCount: current.rowCount + newRows.length,
      },
      rowIds: [...newRowIds, ...existingRowIds],
    });
    return { startIndex: 0, rowIds: newRowIds };
  },
  appendBlankRowsAtEnd: (count) => {
    const current = get().parse;
    const existingRowIds = get().rowIds;
    if (!current || count <= 0) return [];
    const width = current.rows[0]?.length ?? current.headers.length;
    const blank = Array.from({ length: count }, () =>
      Array.from({ length: width }, () => "" as string | number | null),
    );
    const newRowIds = allocateRowIds(count, existingRowIds);
    const startIndex = current.rows.length;
    set({
      parse: {
        ...current,
        rows: [...current.rows, ...blank],
        rowCount: current.rowCount + count,
      },
      rowIds: [...existingRowIds, ...newRowIds],
    });
    return Array.from({ length: count }, (_, i) => startIndex + i);
  },
  removeParsedRows: (sourceIndices) => {
    const current = get().parse;
    if (!current || sourceIndices.length === 0) return;

    const toRemove = new Set(sourceIndices);
    const remainingCount = current.rows.length - toRemove.size;
    if (remainingCount < 1) return;

    const existingRowIds = get().rowIds;
    const removedRowIds = new Set(
      sourceIndices.map((i) => existingRowIds[i]).filter(Boolean),
    );

    const rows = current.rows.filter((_, i) => !toRemove.has(i));
    const rowIds = existingRowIds.filter((_, i) => !toRemove.has(i));

    const next = new Map(get().resolution);
    for (const key of Array.from(next.keys())) {
      const rowId = key.split(":")[0];
      if (removedRowIds.has(rowId)) next.delete(key);
    }

    set({
      parse: { ...current, rows, rowCount: rows.length },
      rowIds,
      resolution: next,
    });
  },
  reset: () =>
    set({
      step: "upload",
      role: "student",
      lastFile: null,
      parse: null,
      rowIds: [],
      mapping: {},
      fieldDefaults: {},
      rememberedImportApplied: false,
      resolution: new Map(),
      sendWelcomeEmails: false,
      courseScope: EMPTY_COURSE_SCOPE,
      duplicateEmailStrategy: "keep_first",
      matchConfig: { email: { match: true, fuzzy: false } },
      matchPriority: ["email", "communication_email", "phone_number"],
    }),
}));

export default useImportStore;

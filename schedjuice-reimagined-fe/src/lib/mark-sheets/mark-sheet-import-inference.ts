const MAX_MARKS_RE = /\(\s*(\d+)\s*(?:M|marks?)\s*\)/i;
const GRADE_VALUE_RE = /^[A-F][+-]?$/i;

const IDENTIFIER_ALIASES = new Set([
  "name",
  "full name",
  "student name",
  "english name",
  "alternative name",
  "alt name",
  "email",
  "e mail",
]);

const ATTENDANCE_KEYWORDS = [
  "attendance",
  "present",
  "absent",
  "late",
  "tardy",
  "excused",
  "%",
  "pct",
  "percent",
  "days attended",
  "days absent",
  "sessions",
];

export function normalizeColumnTitle(title: string | null | undefined): string {
  return String(title ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseDecimal(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function isNumericColumn(values: unknown[]): boolean {
  const nonEmpty = values.filter((v) => v != null && String(v).trim() !== "");
  if (nonEmpty.length === 0) return false;
  const numeric = nonEmpty.filter((v) => parseDecimal(v) != null).length;
  return numeric / nonEmpty.length >= 0.5;
}

export function slugKey(title: string, index: number): string {
  const slug = normalizeColumnTitle(title).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return slug || `col_${index}`;
}

export function parseMaxMarksFromHeader(title: string): number | null {
  const match = MAX_MARKS_RE.exec(title || "");
  if (!match) return null;
  return Number.parseInt(match[1]!, 10);
}

export function isGradeValue(value: unknown): boolean {
  const text = value == null ? "" : String(value).trim();
  if (!text) return false;
  return GRADE_VALUE_RE.test(text);
}

export function isAttendanceHeader(normTitle: string): boolean {
  return ATTENDANCE_KEYWORDS.some((keyword) => normTitle.includes(keyword));
}

export function columnIsGradeColumn(header: string, values: unknown[]): boolean {
  const norm = normalizeColumnTitle(header);
  if (norm.includes("grade")) return true;
  const nonEmpty = values.filter((v) => v != null && String(v).trim() !== "");
  if (nonEmpty.length === 0) return false;
  const gradeCount = nonEmpty.filter((v) => isGradeValue(v)).length;
  return gradeCount / nonEmpty.length >= 0.5;
}

export function columnIsBurmeseNameCandidate(values: unknown[]): boolean {
  const nonEmpty = values.filter((v) => v != null && String(v).trim() !== "");
  if (nonEmpty.length === 0) return false;
  let shortNonGrade = 0;
  for (const value of nonEmpty) {
    const text = String(value).trim();
    if (!text || parseDecimal(value) != null) continue;
    if (isGradeValue(value)) continue;
    if (text.length <= 3) shortNonGrade += 1;
  }
  return shortNonGrade / nonEmpty.length >= 0.5;
}

function isSerialNumberHeader(norm: string): boolean {
  return norm.replace(/\.$/, "") === "no" || ["number", "#", "index"].includes(norm);
}

function headerIdentifierField(norm: string): string | null {
  if (isSerialNumberHeader(norm)) {
    return null;
  }
  if (IDENTIFIER_ALIASES.has(norm) || norm.startsWith("no ")) {
    if (norm.includes("email") || norm === "e mail") return "email";
    if (norm.includes("burmese") || norm.includes("alternative") || norm === "alt name") {
      return "alternative_name";
    }
    if (norm.includes("english") && norm.includes("name")) return "name";
    if (["name", "full name", "student name"].includes(norm)) return "name";
    return null;
  }
  if (norm.includes("english") && norm.includes("name")) return "name";
  if (norm.includes("burmese") || norm.includes("alternative") || norm === "alt name") {
    return "alternative_name";
  }
  if (norm.includes("email") || norm === "e mail") return "email";
  return null;
}

function columnValues(rows: (string | number | null)[][], idx: number): unknown[] {
  return rows.map((row) => (idx < row.length ? row[idx] : null));
}

import type { RubricColumn } from "@/types/mark-sheets";

export function inferImportColumns(
  headers: string[],
  rows: (string | number | null)[][],
): { columns: RubricColumn[]; columnMapping: Record<string, number>; warnings: string[] } {
  const columns: RubricColumn[] = [];
  const columnMapping: Record<string, number> = {};
  let burmeseCandidateIdx: number | null = null;

  headers.forEach((header, idx) => {
    const title = String(header ?? "").trim() || `Column ${idx + 1}`;
    const norm = normalizeColumnTitle(title);
    const colValues = columnValues(rows, idx);
    const identifierField = headerIdentifierField(norm);
    let kind: RubricColumn["kind"];

    if (isSerialNumberHeader(norm)) {
      kind = "ignored";
    } else if (identifierField) {
      kind = "identifier";
    } else if (norm.includes("total") && isNumericColumn(colValues)) {
      kind = "computed_total";
    } else if (isAttendanceHeader(norm)) {
      kind = "ignored";
    } else if (columnIsGradeColumn(title, colValues)) {
      kind = "ignored";
    } else if (isNumericColumn(colValues)) {
      kind = "score";
    } else if (columnIsBurmeseNameCandidate(colValues)) {
      kind = "identifier";
      burmeseCandidateIdx = idx;
    } else {
      kind = "ignored";
    }

    const col: RubricColumn = {
      key: slugKey(title, idx),
      title,
      kind,
      sort_order: idx,
    };

    if (kind === "score") {
      const parsedMax = parseMaxMarksFromHeader(title);
      if (parsedMax != null) {
        col.max_marks = parsedMax;
      } else {
        const nums = colValues.map(parseDecimal).filter((v): v is number => v != null);
        if (nums.length > 0 && nums.every((n) => n <= 5)) {
          col.max_marks = 5;
        }
      }
    }

    columns.push(col);

    if (kind === "identifier" && identifierField) {
      columnMapping[identifierField] = idx;
    }
  });

  if (burmeseCandidateIdx != null && columnMapping.alternative_name == null) {
    columnMapping.alternative_name = burmeseCandidateIdx;
  }

  const warnings = validateSectionMaxMarks(columns);
  return { columns, columnMapping, warnings };
}

export function validateSectionMaxMarks(columns: RubricColumn[]): string[] {
  const scoreMaxes = columns
    .filter((c) => c.kind === "score" && c.max_marks != null)
    .map((c) => c.max_marks!);
  if (scoreMaxes.length === 0) return [];

  const sectionSum = scoreMaxes.reduce((a, b) => a + b, 0);
  let grandTotal: number | null = null;
  for (const col of columns) {
    if (col.kind !== "computed_total") continue;
    const parsed = parseMaxMarksFromHeader(col.title);
    if (parsed != null) {
      grandTotal = parsed;
      break;
    }
  }

  if (grandTotal == null || sectionSum === grandTotal) return [];
  return [`Section max marks sum to ${sectionSum} but grand total header says ${grandTotal}.`];
}

export function rubricColumnsForCommit(columns: RubricColumn[]): RubricColumn[] {
  return columns.filter((c) => c.kind === "score");
}

export function inferRubricColumns(
  headers: string[],
  rows: (string | number | null)[][],
): RubricColumn[] {
  return inferImportColumns(headers, rows).columns;
}

export function buildColumnMappingFromHeaders(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  headers.forEach((header, index) => {
    const norm = normalizeColumnTitle(header);
    if (norm.includes("english") && norm.includes("name")) {
      mapping.name = index;
    } else if (norm.includes("burmese") || norm === "alternative name" || norm === "alt name") {
      mapping.alternative_name = index;
    } else if (norm === "name" || norm === "student name" || norm === "full name") {
      mapping.name = index;
    } else if (norm.includes("email")) {
      mapping.email = index;
    }
  });
  return mapping;
}

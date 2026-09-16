import type { ImportFieldDef } from "@/app/client-api/imports";
import { isLegalEmail } from "@/lib/imports/validation";

const AUTO_MAP_THRESHOLD = 50;

const FIELD_ALIASES: Record<string, string[]> = {
  email: ["email", "email address", "e-mail", "e mail"],
  name: ["name", "full name", "student name", "student's name", "students name"],
  communication_email: ["communication email", "comm email", "secondary email"],
  alternative_name: ["alternative name", "alt name", "nickname"],
  gender: ["gender", "sex"],
  date_of_birth: ["date of birth", "dob", "birth date", "birthday"],
  phone_number: [
    "phone number",
    "phone",
    "mobile phone number",
    "mobile phone",
    "mobile",
    "cell phone",
    "contact number",
    "tel",
    "telephone",
  ],
  house_number: ["house number", "house no", "house #", "building number"],
  street: ["street", "street address", "address line 1", "address"],
  township: ["township", "suburb"],
  city: ["city", "town"],
  region: ["region", "state", "province"],
  country: ["country", "nation"],
  facebook_account_link: [
    "facebook account link",
    "facebook link",
    "facebook url",
    "facebook",
  ],
  courses: ["courses", "course", "course name", "course names", "enrolled courses"],
};

const FIELD_KEYWORDS: Record<string, string[]> = {
  email: ["email"],
  name: ["name"],
  communication_email: ["communication"],
  alternative_name: ["alternative"],
  gender: ["gender"],
  date_of_birth: ["dob", "birth"],
  phone_number: ["phone", "mobile", "tel"],
  house_number: ["house"],
  street: ["street"],
  township: ["township"],
  city: ["city"],
  region: ["region", "state"],
  country: ["country"],
  facebook_account_link: ["facebook"],
  courses: ["courses"],
};

export function normalizeHeader(header: string): string {
  return (header || "")
    .trim()
    .toLowerCase()
    .replace(/[?!.,;:]+$/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalized: string): string[] {
  return normalized.split(/\s+/).filter(Boolean);
}

function containsTokenSequence(tokens: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || sequence.length > tokens.length) return false;
  for (let i = 0; i <= tokens.length - sequence.length; i++) {
    let match = true;
    for (let j = 0; j < sequence.length; j++) {
      if (tokens[i + j] !== sequence[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function containsAnyKeyword(tokens: string[], keywords: string[]): boolean {
  const set = new Set(tokens);
  return keywords.some((k) => set.has(k));
}

export function scoreHeaderField(header: string, field: ImportFieldDef): number {
  const fieldKey = field.field_key;
  const norm = normalizeHeader(header);
  if (!norm) return 0;

  const raw = (header || "").trim();
  const hasQuestion = raw.includes("?");
  const tokens = tokenize(norm);
  const wordCount = tokens.length;

  const labelNorm = normalizeHeader(field.field_label);
  const keyNorm = normalizeHeader(fieldKey.replace(/_/g, " "));
  if (norm === labelNorm || norm === keyNorm) return 100;

  const aliases = FIELD_ALIASES[fieldKey] ?? [];
  for (const alias of aliases) {
    if (norm === alias) return 100;
  }

  if (!hasQuestion && wordCount <= 4) {
    for (const alias of aliases) {
      const aliasTokens = tokenize(alias);
      if (aliasTokens.length > 1 && containsTokenSequence(tokens, aliasTokens)) {
        return 70;
      }
    }
    const keywords = FIELD_KEYWORDS[fieldKey] ?? [];
    if (containsAnyKeyword(tokens, keywords)) return 55;

    const labelTokens = tokenize(labelNorm);
    if (labelTokens.length > 1 && containsTokenSequence(tokens, labelTokens)) {
      return 70;
    }
  }

  return 0;
}

export function buildAutoMapping(
  headers: string[],
  fields: ImportFieldDef[],
): Record<number, string | null> {
  const mapping: Record<number, string | null> = {};
  headers.forEach((_, i) => {
    mapping[i] = null;
  });

  const headerBest: { colIndex: number; field: string; score: number }[] = [];

  headers.forEach((header, colIndex) => {
    let bestField: string | null = null;
    let bestScore = 0;
    for (const field of fields) {
      const score = scoreHeaderField(header, field);
      if (score > bestScore) {
        bestScore = score;
        bestField = field.field_key;
      }
    }
    if (bestField && bestScore >= AUTO_MAP_THRESHOLD) {
      headerBest.push({ colIndex, field: bestField, score: bestScore });
    }
  });

  const winnerByField = new Map<string, { colIndex: number; score: number }>();
  for (const entry of headerBest) {
    const prev = winnerByField.get(entry.field);
    if (
      !prev ||
      entry.score > prev.score ||
      (entry.score === prev.score && entry.colIndex < prev.colIndex)
    ) {
      winnerByField.set(entry.field, { colIndex: entry.colIndex, score: entry.score });
    }
  }

  winnerByField.forEach(({ colIndex }, field) => {
    mapping[colIndex] = field;
  });

  return mapping;
}

export function isValidEmail(value: string): boolean {
  return isLegalEmail(value);
}

export function splitCourseTokens(value: string | number | null): string[] {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function collectUniqueEmails(
  rows: (string | number | null)[][],
  colIndex: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const raw = row[colIndex];
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!value || !isValidEmail(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function collectUniqueCourseTokens(
  rows: (string | number | null)[][],
  colIndex: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const token of splitCourseTokens(row[colIndex])) {
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

export function getUnmappedRequiredFields(
  fields: ImportFieldDef[],
  mapping: Record<number, string | null>,
  fieldDefaults: Record<string, string>,
): ImportFieldDef[] {
  const mappedKeys = new Set(
    Object.values(mapping).filter(Boolean) as string[],
  );
  return fields.filter(
    (f) =>
      f.required_for_role &&
      !mappedKeys.has(f.field_key) &&
      !(f.field_key in fieldDefaults),
  );
}

export function emailMappedColumn(mapping: Record<number, string | null>): number | null {
  for (const [idx, field] of Object.entries(mapping)) {
    if (field === "email") return Number(idx);
  }
  return null;
}

export function coursesMappedColumn(mapping: Record<number, string | null>): number | null {
  for (const [idx, field] of Object.entries(mapping)) {
    if (field === "courses") return Number(idx);
  }
  return null;
}

export function nameMappedColumn(mapping: Record<number, string | null>): number | null {
  for (const [idx, field] of Object.entries(mapping)) {
    if (field === "name") return Number(idx);
  }
  return null;
}

type MatchType = "email" | "phone";

const MATCHABLE_FIELDS: Record<string, MatchType> = {
  email: "email",
  communication_email: "email",
  phone_number: "phone",
  emergency_contact_phone_number: "phone",
};

export type MatchableColumn = {
  fieldKey: string;
  colIndex: number;
  type: MatchType;
};

export function matchableMappedColumns(
  mapping: Record<number, string | null>,
): MatchableColumn[] {
  const out: MatchableColumn[] = [];
  for (const [idx, field] of Object.entries(mapping)) {
    if (field && field in MATCHABLE_FIELDS) {
      out.push({
        fieldKey: field,
        colIndex: Number(idx),
        type: MATCHABLE_FIELDS[field],
      });
    }
  }
  return out.sort((a, b) => a.colIndex - b.colIndex);
}

export function collectUniqueColumnValues(
  rows: (string | number | null)[][],
  colIndex: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const raw = row[colIndex];
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function importFieldLabel(
  fields: ImportFieldDef[],
  fieldKey: string,
): string {
  return fields.find((f) => f.field_key === fieldKey)?.field_label ?? fieldKey;
}

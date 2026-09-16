export const INLINE_VARIABLE_KEYS = new Set([
  "school_name",
  "student_name",
  "registration",
  "course_name",
  "period",
  "academic_year",
  "current_date",
  "mt_name",
  "pronoun",
]);

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function extractTokens(text: string): string[] {
  const keys: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text))) {
    const key = match[1].trim();
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function unknownTokens(text: string): string[] {
  return extractTokens(text).filter((key) => !INLINE_VARIABLE_KEYS.has(key));
}

function collectTextFields(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTextFields(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const rec = value as Record<string, unknown>;
  if (typeof rec.text === "string") out.push(rec.text);
  if (Array.isArray(rec.blocks)) collectTextFields(rec.blocks, out);
  if (Array.isArray(rec.columns)) collectTextFields(rec.columns, out);
}

export function unknownTokensInDocument(document: unknown): string[] {
  const texts: string[] = [];
  collectTextFields(document, texts);
  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const text of texts) {
    for (const key of unknownTokens(text)) {
      if (seen.has(key)) continue;
      seen.add(key);
      unknown.push(key);
    }
  }
  return unknown;
}

export type TokenRun =
  | { kind: "text"; text: string }
  | { kind: "token"; key: string; raw: string };

export function splitTokenRuns(source: string): TokenRun[] {
  const runs: TokenRun[] = [];
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (match.index > last) {
      runs.push({ kind: "text", text: source.slice(last, match.index) });
    }
    runs.push({ kind: "token", key: match[1].trim(), raw: match[0] });
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    runs.push({ kind: "text", text: source.slice(last) });
  }
  return runs;
}

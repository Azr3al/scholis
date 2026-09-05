import { pronounForGender } from "./pronoun";
import type { AwardPreviewBinder } from "./preview-binder";
import type { Layer } from "./types";

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export const TEXT_VARIABLE_OPTIONS = [
  { key: "student_name", label: "Student name" },
  { key: "award_title", label: "Award title" },
  { key: "period", label: "Period" },
  { key: "course_name", label: "Course name" },
  { key: "pronoun", label: "Pronoun" },
  { key: "current_date", label: "Current date" },
  { key: "mt_name", label: "MT name" },
  { key: "named_person", label: "Named person" },
] as const;

const TEXT_VARIABLE_KEYS = new Set<string>(TEXT_VARIABLE_OPTIONS.map((item) => item.key));

export function isTextVariableKey(key: string): boolean {
  return TEXT_VARIABLE_KEYS.has(key);
}

export function formatToken(key: string): string {
  return `{{${key}}}`;
}

export type TemplateRun =
  | { kind: "text"; text: string }
  | { kind: "token"; key: string; raw: string };

export type TemplatePiece =
  | { kind: "text"; text: string }
  | { kind: "token"; key: string; raw: string };

export function layerCopy(layer: Layer): string {
  if (layer.type === "text") return layer.text;
  if (layer.type === "field" || layer.type === "named_person") {
    return variableTemplate(layer);
  }
  return "";
}

export function defaultVariableTemplate(layer: Layer): string | null {
  if (layer.type === "field") return `{{${layer.field}}}`;
  if (layer.type === "named_person") return "{{named_person}}";
  return null;
}

export function variableTemplate(layer: Layer): string {
  if (
    (layer.type === "field" || layer.type === "named_person") &&
    typeof layer.template === "string"
  ) {
    return layer.template;
  }
  return defaultVariableTemplate(layer) ?? "";
}

export function normalizeTemplateKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

export function tokensFromBinder(
  binder: AwardPreviewBinder,
  namedPersonName?: string,
): Record<string, string> {
  return {
    student_name: binder.studentName,
    award_title: binder.awardTitle,
    period: binder.period,
    course_name: binder.courseName,
    pronoun: pronounForGender(binder.gender),
    current_date: binder.currentDate,
    mt_name: binder.mtName,
    named_person: namedPersonName ?? "",
  };
}

export function interpolateVariableTemplate(
  template: string,
  tokens: Record<string, string>,
): string {
  return template.replace(TOKEN_RE, (match, raw: string) => {
    const key = normalizeTemplateKey(raw);
    if (!(key in tokens)) return match;
    return tokens[key] ?? match;
  });
}

export function splitTemplateRuns(source: string): TemplateRun[] {
  const runs: TemplateRun[] = [];
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (match.index > last) {
      runs.push({ kind: "text", text: source.slice(last, match.index) });
    }
    const raw = match[1] ?? "";
    runs.push({ kind: "token", key: normalizeTemplateKey(raw), raw: match[0] });
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    runs.push({ kind: "text", text: source.slice(last) });
  }
  return runs.length > 0 ? runs : [{ kind: "text", text: source }];
}

export function splitTemplatePieces(source: string): TemplatePiece[] {
  const pieces: TemplatePiece[] = [];
  for (const run of splitTemplateRuns(source)) {
    if (run.kind === "token") {
      pieces.push(run);
      continue;
    }
    pieces.push({ kind: "text", text: run.text });
  }
  return pieces;
}

export function joinTemplatePieces(pieces: TemplatePiece[]): string {
  return pieces
    .map((piece) => (piece.kind === "token" ? piece.raw : piece.text))
    .join("");
}

export function moveTemplatePiece(
  source: string,
  fromIndex: number,
  toIndex: number,
): string {
  const pieces = splitTemplatePieces(source);
  if (
    fromIndex < 0 ||
    fromIndex >= pieces.length ||
    toIndex < 0 ||
    toIndex > pieces.length ||
    fromIndex === toIndex ||
    fromIndex + 1 === toIndex
  ) {
    return source;
  }
  const next = [...pieces];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return source;
  const dest = fromIndex < toIndex ? toIndex - 1 : toIndex;
  next.splice(dest, 0, moved);
  return joinTemplatePieces(next);
}

export function insertVariableAt(
  source: string,
  caret: number,
  key: string,
): { text: string; caret: number } {
  const token = formatToken(key);
  const start = Math.max(0, Math.min(caret, source.length));
  const text = `${source.slice(0, start)}${token}${source.slice(start)}`;
  return { text, caret: start + token.length };
}

export function braceSuggestQuery(
  source: string,
  caret: number,
): { start: number; query: string } | null {
  if (caret < 0 || caret > source.length) return null;
  const before = source.slice(0, caret);
  const match = before.match(/\{(\{?)([a-z0-9_ ]*)$/i);
  if (!match || match.index === undefined) return null;
  return { start: match.index, query: (match[2] ?? "").trim() };
}

export function applyBraceSuggestion(
  source: string,
  caret: number,
  key: string,
): { text: string; caret: number } {
  const active = braceSuggestQuery(source, caret);
  if (!active) return insertVariableAt(source, caret, key);
  const token = formatToken(key);
  const text = `${source.slice(0, active.start)}${token}${source.slice(caret)}`;
  return { text, caret: active.start + token.length };
}

export function appendVariableToken(source: string, key: string): string {
  const spacer = source && !/\s$/.test(source) ? " " : "";
  return `${source}${spacer}${formatToken(key)}`;
}

export function filterVariableOptions(query: string) {
  const needle = query.trim().toLowerCase().replace(/\s+/g, "_");
  if (!needle) return [...TEXT_VARIABLE_OPTIONS];
  return TEXT_VARIABLE_OPTIONS.filter(
    (item) =>
      item.key.includes(needle) || item.label.toLowerCase().includes(needle),
  );
}

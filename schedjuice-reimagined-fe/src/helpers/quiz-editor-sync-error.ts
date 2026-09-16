/**
 * Schedjuice quiz editor-sync POST error bodies (`isError`, `message`, `details`,
 * optional top-level `index` for the failing question row).
 */

export type EditorSyncValidationError =
  | {
      kind: "question";
      questionIndex: number;
      details: Record<string, unknown>;
    }
  | {
      kind: "quiz";
      details: Record<string, unknown>;
    }
  | {
      kind: "generic";
      summary: string;
    };

type ApiErrBody = {
  details?: unknown;
  index?: unknown;
  message?: unknown;
};

export function parseEditorSyncValidationError(
  err: unknown,
): EditorSyncValidationError | null {
  const ax = err as { response?: { status?: number; data?: ApiErrBody } };
  if (ax?.response?.status !== 400) return null;
  const data = ax.response.data;
  if (!data) {
    return { kind: "generic", summary: "Could not save. Try again." };
  }
  const details = data.details;
  const idx = data.index;

  if (
    typeof idx === "number" &&
    Number.isFinite(idx) &&
    details !== null &&
    typeof details === "object" &&
    !Array.isArray(details)
  ) {
    return {
      kind: "question",
      questionIndex: idx,
      details: details as Record<string, unknown>,
    };
  }

  if (
    details !== null &&
    typeof details === "object" &&
    !Array.isArray(details)
  ) {
    return { kind: "quiz", details: details as Record<string, unknown> };
  }

  if (typeof details === "string" && details.trim()) {
    return { kind: "generic", summary: details.trim() };
  }

  const msg = typeof data.message === "string" ? data.message.trim() : "";
  if (msg && msg !== "bad_request") {
    return { kind: "generic", summary: msg };
  }

  return { kind: "generic", summary: "Could not save. Try again." };
}

export function flattenDrfMessages(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    const t = value.trim();
    return t ? [t] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenDrfMessages);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(
      flattenDrfMessages,
    );
  }
  return [];
}

export function optionIndexToMessages(
  details: Record<string, unknown>,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const raw = details.options;
  if (!Array.isArray(raw)) return out;
  raw.forEach((item, i) => {
    const msgs = flattenDrfMessages(item);
    if (msgs.length) out.set(i, msgs);
  });
  return out;
}

export function slotIndexToMessages(
  details: Record<string, unknown>,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const raw = details.fill_blank_slots;
  if (!Array.isArray(raw)) return out;
  raw.forEach((item, i) => {
    const msgs = flattenDrfMessages(item);
    if (msgs.length) out.set(i, msgs);
  });
  return out;
}

export function fillBlankSlotErrors(details: Record<string, unknown>): {
  global: string[];
  bySlot: Map<number, string[]>;
} {
  const raw = details.fill_blank_slots;
  const bySlot = Array.isArray(raw)
    ? slotIndexToMessages(details)
    : new Map<number, string[]>();
  const global = Array.isArray(raw) ? [] : flattenDrfMessages(raw);
  return { global, bySlot };
}

export function shortAnswerRowMessages(
  details: Record<string, unknown>,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const raw = details.short_answer_acceptables;
  if (!Array.isArray(raw)) return out;
  raw.forEach((item, i) => {
    const msgs = flattenDrfMessages(item);
    if (msgs.length) out.set(i, msgs);
  });
  return out;
}

const QUIZ_FIELD_LABELS: Record<string, string> = {
  title: "Title",
  status: "Status",
  intro_body: "Introduction",
  outro_body: "Closing message",
  quiz_theme: "Theme",
  category: "Category",
  course: "Course",
  activation_date: "Start date",
  expiry_date: "End date",
  allowed_minutes: "Time limit",
  max_retakes: "Max attempts",
  can_show_answers_afterwards: "Show answers after submit",
  can_navigate_questions: "Question navigation",
};

export const QUESTION_DETAIL_KEYS_HANDLED_INLINE = new Set([
  "body",
  "points",
  "options",
  "fill_blank_slots",
  "short_answer_acceptables",
  "correct_true",
  "non_field_errors",
]);

export function quizFieldLabel(key: string): string {
  return QUIZ_FIELD_LABELS[key] ?? prettifyKey(key);
}

export function questionFieldLabel(key: string): string {
  const map: Record<string, string> = {
    body: "Prompt",
    points: "Points",
    options: "Choices",
    fill_blank_slots: "Blanks",
    short_answer_acceptables: "Acceptable answers",
    correct_true: "Correct answer",
    question_type: "Question type",
  };
  return map[key] ?? prettifyKey(key);
}

function prettifyKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Bulleted lines for a quiz-wide banner. */
export function formatKeyedErrorsForBanner(
  details: Record<string, unknown>,
  labelForKey: (key: string) => string,
): string[] {
  const lines: string[] = [];
  const nf = details.non_field_errors;
  if (nf !== undefined) {
    lines.push(...flattenDrfMessages(nf));
  }
  for (const [key, val] of Object.entries(details)) {
    if (key === "non_field_errors") continue;
    const msgs = flattenDrfMessages(val);
    if (!msgs.length) continue;
    lines.push(`${labelForKey(key)}: ${msgs.join(" ")}`);
  }
  return lines;
}

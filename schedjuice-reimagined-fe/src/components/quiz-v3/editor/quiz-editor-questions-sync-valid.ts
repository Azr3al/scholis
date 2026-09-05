/**
 * Client-side mirror of `QuestionSerializer.validate` + nested fill-blank / option rules
 * (`app_quiz_v3/serializers.py`) for gating questions-only editor-sync autosave.
 * Canonical validation remains on the server; manual Save is unchanged.
 *
 * @see app_quiz_v3.serializers.QuestionSerializer.validate
 * @see app_quiz_v3.serializers._normalize_fill_blank_slot_typed_vs_choice
 * @see app_quiz_v3.rich_content.tiptap_doc_plaintext
 * @see app_quiz_v3.serializers._normalize_option_body
 */

import { listQuizFillBlankIdsInOrder } from "@/helpers/quizFillBlankDoc";

const FILL_BLANK_TYPED = "typed";
const FILL_BLANK_SINGLE_CHOICE = "single_choice";

const QT_SINGLE = "SINGLE_CHOICE";
const QT_MULTI = "MULTIPLE_CHOICE";
const QT_FIB = "FILL_IN_BLANK";
const QT_TF = "TRUE_FALSE";
const QT_SHORT = "SHORT_ANSWER";
const QT_ESSAY = "ESSAY";

/** Port of `_normalize_option_body` — coerce payload to TipTap JSON before plaintext. */
export function normalizeOptionBody(body: unknown): Record<string, unknown> {
  if (body == null) {
    return { type: "doc", content: [] };
  }
  if (typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  if (typeof body === "string") {
    const t = body.trim();
    if (t.startsWith("{")) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* fall through to paragraph wrap */
      }
    }
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: body }],
        },
      ],
    };
  }
  return { type: "doc", content: [] };
}

/** Port of `tiptap_doc_plaintext` — recursive `text` nodes, then trim. */
export function tiptapDocPlaintext(doc: unknown): string {
  const parts: string[] = [];

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text" && typeof n.text === "string") {
      parts.push(n.text);
    }
    for (const c of n.content ?? []) {
      walk(c);
    }
  };

  walk(doc);
  return parts.join("").trim();
}

function asRecordArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<
    string,
    unknown
  >[];
}

function nonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

function isoToMs(v: unknown): number | null {
  if (v == null || typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function intPts(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * Port of `_normalize_fill_blank_slot_typed_vs_choice`; mutates `slot`.
 * Returns false if the slot would fail serializer normalization.
 */
function normalizeFillBlankSlotTypedVsChoice(slot: Record<string, unknown>): boolean {
  const aa = asRecordArray(slot["acceptable_answers"]);
  const co = asRecordArray(slot["choice_options"]);
  const tTouch = slot["typed_updated_at"];
  const scTouch = slot["single_choice_updated_at"];
  const hasTyped = aa.length > 0;
  const hasChoice = co.length > 0;

  if (hasTyped && hasChoice) {
    if (tTouch == null || scTouch == null) return false;
    const tMs = isoToMs(tTouch);
    const scMs = isoToMs(scTouch);
    if (tMs == null || scMs == null) return false;
    if (tMs > scMs) {
      slot["answer_mode"] = FILL_BLANK_TYPED;
      slot["choice_options"] = [];
      slot["_typed_touch"] = tTouch;
      slot["_choice_touch"] = null;
    } else if (scMs > tMs) {
      slot["answer_mode"] = FILL_BLANK_SINGLE_CHOICE;
      slot["acceptable_answers"] = [];
      slot["_choice_touch"] = scTouch;
      slot["_typed_touch"] = null;
    } else {
      const am = slot["answer_mode"];
      if (am === FILL_BLANK_SINGLE_CHOICE) {
        slot["answer_mode"] = FILL_BLANK_SINGLE_CHOICE;
        slot["acceptable_answers"] = [];
        slot["_choice_touch"] = scTouch;
        slot["_typed_touch"] = null;
      } else if (am === FILL_BLANK_TYPED) {
        slot["answer_mode"] = FILL_BLANK_TYPED;
        slot["choice_options"] = [];
        slot["_typed_touch"] = tTouch;
        slot["_choice_touch"] = null;
      } else {
        return false;
      }
    }
  } else if (hasTyped) {
    slot["answer_mode"] = FILL_BLANK_TYPED;
    slot["choice_options"] = [];
    slot["_typed_touch"] = tTouch ?? new Date().toISOString();
    slot["_choice_touch"] = null;
  } else if (hasChoice) {
    slot["answer_mode"] = FILL_BLANK_SINGLE_CHOICE;
    slot["acceptable_answers"] = [];
    slot["_choice_touch"] = scTouch ?? new Date().toISOString();
    slot["_typed_touch"] = null;
  } else {
    return false;
  }
  return true;
}

/** DRF-shaped details for one question row (used by QuestionEditor inline errors). */
export type EditorSyncQuestionValidationIssue = {
  questionIndex: number;
  details: Record<string, unknown>;
};

function validateFillInBlankPayloadDetails(
  q: Record<string, unknown>,
): Record<string, unknown> | null {
  const docUuids = listQuizFillBlankIdsInOrder(q["body"] ?? {});
  if (docUuids.length < 1) {
    return { body: ["Add at least one blank in the prompt."] };
  }
  if (new Set(docUuids).size !== docUuids.length) {
    return { body: ["Each blank must be unique."] };
  }

  const slotsRaw = q["fill_blank_slots"];
  if (!Array.isArray(slotsRaw) || slotsRaw.length < 1) {
    return { fill_blank_slots: ["Add at least one blank."] };
  }

  const slots = slotsRaw.map((s) =>
    s && typeof s === "object" && !Array.isArray(s)
      ? { ...(s as Record<string, unknown>) }
      : {},
  );

  for (let i = 0; i < slots.length; i++) {
    if (!normalizeFillBlankSlotTypedVsChoice(slots[i]!)) {
      return {
        fill_blank_slots: slots.map((_, j) =>
          j === i
            ? {
                non_field_errors: [
                  "Fix typed vs choice settings for this blank.",
                ],
              }
            : {},
        ),
      };
    }
  }

  const slotUuidSet = new Set(slots.map((s) => String(s["blank_uuid"] ?? "")));
  const docSet = new Set(docUuids);
  if (slotUuidSet.size !== docSet.size) {
    return {
      non_field_errors: ["Blanks in the prompt must match the blanks below."],
    };
  }
  for (const u of docUuids) {
    if (!slotUuidSet.has(u)) {
      return {
        non_field_errors: ["Blanks in the prompt must match the blanks below."],
      };
    }
  }

  const pts = intPts(q["points"]);
  const total = slots.reduce((sum, s) => sum + intPts(s["points"]), 0);
  if (total !== pts) {
    return { points: ["Blank points must add up to the total points."] };
  }

  const slotDetailErrors: Record<string, unknown>[] = slots.map((s) => {
    const mode = s["answer_mode"];
    if (mode === FILL_BLANK_TYPED) {
      const answers = asRecordArray(s["acceptable_answers"]);
      const rowMsgs: Record<string, unknown>[] = [];
      for (let j = 0; j < answers.length; j++) {
        const ans = answers[j]!;
        const plain = tiptapDocPlaintext(normalizeOptionBody(ans["body"]));
        if (!plain) {
          rowMsgs[j] = { body: ["Enter accepted text for this answer."] };
        }
      }
      if (rowMsgs.some(Boolean)) {
        return { acceptable_answers: rowMsgs };
      }
      return {};
    }
    if (mode === FILL_BLANK_SINGLE_CHOICE) {
      const opts = asRecordArray(s["choice_options"]);
      if (opts.length < 1) {
        return {
          non_field_errors: ["Add at least one choice for this blank."],
        };
      }
      let correctN = 0;
      for (const o of opts) {
        if (o["is_correct"]) correctN++;
      }
      if (correctN !== 1) {
        return {
          non_field_errors: ["Select exactly one correct choice for this blank."],
        };
      }
      const choiceMsgs: Record<string, unknown>[] = [];
      for (let j = 0; j < opts.length; j++) {
        const txt = String(opts[j]!["text"] ?? "").trim();
        if (!txt) {
          choiceMsgs[j] = { text: ["Enter text for every choice."] };
        }
      }
      if (choiceMsgs.some(Boolean)) {
        return { choice_options: choiceMsgs };
      }
      return {};
    }
    return { non_field_errors: ["Each blank needs a valid answer mode."] };
  });

  if (slotDetailErrors.some((e) => Object.keys(e).length > 0)) {
    return { fill_blank_slots: slotDetailErrors };
  }
  return null;
}

function validateFillInBlankPayload(q: Record<string, unknown>): boolean {
  return validateFillInBlankPayloadDetails(q) === null;
}

function validateMcScDetails(
  q: Record<string, unknown>,
  qt: string,
): Record<string, unknown> | null {
  if (nonEmptyArray(q["short_answer_acceptables"])) {
    return { non_field_errors: ["Remove short-answer rows for this question type."] };
  }
  if (nonEmptyArray(q["fill_blank_slots"])) {
    return { non_field_errors: ["Remove fill-in-the-blank data for this question type."] };
  }

  const options = asRecordArray(q["options"]);
  if (options.length < 2) {
    return { non_field_errors: ["Add at least two choices."] };
  }
  const optionMsgs: Record<string, unknown>[] = [];
  for (let i = 0; i < options.length; i++) {
    const plain = tiptapDocPlaintext(normalizeOptionBody(options[i]!["body"]));
    if (!plain) {
      optionMsgs[i] = { body: ["Enter text for every choice."] };
    }
  }
  if (optionMsgs.some(Boolean)) {
    return { options: optionMsgs };
  }
  const correctN = options.filter((o) => o["is_correct"]).length;
  if (qt === QT_SINGLE) {
    if (correctN !== 1) {
      return {
        non_field_errors: ["Select exactly one correct answer."],
      };
    }
  } else if (correctN < 1) {
    return {
      non_field_errors: ["Select at least one correct answer."],
    };
  }
  return null;
}

function validateMcSc(q: Record<string, unknown>, qt: string): boolean {
  return validateMcScDetails(q, qt) === null;
}

function validateTrueFalseDetails(q: Record<string, unknown>): Record<string, unknown> | null {
  if (nonEmptyArray(q["options"])) return { non_field_errors: ["Invalid fields for true/false."] };
  if (nonEmptyArray(q["short_answer_acceptables"])) {
    return { non_field_errors: ["Invalid fields for true/false."] };
  }
  if (nonEmptyArray(q["fill_blank_slots"])) {
    return { non_field_errors: ["Invalid fields for true/false."] };
  }
  if (q["correct_true"] == null) {
    return { correct_true: ["Choose true or false."] };
  }
  return null;
}

function validateTrueFalse(q: Record<string, unknown>): boolean {
  return validateTrueFalseDetails(q) === null;
}

function validateShortAnswerDetails(q: Record<string, unknown>): Record<string, unknown> | null {
  if (nonEmptyArray(q["options"])) return { non_field_errors: ["Invalid fields for short answer."] };
  if (nonEmptyArray(q["fill_blank_slots"])) {
    return { non_field_errors: ["Invalid fields for short answer."] };
  }
  const rows = asRecordArray(q["short_answer_acceptables"]);
  if (rows.length < 1) {
    return {
      non_field_errors: ["Add at least one acceptable answer."],
    };
  }
  const rowMsgs: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i++) {
    const body = String(rows[i]!["body"] ?? "").trim();
    if (!body) {
      rowMsgs[i] = { body: ["Enter text for every acceptable answer."] };
    }
  }
  if (rowMsgs.some(Boolean)) {
    return { short_answer_acceptables: rowMsgs };
  }
  return null;
}

function validateShortAnswer(q: Record<string, unknown>): boolean {
  return validateShortAnswerDetails(q) === null;
}

function validateEssayDetails(q: Record<string, unknown>): Record<string, unknown> | null {
  if (nonEmptyArray(q["options"])) return { non_field_errors: ["Invalid fields for essay."] };
  if (nonEmptyArray(q["short_answer_acceptables"])) {
    return { non_field_errors: ["Invalid fields for essay."] };
  }
  if (nonEmptyArray(q["fill_blank_slots"])) {
    return { non_field_errors: ["Invalid fields for essay."] };
  }
  let pts = q["points"];
  if (pts == null) pts = 1;
  if (intPts(pts) < 1) {
    return { points: ["Points must be at least 1."] };
  }
  return null;
}

function validateEssay(q: Record<string, unknown>): boolean {
  return validateEssayDetails(q) === null;
}

function validateOneQuestionPayloadDetails(
  q: Record<string, unknown>,
): Record<string, unknown> | null {
  const qt = q["question_type"];
  if (typeof qt !== "string") {
    return { non_field_errors: ["Invalid question type."] };
  }

  if (qt === QT_FIB) {
    if (nonEmptyArray(q["options"])) {
      return { non_field_errors: ["Remove choices for fill-in-the-blank."] };
    }
    if (nonEmptyArray(q["short_answer_acceptables"])) {
      return { non_field_errors: ["Remove short-answer rows for fill-in-the-blank."] };
    }
    return validateFillInBlankPayloadDetails(q);
  }

  if (qt === QT_TF) return validateTrueFalseDetails(q);
  if (qt === QT_SHORT) return validateShortAnswerDetails(q);
  if (qt === QT_ESSAY) return validateEssayDetails(q);
  if (qt === QT_SINGLE || qt === QT_MULTI) return validateMcScDetails(q, qt);

  return { non_field_errors: ["Unsupported question type."] };
}

/** True if every payload passes the same structural checks as `QuestionSerializer.validate`. */
export function areEditorSyncQuestionsValid(
  payloads: Record<string, unknown>[],
): boolean {
  return validateEditorSyncQuestions(payloads).length === 0;
}

/**
 * Per-question DRF-shaped details for client-side validation (inline errors in the editor).
 * Empty array means all questions pass.
 */
export function validateEditorSyncQuestions(
  payloads: Record<string, unknown>[],
): EditorSyncQuestionValidationIssue[] {
  const out: EditorSyncQuestionValidationIssue[] = [];
  payloads.forEach((q, i) => {
    const d = validateOneQuestionPayloadDetails(q);
    if (d) out.push({ questionIndex: i, details: d });
  });
  return out;
}

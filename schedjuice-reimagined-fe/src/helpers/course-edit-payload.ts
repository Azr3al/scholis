const EXAM_KEYS = ["exam_board", "exam_session_date"] as const;

/** A nullish exam key means "untouched", not "clear it" — the form has no clear affordance. */
export function stripUntouchedExamFields<T extends Record<string, unknown>>(
  payload: T,
): T {
  const out = { ...payload };
  for (const key of EXAM_KEYS) {
    if (key in out && out[key] == null) delete out[key];
  }
  return out;
}

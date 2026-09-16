export const QUIZ_V3_EDIT_SECTION_QUERY = "section";

const quizV3EditSections = ["settings", "questions", "appearance"] as const;
export type QuizV3EditSection = (typeof quizV3EditSections)[number];

export function parseQuizV3EditSection(
  raw: string | null | undefined,
): QuizV3EditSection {
  if (raw === "settings") return "settings";
  if (raw === "appearance") return "appearance";
  return "questions";
}

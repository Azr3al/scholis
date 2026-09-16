import { QuizThemeV3 } from "@/types/quiz-v3";

export function parseQuizThemeV3(raw: string | undefined | null): QuizThemeV3 {
  const v = Object.values(QuizThemeV3).find((x) => x === raw);
  return v ?? QuizThemeV3.Slate;
}

export const QUIZ_V3_THEME_OPTIONS: {
  value: QuizThemeV3;
  label: string;
  description: string;
}[] = [
  {
    value: QuizThemeV3.Slate,
    label: "Slate",
    description: "Neutral blue-gray",
  },
  {
    value: QuizThemeV3.Forest,
    label: "Forest",
    description: "Deep green",
  },
  {
    value: QuizThemeV3.Ocean,
    label: "Ocean",
    description: "Teal and sea tones",
  },
  {
    value: QuizThemeV3.Plum,
    label: "Plum",
    description: "Muted purple",
  },
  {
    value: QuizThemeV3.Amber,
    label: "Amber",
    description: "Warm sand",
  },
  {
    value: QuizThemeV3.HighContrast,
    label: "High contrast",
    description: "Strong foreground / background",
  },
];

/** Page backdrop for learner take flow (main card stays `bg-background`). */
export function quizV3TakeShellThemeClass(theme: QuizThemeV3): string {
  switch (theme) {
    case QuizThemeV3.Forest:
      return "bg-emerald-950/15 text-foreground";
    case QuizThemeV3.Ocean:
      return "bg-cyan-950/15 text-foreground";
    case QuizThemeV3.Plum:
      return "bg-violet-950/20 text-foreground";
    case QuizThemeV3.Amber:
      return "bg-amber-950/15 text-foreground";
    case QuizThemeV3.HighContrast:
      return "bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50";
    case QuizThemeV3.Slate:
    default:
      return "bg-primary/[0.07] text-foreground";
  }
}

/**
 * Mini gradient strip for the Appearance editor — mirrors each theme’s learner wash + accent.
 */
export function quizV3ThemeEditorSwatchClass(theme: QuizThemeV3): string {
  switch (theme) {
    case QuizThemeV3.Forest:
      return "bg-gradient-to-br from-emerald-950/55 via-emerald-700/35 to-emerald-400/25";
    case QuizThemeV3.Ocean:
      return "bg-gradient-to-br from-cyan-950/50 via-teal-800/35 to-cyan-400/30";
    case QuizThemeV3.Plum:
      return "bg-gradient-to-br from-violet-950/55 via-violet-700/35 to-fuchsia-400/25";
    case QuizThemeV3.Amber:
      return "bg-gradient-to-br from-amber-950/45 via-amber-800/30 to-amber-400/35";
    case QuizThemeV3.HighContrast:
      return "bg-gradient-to-r from-zinc-100 via-zinc-400 to-zinc-900 dark:from-zinc-900 dark:via-zinc-600 dark:to-zinc-100";
    case QuizThemeV3.Slate:
    default:
      return "bg-gradient-to-br from-slate-200/95 via-primary/20 to-sky-300/50 dark:from-slate-800/90 dark:via-primary/25 dark:to-sky-900/40";
  }
}

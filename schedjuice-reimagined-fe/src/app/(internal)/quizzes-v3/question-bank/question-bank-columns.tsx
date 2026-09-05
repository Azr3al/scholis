import { column, type Column } from "@/components/data-table";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/sdk";
import { NavArrowRight } from "iconoir-react";
import Link from "next/link";

export const questionBankColumns: Column<QuizQuestion>[] = [
  column.text<QuizQuestion>({
    id: "question_type",
    header: "Type",
    accessor: (row) => {
      if (row.question_type === "SINGLE_CHOICE") return "Single choice";
      if (row.question_type === "MULTIPLE_CHOICE") return "Multiple choice";
      return row.question_type ?? null;
    },
  }),
  column.text<QuizQuestion>({
    id: "body_plaintext",
    header: "Question",
    accessor: (row) => {
      const s = row.body_plaintext?.trim();
      if (!s) return null;
      return s.length > 200 ? `${s.slice(0, 200)}…` : s;
    },
  }),
  column.text<QuizQuestion>({
    id: "quiz",
    header: "Quiz",
    accessor: (row) => row.quiz?.title,
  }),
  column.text<QuizQuestion>({
    id: "points",
    header: "Points",
    accessor: (row) => (row.points != null ? String(row.points) : null),
  }),
  column.date<QuizQuestion>({
    id: "created_at",
    header: "Created At",
    accessor: (row) => row.created_at,
  }),
  {
    id: "open_quiz",
    header: "",
    accessor: () => null,
    enableSorting: false,
    cell: ({ row }) => {
      const quizId = row.quiz?.id;
      if (quizId == null) return null;
      return (
        <Link
          href={`/quizzes-v3/${quizId}/edit`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm"  }),
            "inline-flex",
          )}
          aria-label="Open quiz editor"
        >
          <NavArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      );
    },
  },
];

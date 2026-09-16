"use client";

import { searchEntities } from "@/app/client-api/utils";
import { queryParamDefault } from "@/config/defaults";
import {
  isQuizAttemptInProgress,
  quizAttemptEarnedScoreDisplay,
} from "@/helpers/quiz-attempt-score";
import { useQuery } from "@tanstack/react-query";

type Props = {
  quizId: number;
};

export function QuizStats({ quizId }: Props) {
  const q = useQuery({
    queryKey: ["quiz-v3-stats", quizId],
    queryFn: () =>
      searchEntities(
        `quizzes/${quizId}/attempts`,
        {
          ...queryParamDefault,
          page: 1,
          size: 500,
          expand: ["answers"],
        },
        { filter_params: [], exclude_params: [] },
      ),
  });
  const rows = (q.data?.data?.data ?? []) as {
    submitted_at?: string | null;
    score?: string;
    max_score?: number;
    answers?: { score?: string | number | null }[];
  }[];
  const n = rows.length;
  const submitted = rows.filter((r) => !isQuizAttemptInProgress(r));
  const nSubmitted = submitted.length;
  const avg =
    nSubmitted > 0
      ? submitted.reduce(
          (acc, r) => acc + Number(quizAttemptEarnedScoreDisplay(r)),
          0,
        ) / nSubmitted
      : 0;

  if (q.isLoading) {
    return <p className="text-text-muted text-sm">Loading stats…</p>;
  }
  if (q.isError) {
    return null;
  }

  return (
    <div className="text-text-muted text-sm">
      Submissions: {n}
      {nSubmitted > 0 && (
        <>
          {" "}
          · Average score: {avg.toFixed(1)}
        </>
      )}
    </div>
  );
}

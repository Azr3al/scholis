"use client";

import { QuizTakeFetchError } from "@/components/quiz-v3/shared/quiz-take-fetch-error";
import { QuizTakeShell } from "@/components/quiz-v3/shared/quiz-take-shell";
import { QuizTaker } from "@/components/quiz-v3/taker/quiz-taker";
import { quizTakeQueryRetryPredicate } from "@/helpers/quiz-v3-api-error";
import { parseQuizThemeV3 } from "@/lib/quiz-v3-theme-presets";
import { axiosClient } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

export default function QuizPlayerPage() {
  const params = useParams<{ code: string }>();
  const code = params.code ?? "";

  const meta = useQuery({
    queryKey: ["quiz-v3-preview", code],
    queryFn: async () => {
      const res = await axiosClient.get(`quizzes/take/${code}/preview`);
      return res.data?.data as {
        quiz_theme?: string;
        logo_url?: string | null;
        organization_name?: string | null;
      };
    },
    enabled: code.length > 0,
    staleTime: 60_000,
    retry: quizTakeQueryRetryPredicate,
  });

  const theme = parseQuizThemeV3(meta.data?.quiz_theme);
  const logoUrl = meta.data?.logo_url;
  const organizationName = meta.data?.organization_name;

  if (meta.isError) {
    return (
      <QuizTakeShell contextLabel="Quiz">
        <QuizTakeFetchError
          error={meta.error}
          fallback="This quiz is not available or the link is invalid."
        />
      </QuizTakeShell>
    );
  }

  return (
    <QuizTakeShell
      contextLabel="Quiz"
      theme={theme}
      logoUrl={logoUrl}
      organizationName={organizationName}
      isBrandingLoading={meta.isLoading}
    >
      <h1 className="mb-6 text-xl font-semibold tracking-tight text-text-primary">
        Quiz
      </h1>
      <QuizTaker code={code} />
    </QuizTakeShell>
  );
}

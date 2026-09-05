"use client";
import { Button, buttonVariants, Skeleton } from "@/components/primitives";

import { makePostRequest } from "@/app/client-api/utils";
import { QuizRichContentHtml } from "@/components/quiz-v3/shared/quiz-rich-content";
import { QuizTakeFetchError } from "@/components/quiz-v3/shared/quiz-take-fetch-error";
import { QuizTakeShell } from "@/components/quiz-v3/shared/quiz-take-shell";
import { useToast } from "@/components/primitives";
import {
  parseQuizV3TakeStudentMessage,
  quizTakeQueryRetryPredicate,
} from "@/helpers/quiz-v3-api-error";
import { isQuizV3TiptapDocEmpty } from "@/helpers/quiz-v3-tiptap-empty";
import { parseQuizThemeV3 } from "@/lib/quiz-v3-theme-presets";
import { axiosClient } from "@/lib/api";
import type { QuizTypeV3 } from "@/types/quiz-v3";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";

type PreviewData = QuizTypeV3 & {
  logo_url?: string | null;
  organization_name?: string | null;
  has_in_progress_attempt?: boolean;
  may_begin_new_attempt?: boolean;
};

export default function QuizStartPage() {
  const params = useParams<{ code: string }>();
  const code = params.code ?? "";
  const router = useRouter();
  const toast = useToast();

  const preview = useQuery({
    queryKey: ["quiz-v3-preview", code],
    queryFn: async () => {
      const res = await axiosClient.get(`quizzes/take/${code}/preview`);
      return res.data?.data as PreviewData;
    },
    enabled: code.length > 0,
    retry: quizTakeQueryRetryPredicate,
  });

  const begin = useMutation({
    mutationFn: async () => {
      return makePostRequest(`quizzes/take/${code}/begin`, {});
    },
    onSuccess: () => {
      router.push(`/take/${code}/quiz`);
    },
    onError: (err: unknown) => {
      toast.add({
        description: parseQuizV3TakeStudentMessage(err, "Could not start the quiz."),
      });
    },
  });

  if (preview.isLoading) {
    return (
      <QuizTakeShell contextLabel="Quiz" isBrandingLoading>
        <div className="space-y-6" aria-busy aria-label="Loading">
          <Skeleton className="h-8 w-2/3 max-w-md rounded-md" />
          <Skeleton className="h-32 w-full max-w-xl rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </QuizTakeShell>
    );
  }

  if (preview.isError) {
    return (
      <QuizTakeShell contextLabel="Quiz">
        <QuizTakeFetchError
          error={preview.error}
          fallback="This quiz is not available or the link is invalid."
        />
      </QuizTakeShell>
    );
  }
  if (!preview.data) {
    return (
      <QuizTakeShell contextLabel="Quiz">
        <QuizTakeFetchError fallback="This quiz is not available or the link is invalid." />
      </QuizTakeShell>
    );
  }

  const d = preview.data;
  const theme = parseQuizThemeV3(d.quiz_theme);
  const intro = d.intro_body;
  const showIntro = !isQuizV3TiptapDocEmpty(intro);
  const inProgress = Boolean(d.has_in_progress_attempt);

  return (
    <QuizTakeShell
      contextLabel="Quiz"
      theme={theme}
      logoUrl={d.logo_url}
      organizationName={d.organization_name}
    >
      <div className="space-y-6">
        <h1 className="text-text-primary text-xl font-semibold tracking-tight">
          {d.title}
        </h1>
        {showIntro ? (
          <div className="text-text-primary/90">
            <QuizRichContentHtml value={intro} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {inProgress ? (
            <Link
              href={`/take/${code}/quiz`}
              className={cn(buttonVariants({ variant: "primary"  }), "cursor-pointer")}
            >
              Continue quiz
            </Link>
          ) : (
            <Button
              type="button"
              className="cursor-pointer"
              onClick={() => begin.mutate()}
              isLoading={begin.isPending}
            >
              Begin quiz
            </Button>
          )}
        </div>
      </div>
    </QuizTakeShell>
  );
}

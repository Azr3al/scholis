"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import { hydrateQuizV3EditorStore } from "@/components/quiz-v3/editor/hydrate-quiz-v3-editor-store";
import { QuizEditor } from "@/components/quiz-v3/editor/quiz-editor";
import { QuizV3AppearanceForm } from "@/components/quiz-v3/editor/quiz-v3-appearance-form";
import { QuizV3SettingsForm } from "@/components/quiz-v3/editor/quiz-v3-settings-form";
import { QuizTakeLinkCard } from "@/components/quiz-v3/shared/quiz-take-link-card";
import { Button, buttonVariants, Skeleton } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { useQuizV3EditorStore } from "@/store/quiz-v3";
import {
  parseQuizV3EditSection,
  QUIZ_V3_EDIT_SECTION_QUERY,
  type QuizV3EditSection,
} from "@/lib/quiz-v3-edit-section";
import { QuizStatus, type QuestionTypeV3 } from "@/types/quiz-v3";
import type { QuizTypeV3 } from "@/types/quiz-v3";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useState, type MouseEvent } from "react";

function openQuizPreviewInNewTab(
  e: MouseEvent<HTMLAnchorElement>,
  previewPath: string,
) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (e.button !== 0) return;
  e.preventDefault();
  const url = new URL(previewPath, window.location.origin).href;
  // Two-arg open: no feature string, so Chromium uses a tab, not a sized popup.
  window.open(url, "_blank");
}

/** Reads quiz meta from the editor store so open/close status updates never refetch and re-hydrate the editor (wiping in-flight edits). */
function QuizV3EditStudentLinkBlock({ quizId }: { quizId: number }) {
  const toast = useToast();
  const quiz = useQuizV3EditorStore((s) => s.quiz as QuizTypeV3 | null);
  const statusMutation = useMutation({
    mutationFn: (status: QuizStatus) =>
      updateEntity("quizzes", quizId, { status }),
    onSuccess: (res) => {
      toast.add({ description: "Status updated." });
      const data = res?.data?.data as QuizTypeV3 | undefined;
      if (data) useQuizV3EditorStore.getState().applyServerQuizMetaOnly(data);
    },
    onError: () => {
      toast.add({
        description: "Could not update quiz status. Try again.",
      });
    },
  });

  if (!quiz?.code) return null;

  const takeUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/take/${quiz.code}`
      : `/take/${quiz.code}`;

  return (
    <QuizTakeLinkCard
      takeUrl={takeUrl}
      status={quiz.status as QuizStatus}
      activationDate={quiz.activation_date}
      expiryDate={quiz.expiry_date}
      allowedMinutes={quiz.allowed_minutes}
      maxRetakes={quiz.max_retakes}
      onStatusChange={(next) => statusMutation.mutate(next)}
      isStatusPending={statusMutation.isPending}
    />
  );
}

export default function QuizV3EditPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const searchParams = useSearchParams();

  const section = parseQuizV3EditSection(
    searchParams.get(QUIZ_V3_EDIT_SECTION_QUERY),
  );

  const setSection = (next: QuizV3EditSection) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(QUIZ_V3_EDIT_SECTION_QUERY, next);
    router.replace(`/quizzes-v3/${id}/edit?${sp.toString()}`, {
      scroll: false,
    });
  };

  const q = useQuery({
    queryKey: ["quiz-v3", id],
    queryFn: () =>
      fetchEntity("quizzes", id, [
        "questions",
        "questions.options",
        "category",
      ]),
    enabled: Number.isFinite(id),
  });
  const quiz = q.data?.data?.data as QuizTypeV3 | undefined;
  const questions = (quiz?.questions ?? []) as QuestionTypeV3[];

  const [storeReady, setStoreReady] = useState(false);

  useEffect(() => {
    setStoreReady(false);
  }, [id]);

  useLayoutEffect(() => {
    if (!quiz) return;
    hydrateQuizV3EditorStore(quiz, questions);
    setStoreReady(true);
  }, [quiz, questions, q.dataUpdatedAt]);

  if (q.isLoading) {
    return (
      <PageContainer
        width="narrow"
        className="space-y-8"
        aria-busy="true"
        aria-label="Loading quiz editor"
      >
        <Skeleton className="h-6 w-24" />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-9 w-24" />
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Loading quiz edit sections">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </nav>
        </div>
        <Skeleton className="h-64 w-full max-w-xl rounded-xl" />
      </PageContainer>
    );
  }
  if (q.isError || !quiz) {
    return (
      <p className="text-sm text-danger" role="alert">
        Failed to load quiz.
      </p>
    );
  }

  return (
    <PageContainer width="narrow" className="space-y-8">
      <Link
        href={`/quizzes-v3/${id}`}
        className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Back
      </Link>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-text-primary">Edit quiz</h1>
          <Link
            href={`/quizzes-v3/${id}/preview`}
            prefetch={false}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Preview quiz as learners see it"
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm"  }),
              "inline-flex shrink-0 gap-2 whitespace-nowrap",
            )}
            onClick={(e) => openQuizPreviewInNewTab(e, `/quizzes-v3/${id}/preview`)}
          >
            <Eye className="size-4 shrink-0" aria-hidden />
            Preview
          </Link>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Quiz edit sections">
          <Button
            type="button"
            aria-current={section === "settings" ? "true" : undefined}
            variant={section === "settings" ? "primary" : "secondary"}
            size="sm"
            className={cn("cursor-pointer rounded-full")}
            onClick={() => setSection("settings")}
          >
            Quiz settings
          </Button>
          <Button
            type="button"
            aria-current={section === "questions" ? "true" : undefined}
            variant={section === "questions" ? "primary" : "secondary"}
            size="sm"
            className={cn("cursor-pointer rounded-full")}
            onClick={() => setSection("questions")}
          >
            Question editor
          </Button>
          <Button
            type="button"
            aria-current={section === "appearance" ? "true" : undefined}
            variant={section === "appearance" ? "primary" : "secondary"}
            size="sm"
            className={cn("cursor-pointer rounded-full")}
            onClick={() => setSection("appearance")}
          >
            Appearance
          </Button>
        </nav>
      </div>

      {!storeReady ? (
        <Skeleton className="h-64 w-full max-w-xl" aria-busy="true" />
      ) : (
        <div
          className={cn(
            "flex flex-col gap-8",
            section === "questions" ? "w-full max-w-none" : "max-w-3xl",
          )}
        >
          {section === "settings" ? (
            <>
              <QuizV3EditStudentLinkBlock quizId={id} />
              <QuizV3SettingsForm quizId={id} />
            </>
          ) : section === "appearance" ? (
            <QuizV3AppearanceForm quizId={id} />
          ) : (
            <QuizEditor
              quizId={id}
              initialQuiz={quiz}
              initialQuestions={questions}
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}

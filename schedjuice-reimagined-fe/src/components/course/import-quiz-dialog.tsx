"use client";

import { Spinner } from "@/components/primitives/spinner";
import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import { Button } from "@/components/primitives";
import {
  Dialog,
} from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { operatorEnum } from "@/types/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

type QuizRow = { id: number; title: string };

type ImportQuizDialogProps = {
  courseId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

export function ImportQuizDialog({
  courseId,
  open,
  onOpenChange,
  onImported,
}: ImportQuizDialogProps) {
  const toast = useToast();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["import-quiz-candidates", "global", open],
    enabled: open,
    queryFn: () =>
      searchEntities(
        "quizzes",
        { size: 100, sorts: ["-created_at"] },
        {
          filter_params: [
            {
              field_name: "course",
              operator: operatorEnum.isnull,
              value: "true",
            },
          ],
        },
      ),
  });

  const rows: QuizRow[] =
    (data?.data?.data as QuizRow[] | undefined)?.filter((r) => r?.id) ?? [];

  const duplicateMutation = useMutation({
    mutationFn: (sourceQuizId: number) =>
      makePostRequest(`courses/${courseId}/quizzes/duplicate`, {
        source_quiz_id: sourceQuizId,
      }),
    onSuccess: (res: { data?: { data?: { id?: number } } }) => {
      toast.add({ description: "Quiz imported into this course." });
      const id = res?.data?.data?.id;
      onImported();
      onOpenChange(false);
      if (id) {
        router.push(`/quizzes-v3/${id}/edit`);
      }
    },
    onError: () => {
      toast.add({
        description: "Could not import that quiz.",
      });
    },
    onSettled: () => setPendingId(null),
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-lg">
          <Dialog.Title>Import quiz</Dialog.Title>
          <Dialog.Description>
            Copy a quiz you can access into this course. Questions are duplicated;
            the new quiz starts as a draft.
          </Dialog.Description>
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4 " aria-hidden />
            Loading quizzes…
          </p>
        )}
        {isError && (
          <p className="text-sm text-destructive">
            Could not load quizzes.{" "}
            <Button type="button" variant="ghost" className="h-auto p-0" onClick={() => refetch()}>
              Retry
            </Button>
          </p>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No quizzes available to import. Create a quiz in Quizzes first, or ask an
            admin.
          </p>
        )}
        <div className="max-h-[min(360px,50vh)] overflow-y-auto pr-3">
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    duplicateMutation.isPending && pendingId !== row.id
                  }
                  isLoading={
                    duplicateMutation.isPending && pendingId === row.id
                  }
                  onClick={() => {
                    setPendingId(row.id);
                    duplicateMutation.mutate(row.id);
                  }}
                >
                  Import
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import { axiosClient } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type ReleaseAttemptsResult = {
  released: number[];
  errors: { attempt_id: number; code: string }[];
};

export function quizV3AttemptsSearchQueryPrefix(quizId: number) {
  return `searchquizzes/${quizId}/attempts`;
}

export function useQuizV3ReleaseAttemptsMutation(quizId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attemptIds: number[]) => {
      const res = await axiosClient.post(
        `quizzes/${quizId}/release`,
        { attempt_ids: attemptIds },
      );
      return (res.data as { data?: ReleaseAttemptsResult } | undefined)?.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: [quizV3AttemptsSearchQueryPrefix(quizId)],
      });
    },
  });
}

export function useQuizV3BulkWaiveEssayMutation(quizId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attemptIds: number[]) => {
      const res = await axiosClient.post(
        `quizzes/${quizId}/waive-essay-grading-bulk`,
        { attempt_ids: attemptIds },
      );
      return (res.data as { data?: { waived_count: number } } | undefined)?.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: [quizV3AttemptsSearchQueryPrefix(quizId)],
      });
    },
  });
}

export function useQuizV3UnreleaseResultMutation(quizId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: number) => {
      await axiosClient.delete(`quizzes/${quizId}/results/${userId}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: [quizV3AttemptsSearchQueryPrefix(quizId)],
      });
    },
  });
}

export type EssayCommentPatchRow = {
  id?: number;
  anchor_start: number;
  anchor_end: number;
  body: string;
};

export function useQuizV3PatchEssayAnswerMutation(
  quizId: number,
  attemptId: number,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      answerId: number;
      score?: string | number;
      feedback?: Record<string, unknown>;
      comments?: EssayCommentPatchRow[];
    }) => {
      const body: Record<string, unknown> = {};
      if (payload.score !== undefined) body.score = payload.score;
      if (payload.feedback !== undefined) body.feedback = payload.feedback;
      if (payload.comments !== undefined) body.comments = payload.comments;
      const res = await axiosClient.patch(
        `quizzes/attempts/${attemptId}/answers/${payload.answerId}`,
        body,
      );
      return (res.data as { data?: unknown } | undefined)?.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["quiz-v3-attempt", attemptId] });
      await qc.invalidateQueries({
        queryKey: [quizV3AttemptsSearchQueryPrefix(quizId)],
      });
    },
  });
}

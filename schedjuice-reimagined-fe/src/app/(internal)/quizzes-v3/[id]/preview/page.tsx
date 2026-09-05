"use client";

import { PageContainer } from "@/components/layout/page-container";
import { QuizAuthorPreview } from "@/components/quiz-v3/preview/quiz-author-preview";
import { useParams } from "next/navigation";

export default function QuizV3AuthorPreviewPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  if (!Number.isFinite(id)) {
    return (
      <p className="text-danger text-sm" role="alert">
        Invalid quiz.
      </p>
    );
  }

  return  (
<PageContainer width="default">
<QuizAuthorPreview quizId={id} />
</PageContainer>
);
}

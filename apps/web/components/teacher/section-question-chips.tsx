'use client';

import { Badge } from '@/components/ui/badge';
import type { AuthoredQuestion } from '@/lib/api';
import { plainText } from '@/lib/take/rich-text';
import { useMemo } from 'react';

export const SectionQuestionChips = ({
  sectionId,
  sectionIndex,
  questions,
}: {
  sectionId: string;
  sectionIndex: number;
  questions: AuthoredQuestion[];
}) => {
  const members = useMemo(
    () =>
      questions
        .filter((question) => question.sectionId === sectionId)
        .sort((a, b) => a.position - b.position),
    [questions, sectionId],
  );

  if (members.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1.5"
      data-testid={`section-questions-${String(sectionIndex)}`}
    >
      {members.map((question) => {
        const number = questions.findIndex((q) => q.id === question.id) + 1;
        const prompt = plainText(question.body).trim() || 'Untitled question';

        return (
          <Badge
            key={question.id}
            variant="secondary"
            title={prompt}
            data-testid={`section-question-chip-${String(number)}`}
          >
            Q{number}
          </Badge>
        );
      })}
    </div>
  );
};

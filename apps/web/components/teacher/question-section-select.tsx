'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Section } from '@scholis/schema';
import { useState } from 'react';

export const NO_SECTION = 'none';

const sectionLabel = (title: string): string => title.trim() || 'Untitled section';

export const QuestionSectionSelect = ({
  testId,
  questionId,
  sectionId,
  sections,
  questionIndex,
  onAssigned,
  onError,
}: {
  testId: string;
  questionId: string;
  sectionId: string | null;
  sections: Section[];
  questionIndex: number;
  onAssigned: () => void;
  onError: (message: string) => void;
}) => {
  const [saving, setSaving] = useState(false);
  const value = sectionId ?? NO_SECTION;

  const labelFor = (id: string): string => {
    if (id === NO_SECTION) return 'No section';
    const section = sections.find((s) => s.id === id);
    return section === undefined ? 'No section' : sectionLabel(section.title);
  };

  return (
    <Select
      value={value}
      disabled={saving}
      onValueChange={(next) => {
        if (next === value) return;

        setSaving(true);
        void api
          .assignQuestionSection({
            testId,
            questionId,
            sectionId: next === NO_SECTION ? null : next,
          })
          .then(onAssigned)
          .catch((err: unknown) => {
            onError(err instanceof Error ? err.message : 'Could not move that question.');
          })
          .finally(() => {
            setSaving(false);
          });
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-8 text-xs"
        aria-label={`Section for question ${String(questionIndex + 1)}`}
        data-testid={`question-section-${String(questionIndex)}`}
      >
        {/* The render prop hands back `any`, so the value is checked here
            rather than trusted — anything that isn't a section id reads as
            no section, which is what an empty select should say anyway. */}
        <SelectValue>
          {(current: unknown) => labelFor(typeof current === 'string' ? current : NO_SECTION)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_SECTION}>No section</SelectItem>
        {sections.map((section) => (
          <SelectItem key={section.id} value={section.id}>
            {sectionLabel(section.title)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

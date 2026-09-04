'use client';

import { questionTypeLabel } from '@/components/teacher/question-answer-key';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { api, type AuthoredQuestion } from '@/lib/api';
import { plainText } from '@/lib/take/rich-text';
import type { Section } from '@scholis/schema';
import { useMemo, useState } from 'react';

export const SectionQuestionPicker = ({
  testId,
  section,
  sectionIndex,
  questions,
  disabled,
  onAssigned,
}: {
  testId: string;
  section: Section;
  sectionIndex: number;
  questions: AuthoredQuestion[];
  disabled: boolean;
  onAssigned: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unassigned = useMemo(
    () =>
      questions
        .filter((question) => question.sectionId === null)
        .sort((a, b) => a.position - b.position),
    [questions],
  );

  const sectionTitle = section.title.trim() || 'Untitled section';

  const close = () => {
    setOpen(false);
    setSelected(new Set());
    setError(null);
  };

  const toggle = (questionId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  };

  const assignSelected = () => {
    if (selected.size === 0) return;

    setSaving(true);
    setError(null);
    void Promise.all(
      [...selected].map((questionId) =>
        api.assignQuestionSection({ testId, questionId, sectionId: section.id }),
      ),
    )
      .then(() => {
        close();
        onAssigned();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not add those questions.');
        onAssigned();
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={disabled || saving}
        data-testid={`section-add-questions-${String(sectionIndex)}`}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            setError(null);
          }
        }}
      >
        Add questions
      </Button>

      {open && (
        <div
          className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3"
          aria-busy={saving}
          data-testid={`section-question-picker-${String(sectionIndex)}`}
        >
          {unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unassigned questions. Use the dropdown on a question row to move it between
              sections.
            </p>
          ) : (
            <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto scrollbar-thin">
              {unassigned.map((question) => {
                const position = questions.findIndex((q) => q.id === question.id);
                const label = plainText(question.body).trim() || 'Untitled question';
                const checkboxId = `section-${section.id}-question-${question.id}`;

                return (
                  <li key={question.id} className="flex items-start gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={selected.has(question.id)}
                      disabled={disabled || saving}
                      onCheckedChange={(checked) => {
                        toggle(question.id, checked);
                      }}
                      data-testid={`section-picker-question-${String(position)}`}
                    />
                    <Label htmlFor={checkboxId} className="cursor-pointer font-normal leading-snug">
                      Q{position + 1} · {questionTypeLabel(question)} · {label}
                    </Label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {unassigned.length > 0 && (
              <Button
                type="button"
                size="sm"
                disabled={disabled || saving || selected.size === 0}
                data-testid={`section-add-selected-${String(sectionIndex)}`}
                onClick={assignSelected}
              >
                {saving ? 'Adding…' : `Add to ${sectionTitle}`}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={close}
            >
              Cancel
            </Button>
          </div>

          {error !== null && (
            <p className="text-sm text-destructive" data-testid="section-picker-error">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

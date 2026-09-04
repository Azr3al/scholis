'use client';

import { SectionQuestionChips } from '@/components/teacher/section-question-chips';
import { SectionQuestionPicker } from '@/components/teacher/section-question-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, type AuthoredQuestion } from '@/lib/api';
import { plainText, textDoc } from '@/lib/take/rich-text';
import type { Section } from '@scholis/schema';
import { useEffect, useRef, useState } from 'react';

/**
 * Section management: create, rename, reorder, delete.
 *
 * No drag-and-drop and no nesting. Sections are headings over a flat question
 * list, and a pair of arrows is enough to order a handful of them — a drag
 * library would be more code than the feature.
 */
export const SectionsPanel = ({
  testId,
  sections,
  questions,
  onChanged,
}: {
  testId: string;
  sections: Section[];
  questions: AuthoredQuestion[];
  onChanged: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const descriptionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const descriptionFor = (section: Section): string =>
    descriptions[section.id] ??
    (section.description === null ? '' : plainText(section.description));

  // Which section was just created, so its input can take focus once it exists.
  // Cleared immediately after, or reopening the page would grab focus again.
  const [focusId, setFocusId] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (focusId === null) return;
    const input = inputs.current[focusId];
    if (input === undefined || input === null) return;

    input.focus();
    // Selected, not just focused: a new section is named "New section", and
    // the teacher's next keystroke should replace it rather than append to it.
    input.select();
    setFocusId(null);
  }, [focusId, sections]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update sections.');
    } finally {
      setBusy(false);
    }
  };

  const saveSection = (section: Section, title: string, description: string) => {
    const unchangedTitle = title === section.title;
    const unchangedDescription =
      description.trim() ===
      (section.description === null ? '' : plainText(section.description).trim());
    if (unchangedTitle && unchangedDescription) return;
    void run(() =>
      api.updateSection({
        testId,
        sectionId: section.id,
        title,
        description: description.trim() === '' ? null : textDoc(description.trim()),
      }),
    );
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    const next = sections.map((section) => section.id);
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    void run(() => api.reorderSections({ testId, sectionIds: next }));
  };

  return (
    <Card className="min-w-0" data-testid="sections-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Sections</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          data-testid="add-section"
          onClick={() => {
            // One click: create it, then put the caret in its name with the
            // placeholder text selected.
            void run(async () => {
              const created = await api.createSection({ testId, title: 'New section' });
              setFocusId(created.id);
              return created;
            });
          }}
        >
          Add section
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {sections.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No sections. Questions appear as one list — add a section to group them under a heading.
          </p>
        )}

        {sections.map((section, index) => (
          <div key={section.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex min-w-0 items-center gap-2">
              <Input
                ref={(element) => {
                  inputs.current[section.id] = element;
                }}
                className="min-w-0 flex-1"
                value={titles[section.id] ?? section.title}
                aria-label={`Section ${String(index + 1)} title`}
                data-testid={`section-title-${String(index)}`}
                onChange={(e) => {
                  setTitles((current) => ({ ...current, [section.id]: e.target.value }));
                }}
                onBlur={(e) => {
                  saveSection(section, e.target.value, descriptionFor(section));
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Move section ${String(index + 1)} up`}
                disabled={index === 0 || busy}
                data-testid={`section-up-${String(index)}`}
                onClick={() => {
                  move(index, index - 1);
                }}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Move section ${String(index + 1)} down`}
                disabled={index === sections.length - 1 || busy}
                data-testid={`section-down-${String(index)}`}
                onClick={() => {
                  move(index, index + 1);
                }}
              >
                ↓
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`Delete section ${String(index + 1)}`}
                data-testid={`section-delete-${String(index)}`}
                onClick={() => {
                  void run(() => api.deleteSection({ testId, sectionId: section.id }));
                }}
              >
                Delete
              </Button>
            </div>

            <div className="grid gap-1.5">
              <Label
                className="text-xs text-muted-foreground"
                htmlFor={`section-desc-${section.id}`}
              >
                Section description (optional)
              </Label>
              <Textarea
                id={`section-desc-${section.id}`}
                value={descriptionFor(section)}
                placeholder="Optional notes shown when students reach this section."
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value;
                  setDescriptions((current) => ({ ...current, [section.id]: next }));
                  const existing = descriptionTimers.current[section.id];
                  if (existing !== undefined) clearTimeout(existing);
                  descriptionTimers.current[section.id] = setTimeout(() => {
                    saveSection(section, titles[section.id] ?? section.title, next);
                  }, 500);
                }}
                data-testid={`section-description-${String(index)}`}
              />
            </div>

            <SectionQuestionPicker
              testId={testId}
              section={section}
              sectionIndex={index}
              questions={questions}
              disabled={busy}
              onAssigned={onChanged}
            />
            <SectionQuestionChips
              sectionId={section.id}
              sectionIndex={index}
              questions={questions}
            />
          </div>
        ))}

        {sections.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Deleting a section keeps its questions — they just stop being grouped.
          </p>
        )}

        {error !== null && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
};

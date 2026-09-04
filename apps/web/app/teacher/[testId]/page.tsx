'use client';

import { QuestionAnswerKey, questionTypeLabel } from '@/components/teacher/question-answer-key';
import { QuestionForm } from '@/components/teacher/question-form';
import { QuestionSectionSelect } from '@/components/teacher/question-section-select';
import {
  QuestionSidebar,
  type Pane,
  type SectionChange,
} from '@/components/teacher/question-sidebar';
import { QuickAddQuestions } from '@/components/teacher/quick-add-questions';
import { SectionsPanel } from '@/components/teacher/sections-panel';
import { TestSettingsForm, type TestSettingsValues } from '@/components/teacher/test-settings-form';
import { TestTagsDropdown } from '@/components/teacher/test-tags-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api, type TestDetail } from '@/lib/api';
import { plainText } from '@/lib/take/rich-text';
import { incompleteQuestionCount } from '@scholis/engine';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';

export default function TestEditorPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = use(params);
  const router = useRouter();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Pane>({ kind: 'settings' });
  /**
   * Bumped to remount the question form, which is how Cancel discards edits.
   * The form builds its editors once and owns their DOM, so resetting state
   * behind them would leave the old text on screen.
   */
  const [formKey, setFormKey] = useState(0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [openAnswerIds, setOpenAnswerIds] = useState<Set<string>>(() => new Set());
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSettings = useRef<TestSettingsValues | null>(null);

  // Kept apart from loadError: a failed delete or publish shouldn't replace the
  // editor with an error page and lose whatever the teacher was part-way through.
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .getTest(testId)
      .then(setTest)
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : 'Could not load this test.');
      });
  }, [testId]);

  useEffect(load, [load]);

  /**
   * Swaps two questions and sends the whole resulting order.
   *
   * Optimistic, because a reorder that lags behind the click feels broken; the
   * server is the arbiter and `load()` puts the truth back if it disagrees.
   */
  const applyOrder = async (questionIds: string[], sectionChange: SectionChange | null) => {
    if (test === null) return;

    const byId = new Map(test.questions.map((question) => [question.id, question]));
    const next = questionIds.flatMap((id) => {
      const found = byId.get(id);
      if (found === undefined) return [];
      return [
        sectionChange !== null && found.id === sectionChange.questionId
          ? { ...found, sectionId: sectionChange.sectionId }
          : found,
      ];
    });

    setReordering(true);
    setError(null);
    setTest({ ...test, questions: next });

    try {
      // Section first, order second. The order is the authoritative statement
      // of the paper, so it lands last and wins if the two ever disagree.
      if (sectionChange !== null) {
        await api.assignQuestionSection({
          testId,
          questionId: sectionChange.questionId,
          sectionId: sectionChange.sectionId,
        });
      }
      await api.reorderQuestions({ testId, questionIds });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reorder the questions.');
      load();
    } finally {
      setReordering(false);
    }
  };

  const handleSettingsChange = useCallback(
    (values: TestSettingsValues) => {
      setSettingsError(null);
      setTest((current) =>
        current === null
          ? current
          : {
              ...current,
              title: values.title,
              timeLimitMinutes: values.timeLimitMinutes,
              allowNavigation: values.allowNavigation,
              testTakingMode: values.testTakingMode,
              maxAttempts: values.maxAttempts,
              introBody: values.introBody,
              outroBody: values.outroBody,
              randomizeQuestionOrder: values.randomizeQuestionOrder,
            },
      );

      pendingSettings.current = values;
      if (saveTimer.current !== undefined) clearTimeout(saveTimer.current);
      setSettingsSaving(true);

      saveTimer.current = setTimeout(() => {
        const payload = pendingSettings.current;
        if (payload === null) {
          setSettingsSaving(false);
          return;
        }

        void api
          .updateTest({ testId, ...payload })
          .then((summary) => {
            setTest((current) =>
              current === null
                ? current
                : {
                    ...current,
                    title: summary.title,
                    timeLimitMinutes: summary.timeLimitMinutes,
                    allowNavigation: summary.allowNavigation,
                    testTakingMode: summary.testTakingMode,
                    maxAttempts: summary.maxAttempts,
                    introBody: payload.introBody,
                    outroBody: payload.outroBody,
                    randomizeQuestionOrder: payload.randomizeQuestionOrder,
                    updatedAt: summary.updatedAt,
                  },
            );
            setSettingsSaving(false);
          })
          .catch((e: unknown) => {
            setSettingsError(e instanceof Error ? e.message : 'Could not save these settings.');
            setSettingsSaving(false);
            load();
          });
      }, 500);
    },
    [load, testId],
  );

  useEffect(
    () => () => {
      if (saveTimer.current !== undefined) clearTimeout(saveTimer.current);
    },
    [],
  );

  if (loadError !== null) return <main className="p-6 text-destructive">{loadError}</main>;
  if (test === null) return <main className="p-6 text-muted-foreground">Loading…</main>;

  const draft = test.status === 'draft';
  const incompleteCount = incompleteQuestionCount(test.questions);
  const canPublish = test.questions.length > 0 && incompleteCount === 0;

  const showAnswer = (questionId: string) => openAnswerIds.has(questionId);

  const toggleQuestionAnswer = (questionId: string) => {
    setOpenAnswerIds((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  // A published test has no settings or sections to edit, so those panes don't
  // exist for it — land on the paper instead.
  const pane: Pane =
    !draft && selected.kind !== 'question' && test.questions[0] !== undefined
      ? { kind: 'question', id: test.questions[0].id }
      : selected;

  const selectedQuestion =
    pane.kind === 'question' ? test.questions.find((q) => q.id === pane.id) : undefined;
  const selectedIndex =
    selectedQuestion === undefined ? -1 : test.questions.indexOf(selectedQuestion);

  /** Adding lands you in the new question rather than leaving you to find it. */
  const addedQuestion = () => {
    const before = new Set(test.questions.map((question) => question.id));
    setError(null);
    api
      .getTest(testId)
      .then((next) => {
        setTest(next);
        const added = next.questions.find((question) => !before.has(question.id));
        if (added !== undefined) setSelected({ kind: 'question', id: added.id });
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : 'Could not load this test.');
      });
  };

  return (
    <>
      <main className={`mx-auto w-full max-w-6xl p-4 sm:p-6 ${draft ? 'pb-36' : ''}`}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href="/teacher"
              className="text-sm text-muted-foreground transition-ui hover:text-foreground"
            >
              ← All tests
            </Link>
            {!draft && <h1 className="mt-1 text-2xl font-semibold tracking-tight">{test.title}</h1>}
            <p className={`text-sm text-muted-foreground ${draft ? 'mt-1' : ''}`}>
              Code <span className="font-medium text-foreground">{test.code}</span>
            </p>
            {!draft && (
              <p className="mt-1 text-sm text-muted-foreground">
                Share this code with students so they can start taking the test.
              </p>
            )}
            {test.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {test.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="text-xs">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant={draft ? 'secondary' : 'default'} data-testid="test-status">
              {test.status}
            </Badge>
            <TestTagsDropdown
              testId={testId}
              assignedTagIds={test.tags.map((tag) => tag.id)}
              onAssignedChange={(tagIds, tagNames) => {
                setTest((current) => {
                  if (current === null) return current;
                  return {
                    ...current,
                    tags: tagIds.map((id) => ({ id, name: tagNames.get(id) ?? id })),
                  };
                });
              }}
            />
            <Link href={`/teacher/${testId}/comments`}>
              <Button variant="outline" size="sm" data-testid="view-comments">
                Comments
              </Button>
            </Link>
            <Link href={`/teacher/${testId}/submissions`}>
              <Button variant="outline" size="sm">
                Submissions
              </Button>
            </Link>
          </div>
        </header>

        {/*
          Two panes: the paper on the left, the one thing you're editing on the
          right. The list used to sit above the editor and show every question
          in full, which on a twenty-question paper meant scrolling past every
          image and equation to reach the one you wanted.

          On a narrow screen the outline becomes a short scrollable box above
          the editor rather than a full-height column, so it costs a phone user
          a few lines instead of the whole first screen.
        */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <aside className="flex w-full max-h-72 flex-col overflow-hidden rounded-lg border lg:sticky lg:top-6 lg:w-[18rem] lg:max-h-[calc(100vh-14rem)] lg:shrink-0">
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
              <QuestionSidebar
                test={test}
                draft={draft}
                reordering={reordering}
                selected={pane}
                onSelect={setSelected}
                onReorder={(questionIds, sectionChange) => {
                  void applyOrder(questionIds, sectionChange);
                }}
              />
            </div>

            {draft && (
              <div className="shrink-0 border-t p-2">
                <QuickAddQuestions
                  testId={testId}
                  onAdded={addedQuestion}
                  layout="sidebar"
                />
              </div>
            )}
          </aside>

          <section className="flex min-w-0 flex-col gap-4">
            {pane.kind === 'settings' && draft && (
              <TestSettingsForm
                test={test}
                saving={settingsSaving}
                error={settingsError}
                onChange={handleSettingsChange}
              />
            )}

            {pane.kind === 'sections' && draft && (
              <SectionsPanel
                testId={testId}
                sections={test.sections}
                questions={test.questions}
                onChanged={load}
              />
            )}

            {selectedQuestion !== undefined && draft && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    Question {selectedIndex + 1} of {test.questions.length}
                  </p>
                  <div className="flex items-center gap-2">
                    {/* The keyboard route between sections. Dragging in the
                        outline does the same thing with a mouse. */}
                    {test.sections.length > 0 && (
                      <QuestionSectionSelect
                        testId={testId}
                        questionId={selectedQuestion.id}
                        sectionId={selectedQuestion.sectionId}
                        sections={test.sections}
                        questionIndex={selectedIndex}
                        onAssigned={load}
                        onError={(message) => {
                          setError(message);
                        }}
                      />
                    )}
                    {confirmingId === selectedQuestion.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          data-testid={`confirm-delete-${String(selectedIndex)}`}
                          onClick={() => {
                            const id = selectedQuestion.id;
                            setError(null);
                            setConfirmingId(null);
                            void api
                              .deleteQuestion(id)
                              .then(() => {
                                // The pane it was in is gone with it.
                                setSelected({ kind: 'settings' });
                                load();
                              })
                              .catch((e: unknown) => {
                                setError(e instanceof Error ? e.message : 'Could not delete.');
                              });
                          }}
                        >
                          Delete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setConfirmingId(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`delete-question-${String(selectedIndex)}`}
                        onClick={() => {
                          setError(null);
                          setConfirmingId(selectedQuestion.id);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                <QuestionForm
                  key={`${selectedQuestion.id}-${String(formKey)}`}
                  initial={selectedQuestion}
                  onSaved={() => {
                    setError(null);
                    load();
                  }}
                  onCancel={() => {
                    // Remounts the form, which is what puts the saved text back.
                    setFormKey((current) => current + 1);
                  }}
                />
              </>
            )}

            {selectedQuestion !== undefined && !draft && (
              <Card>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Q{selectedIndex + 1} · {questionTypeLabel(selectedQuestion)} ·{' '}
                        {selectedQuestion.points} {selectedQuestion.points === 1 ? 'mark' : 'marks'}
                      </p>
                      <p className="text-sm">
                        {plainText(selectedQuestion.body) || 'Untitled question'}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`view-answer-${String(selectedIndex)}`}
                      onClick={() => {
                        toggleQuestionAnswer(selectedQuestion.id);
                      }}
                    >
                      {showAnswer(selectedQuestion.id) ? 'Hide answer' : 'View answer'}
                    </Button>
                  </div>

                  {showAnswer(selectedQuestion.id) && (
                    <div
                      className="rounded-lg border border-border bg-muted/30 p-3"
                      data-testid={`answer-key-${String(selectedIndex)}`}
                    >
                      <QuestionAnswerKey question={selectedQuestion} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {pane.kind === 'question' && selectedQuestion === undefined && (
              <p className="text-sm text-muted-foreground">That question is no longer here.</p>
            )}

            {!draft && test.questions.length === 0 && (
              <p className="text-sm text-muted-foreground">This test has no questions.</p>
            )}

            {error !== null && (
              <p className="text-sm text-destructive" data-testid="editor-error">
                {error}
              </p>
            )}

            {/* Clearance for the fixed publish bar, which otherwise sits on top
                of the last thing in this column — Save, usually. */}
            {draft && <div className="h-24 shrink-0" aria-hidden="true" />}
          </section>
        </div>
      </main>

      {draft && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 p-4">
            <Button
              variant="outline"
              size="lg"
              data-testid="preview-test"
              onClick={() => {
                router.push(`/teacher/${testId}/preview`);
              }}
            >
              Preview
            </Button>
            <Button
              size="lg"
              className="flex-1 sm:flex-none"
              data-testid="publish"
              disabled={publishing || !canPublish}
              onClick={() => {
                setPublishing(true);
                setError(null);
                void api
                  .publishTest(testId)
                  .then(() => {
                    load();
                  })
                  .catch((e: unknown) => {
                    setError(e instanceof Error ? e.message : 'Could not publish.');
                  })
                  .finally(() => {
                    setPublishing(false);
                  });
              }}
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </Button>
            {!canPublish && test.questions.length > 0 && incompleteCount > 0 && (
              <p className="text-sm text-muted-foreground" data-testid="publish-blocked">
                {incompleteCount} {incompleteCount === 1 ? 'question' : 'questions'} incomplete
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

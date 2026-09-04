'use client';

import { questionTypeLabel } from '@/components/teacher/question-answer-key';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TestDetail } from '@/lib/api';
import { plainText } from '@/lib/take/rich-text';
import { groupBySection, moveTo, type DropTarget } from '@/lib/teacher/question-groups';
import { cn } from '@/lib/utils';
import { isQuestionReady } from '@scholis/engine';
import { useState } from 'react';

/**
 * The paper's outline, and the only place its order is changed.
 *
 * Questions sit under their section headings, and dragging one is how a teacher
 * moves it — including into another section, which the arrows never allowed.
 * The arrows are still here because dragging is a mouse gesture: a keyboard
 * user has no way to perform it, and reordering a paper is not an optional
 * nicety they can be asked to do without.
 */

export type Pane = { kind: 'settings' } | { kind: 'sections' } | { kind: 'question'; id: string };

interface Props {
  test: TestDetail;
  draft: boolean;
  reordering: boolean;
  selected: Pane;
  onSelect: (pane: Pane) => void;
  /** Given the whole new order, and a section change when one happened. */
  onReorder: (questionIds: string[], sectionChange: SectionChange | null) => void;
}

export interface SectionChange {
  questionId: string;
  sectionId: string | null;
}

const isSame = (a: Pane, b: Pane): boolean =>
  a.kind === b.kind && (a.kind !== 'question' || b.kind !== 'question' || a.id === b.id);

export const QuestionSidebar = ({
  test,
  draft,
  reordering,
  selected,
  onSelect,
  onReorder,
}: Props) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  const groups = groupBySection(test.sections, test.questions);

  const clearDrag = () => {
    setDragId(null);
    setTarget(null);
  };

  /** One place to turn a move into the two things the server needs told. */
  const apply = (questionId: string, to: DropTarget) => {
    const result = moveTo(groups, questionId, to);
    if (result === null) return;
    onReorder(
      result.questionIds,
      result.sectionId === undefined ? null : { questionId, sectionId: result.sectionId },
    );
  };

  const drop = () => {
    const id = dragId;
    const to = target;
    clearDrag();
    if (id === null || to === null) return;
    apply(id, to);
  };

  /** Above or below, decided by which half of the row the pointer is over. */
  const targetForRow = (
    event: React.DragEvent,
    sectionId: string | null,
    questionId: string,
    nextId: string | null,
  ): DropTarget => {
    const rect = event.currentTarget.getBoundingClientRect();
    const below = event.clientY > rect.top + rect.height / 2;
    return { sectionId, beforeId: below ? nextId : questionId };
  };

  const showsDropLine = (sectionId: string | null, beforeId: string | null): boolean =>
    target !== null && target.sectionId === sectionId && target.beforeId === beforeId;

  return (
    <nav
      className="flex flex-col gap-1"
      data-testid="question-list"
      aria-label="Questions in this test"
      onDragLeave={(event) => {
        // Only when the pointer has actually left the outline, not when it
        // crosses between two rows inside it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null);
      }}
    >
      {draft && (
        <>
          <SidebarLink
            label="Test settings"
            testId="pane-settings"
            active={isSame(selected, { kind: 'settings' })}
            onClick={() => {
              onSelect({ kind: 'settings' });
            }}
          />
          <SidebarLink
            label={`Sections${test.sections.length > 0 ? ` (${String(test.sections.length)})` : ''}`}
            testId="pane-sections"
            active={isSame(selected, { kind: 'sections' })}
            onClick={() => {
              onSelect({ kind: 'sections' });
            }}
          />
          <div className="my-2 border-t" />
        </>
      )}

      {groups.map((group, groupIndex) => {
        const sectionId = group.section?.id ?? null;
        const first = group.items[0]?.question.id ?? null;
        // Named sections keep the same numbering as the sections panel; the
        // unsectioned group is last and has no number to share.
        const slot = group.section === null ? 'none' : String(groupIndex);

        return (
          <div key={sectionId ?? 'ungrouped'} className="flex flex-col">
            <p
              className={cn(
                'px-2 py-1.5 text-xs font-semibold tracking-wide uppercase',
                group.section === null ? 'text-muted-foreground' : 'text-foreground',
              )}
              data-testid={`group-heading-${slot}`}
              onDragOver={(event) => {
                if (dragId === null) return;
                event.preventDefault();
                setTarget({ sectionId, beforeId: first });
              }}
              onDrop={(event) => {
                event.preventDefault();
                drop();
              }}
            >
              {group.section === null ? 'No section' : group.section.title || 'Untitled section'}
            </p>

            {/* An empty named section still needs somewhere to drop onto. */}
            {group.items.length === 0 && (
              <div
                className={cn(
                  'mx-2 mb-1 rounded-md border border-dashed px-2 py-3 text-xs text-muted-foreground',
                  showsDropLine(sectionId, null) && 'border-primary bg-primary/5 text-foreground',
                )}
                data-testid={`section-dropzone-${slot}`}
                onDragOver={(event) => {
                  if (dragId === null) return;
                  event.preventDefault();
                  setTarget({ sectionId, beforeId: null });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  drop();
                }}
              >
                {dragId === null ? 'No questions yet' : 'Drop here'}
              </div>
            )}

            {group.items.map(({ question, index, indexInGroup }) => {
              const nextId = group.items[indexInGroup + 1]?.question.id ?? null;
              const ready = isQuestionReady(question);

              return (
                <div key={question.id} className="relative">
                  <DropLine shown={showsDropLine(sectionId, question.id)} />

                  <div
                    className={cn(
                      'group flex items-center gap-1 rounded-md pr-1',
                      isSame(selected, { kind: 'question', id: question.id })
                        ? 'bg-muted'
                        : 'hover:bg-muted/50',
                      dragId === question.id && 'opacity-40',
                    )}
                    data-testid={`question-card-${String(index)}`}
                    draggable={draft && !reordering}
                    onDragStart={(event) => {
                      // Required by Firefox, which ignores drags with no data.
                      event.dataTransfer.setData('text/plain', question.id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDragId(question.id);
                    }}
                    onDragEnd={clearDrag}
                    onDragOver={(event) => {
                      if (dragId === null) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setTarget(targetForRow(event, sectionId, question.id, nextId));
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      drop();
                    }}
                  >
                    {draft && (
                      <span
                        className="cursor-grab px-1 text-xs text-muted-foreground select-none"
                        aria-hidden
                      >
                        ⠿
                      </span>
                    )}

                    <button
                      type="button"
                      className="min-w-0 flex-1 py-1.5 text-left"
                      data-testid={`expand-question-${String(index)}`}
                      onClick={() => {
                        onSelect({ kind: 'question', id: question.id });
                      }}
                    >
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="shrink-0">Q{index + 1}</span>
                        <span className="truncate">
                          · {questionTypeLabel(question)} · {question.points}{' '}
                          {question.points === 1 ? 'mark' : 'marks'}
                        </span>
                        {draft && !ready && (
                          <Badge
                            variant="secondary"
                            className="px-1 py-0 text-[10px]"
                            data-testid="question-incomplete"
                          >
                            Incomplete
                          </Badge>
                        )}
                      </span>
                      <span className="block truncate text-sm">
                        {plainText(question.body) || 'Untitled question'}
                      </span>
                    </button>

                    {draft && (
                      // Kept for the keyboard, and for anyone who finds dragging
                      // fiddly. Same move, same request.
                      <span className="flex shrink-0 flex-col opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-6 p-0 text-[10px] leading-none"
                          aria-label={`Move question ${String(index + 1)} up`}
                          disabled={indexInGroup === 0 || reordering}
                          data-testid={`move-up-${String(index)}`}
                          onClick={() => {
                            const above = group.items[indexInGroup - 1]?.question.id ?? null;
                            if (above !== null) apply(question.id, { sectionId, beforeId: above });
                          }}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-6 p-0 text-[10px] leading-none"
                          aria-label={`Move question ${String(index + 1)} down`}
                          disabled={indexInGroup === group.items.length - 1 || reordering}
                          data-testid={`move-down-${String(index)}`}
                          onClick={() => {
                            // Two below, because stepping down means landing
                            // above the question after next.
                            const twoBelow = group.items[indexInGroup + 2]?.question.id ?? null;
                            apply(question.id, { sectionId, beforeId: twoBelow });
                          }}
                        >
                          ↓
                        </Button>
                      </span>
                    )}
                  </div>

                  {/* The last row also carries the "put it at the end" target. */}
                  {nextId === null && <DropLine shown={showsDropLine(sectionId, null)} />}
                </div>
              );
            })}
          </div>
        );
      })}

      {test.questions.length === 0 && (
        <p className="px-2 py-3 text-sm text-muted-foreground">No questions yet.</p>
      )}
    </nav>
  );
};

/** Where the dragged question would land. */
const DropLine = ({ shown }: { shown: boolean }) => (
  <div
    aria-hidden
    className={cn(
      'mx-2 h-0.5 rounded-full transition-colors',
      shown ? 'bg-primary' : 'bg-transparent',
    )}
  />
);

const SidebarLink = ({
  label,
  testId,
  active,
  onClick,
}: {
  label: string;
  testId: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={cn(
      'transition-ui rounded-md px-2 py-1.5 text-left text-sm',
      active ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50',
    )}
    data-testid={testId}
    aria-current={active ? 'page' : undefined}
    onClick={onClick}
  >
    {label}
  </button>
);

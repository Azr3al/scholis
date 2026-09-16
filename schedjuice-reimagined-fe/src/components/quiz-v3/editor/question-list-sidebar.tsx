"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button } from "@/components/primitives";

import { SortableList } from "@/components/quiz-v3/editor/sortable-list";
import { convertToEditorDoc } from "@/helpers/convertToEditorDoc";
import { cn } from "@/lib/utils";
import type { QuestionTypeV3 } from "@/types/quiz-v3";
import type { JSONContent } from "@tiptap/core";
import { NavArrowLeft as ChevronLeft, DotsGrid3x3 as GripVertical } from "iconoir-react";

const LABEL_MAX = 44;

function truncateQuestionLabel(plain: string | undefined): string {
  const collapsed = (plain ?? "").trim().replace(/\s+/g, " ");
  if (!collapsed) return "Untitled";
  if (collapsed.length <= LABEL_MAX) return collapsed;
  return `${collapsed.slice(0, LABEL_MAX - 1)}…`;
}

function plainTextFromDoc(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (!node.content?.length) return "";
  return node.content.map((c) => plainTextFromDoc(c)).join("");
}

function sidebarSnippet(question: QuestionTypeV3): string {
  const fromPlain = question.body_plaintext?.trim();
  if (fromPlain) return truncateQuestionLabel(fromPlain);
  const doc = convertToEditorDoc(question.body);
  const extracted = plainTextFromDoc(doc).trim().replace(/\s+/g, " ");
  return truncateQuestionLabel(extracted || undefined);
}

export function questionRowKey(q: QuestionTypeV3, index: number): string {
  if (q.id != null) return `id-${q.id}`;
  if (q.client_id) return `c-${q.client_id}`;
  return `i-${index}`;
}

function getQuestionId(q: QuestionTypeV3, questions: QuestionTypeV3[]): string | number {
  if (q.id != null) return q.id;
  if (q.client_id) return q.client_id;
  const idx = questions.indexOf(q);
  return `i-${idx >= 0 ? idx : 0}`;
}

type Props = {
  questions: QuestionTypeV3[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onReorderList: (orderedQuestions: QuestionTypeV3[]) => void;
  onCollapse?: () => void;
  /** True while the debounced save after reorder is in flight */
  isSavingOrder?: boolean;
  /** Question indices with save/sync validation errors (sidebar dot). */
  errorIndexes?: ReadonlySet<number>;
  /** When false, drag-and-drop reorder is disabled (e.g. invalid question content). */
  canReorder?: boolean;
};

export function QuestionListSidebar({
  questions,
  activeIndex,
  onSelect,
  onReorderList,
  onCollapse,
  isSavingOrder = false,
  errorIndexes,
  canReorder = true,
}: Props) {
  return (
    <nav
      aria-label="Question list"
      className="min-w-0 space-y-1"
      aria-busy={isSavingOrder}
    >
      <div className="mb-2 flex min-w-0 items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-text-muted text-xs font-medium uppercase tracking-wide">
            Question list
          </p>
          {isSavingOrder ? (
            <span
              className="inline-flex items-center gap-1 text-text-muted"
              aria-live="polite"
            >
              <Spinner
 className="size-3.5 shrink-0 "
 aria-hidden
 />
              <span className="text-[10px] font-medium normal-case tracking-normal">
                Saving…
              </span>
            </span>
          ) : null}
        </div>
        {onCollapse ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 shrink-0 cursor-pointer text-text-muted p-0"
            onClick={onCollapse}
            aria-label="Collapse question list"
            title="Collapse question list"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {!canReorder ? (
        <p className="text-text-muted mb-1 text-xs leading-snug">
          Fix errors before reordering
        </p>
      ) : null}
      <SortableList
        items={questions}
        getItemId={(q) => getQuestionId(q, questions)}
        onReorder={onReorderList}
        disabled={!canReorder}
        className="flex min-w-0 flex-col gap-1"
        aria-label="Questions"
        renderItem={({ item: question, index, dragHandle, isDragging }) => {
          const snippet = sidebarSnippet(question);
          const hasQuestionError = errorIndexes?.has(index) ?? false;
          return (
            <div
              className={cn(
                "flex min-w-0 items-stretch gap-0.5",
                isDragging && "opacity-90"
              )}
            >
              <span
                {...dragHandle}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted",
                  canReorder
                    ? "cursor-grab hover:bg-accent active:cursor-grabbing"
                    : "cursor-not-allowed opacity-60"
                )}
                aria-disabled={!canReorder}
                aria-label={
                  canReorder
                    ? `Reorder: ${snippet}`
                    : `Reordering disabled: ${snippet}`
                }
              >
                <GripVertical className="size-4" aria-hidden />
              </span>
              <Button
                type="button"
                variant={index === activeIndex ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "min-w-0 flex-1 cursor-pointer justify-start gap-2 px-2",
                  index === activeIndex && "font-semibold"
                )}
                onClick={() => onSelect(index)}
                aria-label={
                  hasQuestionError
                    ? `${snippet} — has unresolved errors`
                    : snippet
                }
              >
                {hasQuestionError ? (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-danger"
                    aria-hidden
                  />
                ) : null}
                <span className="min-w-0 truncate text-left">{snippet}</span>
              </Button>
            </div>
          );
        }}
      />
    </nav>
  );
}

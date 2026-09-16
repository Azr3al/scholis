"use client";
import { Checkbox } from "@/components/primitives";

import { QuizRichOptionContent } from "@/components/quiz-v3/shared/quiz-rich-content";
import { sortedQuestionChoiceOptions } from "@/helpers/quiz-v3-choice-option-sort";
import type { QuestionTypeV3 } from "@/types/quiz-v3";

type Props = {
  question: QuestionTypeV3;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
};

export function MultiChoiceSelector({ question, selectedIds, onChange }: Props) {
  const set = new Set(selectedIds);
  const toggle = (id: number, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(Array.from(next));
  };
  return (
    <div className="space-y-2">
      {sortedQuestionChoiceOptions(question).map((o, oi) => (
        <div key={o.id ?? `opt-${oi}`} className="flex items-start gap-2">
          <Checkbox
            id={`cb-${o.id}`}
            className="mt-1"
            checked={o.id != null && set.has(o.id)}
            onCheckedChange={(c) => o.id != null && toggle(o.id, c === true)}
          />
          <label
            htmlFor={`cb-${o.id}`}
            className="cursor-pointer font-normal leading-snug"
          >
            <QuizRichOptionContent body={o.body} />
          </label>
        </div>
      ))}
    </div>
  );
}

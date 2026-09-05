"use client";

import { QuizRichOptionContent } from "@/components/quiz-v3/shared/quiz-rich-content";
import { sortedQuestionChoiceOptions } from "@/helpers/quiz-v3-choice-option-sort";
import { Radio, RadioGroup } from "@/components/primitives";
import type { QuestionTypeV3 } from "@/types/quiz-v3";

type Props = {
  question: QuestionTypeV3;
  selectedId: number | null;
  onChange: (optionId: number) => void;
};

export function SingleChoiceSelector({ question, selectedId, onChange }: Props) {
  const qid = question.id ?? "q";
  return (
    <RadioGroup
      value={selectedId != null ? String(selectedId) : undefined}
      onValueChange={(v) => onChange(Number(v))}
      className="space-y-2"
    >
      {sortedQuestionChoiceOptions(question).map((o, oi) => (
        <div key={o.id ?? `opt-${oi}`} className="flex items-start gap-2">
          <Radio
            value={String(o.id)}
            id={`opt-${qid}-${o.id}`}
            className="mt-1"
          />
          <label
            htmlFor={`opt-${qid}-${o.id}`}
            className="cursor-pointer font-normal leading-snug"
          >
            <QuizRichOptionContent body={o.body} />
          </label>
        </div>
      ))}
    </RadioGroup>
  );
}

'use client';

import { RichTextView } from '@/components/rich-text/rich-text-view';
import { TakeRichTextAnswer, emptyAnswerDoc } from '@/components/take/take-rich-text-answer';
import { cn } from '@/lib/utils';
import type { PublicQuestion, ResponseValue } from '@scholis/schema';

interface Props {
  question: PublicQuestion;
  value: ResponseValue | undefined;
  onChange: (value: ResponseValue) => void;
  disabled?: boolean;
}

// Pure presentation. It renders whatever the question says and hands back a
// ResponseValue — it doesn't know what's correct or whether the answer counts.
export const QuestionView = ({ question, value, onChange, disabled = false }: Props) => {
  const hasPrompt = question.body.content.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div>
        {/* The whole document, not a flattened string. plainText() used to be
            enough when a body was one paragraph; it silently dropped every
            image and equation the moment those existed. */}
        {hasPrompt ? (
          <RichTextView doc={question.body} className="font-medium" />
        ) : (
          <p className="font-medium">Untitled question</p>
        )}
        <p className="text-xs text-muted-foreground">
          {question.points} {question.points === 1 ? 'mark' : 'marks'}
        </p>
      </div>

      {question.type === 'choice' && (
        <div className="flex flex-col gap-2">
          {question.options.map((option) => {
            const selected = value?.kind === 'choice' ? value.optionIds.includes(option.id) : false;
            const multi = question.settings.selection === 'multi';

            return (
              <label
                key={option.id}
                className={cn(
                  'transition-ui flex cursor-pointer items-center gap-3 rounded-md border p-3',
                  // The native input carries the focus ring; lift it onto the row
                  // so keyboard users can see where they are.
                  'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                  selected ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name={question.id}
                  className="size-4 shrink-0 accent-primary"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => {
                    const current = value?.kind === 'choice' ? value.optionIds : [];
                    const next = multi
                      ? selected
                        ? current.filter((id) => id !== option.id)
                        : [...current, option.id]
                      : [option.id];
                    onChange({ kind: 'choice', optionIds: next });
                  }}
                  data-testid={`option-${option.id}`}
                />
                <RichTextView doc={option.body} className="text-sm" />
              </label>
            );
          })}
        </div>
      )}

      {question.type === 'short' && (
        <TakeRichTextAnswer
          questionId={question.id}
          label="Your answer"
          value={value?.kind === 'short' ? value.doc : emptyAnswerDoc()}
          onChange={(doc) => {
            onChange({ kind: 'short', doc });
          }}
          disabled={disabled}
          placeholder="Type your answer"
          data-testid={`short-${question.id}`}
        />
      )}

      {question.type === 'essay' && (
        <TakeRichTextAnswer
          questionId={question.id}
          label="Your answer"
          value={value?.kind === 'essay' ? value.doc : emptyAnswerDoc()}
          onChange={(doc) => {
            onChange({ kind: 'essay', doc });
          }}
          disabled={disabled}
          placeholder="Write your answer here"
          data-testid={`essay-${question.id}`}
          minWords={question.settings.minWords}
          maxWords={question.settings.maxWords}
          /*
            Essays are the taker's own words, so the clipboard is refused here
            and only here. Short answers and choices are untouched, and typing —
            including every keyboard shortcut that is not a paste — still works.
            A determined student can retype what they copied; this is
            deterrence, not prevention.
          */
          refusePaste
        />
      )}
    </div>
  );
};

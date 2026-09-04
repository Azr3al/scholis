'use client';

import { RichTextEditor, emptyDoc } from '@/components/editor/rich-text-editor';
import { Label } from '@/components/ui/label';
import { plainText } from '@/lib/take/rich-text';
import { cn } from '@/lib/utils';
import type { RichText } from '@scholis/schema';
import { emptyRichText } from '@scholis/schema';

interface Props {
  questionId: string;
  label: string;
  value: RichText;
  onChange: (doc: RichText) => void;
  disabled?: boolean;
  /** Full toolbar on student short and essay answers; compact only on choice options. */
  compact?: boolean;
  placeholder?: string;
  'data-testid'?: string;
  minWords?: number | null;
  maxWords?: number | null;
  /** Refuse the clipboard. Set on essays only — see question-view. */
  refusePaste?: boolean;
}

const countWords = (text: string): number => {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
};

export const TakeRichTextAnswer = ({
  questionId,
  label,
  value,
  onChange,
  disabled = false,
  compact = false,
  placeholder,
  'data-testid': testId,
  minWords = null,
  maxWords = null,
  refusePaste = false,
}: Props) => {
  const text = plainText(value);
  const bounded = minWords !== null || maxWords !== null;
  const words = countWords(text);
  const short = minWords !== null && words < minWords;
  const long = maxWords !== null && words > maxWords;

  return (
    <div className="grid gap-2">
      <Label htmlFor={questionId}>{label}</Label>
      <RichTextEditor
        key={questionId}
        value={value.content.length === 0 ? emptyDoc : value}
        onChange={onChange}
        disabled={disabled}
        compact={compact}
        refusePaste={refusePaste}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(testId === undefined ? {} : { 'data-testid': testId })}
      />
      {bounded && (
        <p
          className={cn('text-xs', short || long ? 'text-destructive' : 'text-muted-foreground')}
          aria-live="polite"
          data-testid={`word-count-${questionId}`}
        >
          {words} {words === 1 ? 'word' : 'words'}
          {minWords !== null && ` · at least ${String(minWords)}`}
          {maxWords !== null && ` · at most ${String(maxWords)}`}
        </p>
      )}
    </div>
  );
};

export const emptyAnswerDoc = (): RichText => emptyRichText();

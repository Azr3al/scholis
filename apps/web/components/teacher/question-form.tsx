'use client';

import { ChoiceRubricEditor } from '@/components/teacher/choice-rubric-editor';
import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, type AuthoredQuestion } from '@/lib/api';
import {
  buildEvenSplitRubric,
  resolveChoiceRubric,
  resolveShortGradingMode,
  ShortGradingMode,
  type ChoiceRubricTier,
  type RichText,
} from '@scholis/schema';
import { useEffect, useId, useState } from 'react';

type Kind = 'single' | 'multi' | 'short' | 'essay';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'single', label: 'Single choice' },
  { value: 'multi', label: 'Multiple choice' },
  { value: 'short', label: 'Short answer' },
  { value: 'essay', label: 'Essay' },
];

const kindLabel = (value: Kind): string => KINDS.find((k) => k.value === value)?.label ?? value;

interface FieldErrors {
  points?: string;
}

interface OptionRow {
  id: string;
  body: RichText;
  isCorrect: boolean;
}

const EMPTY_DOC: RichText = { type: 'doc', content: [] };

const BLANK_OPTIONS: OptionRow[] = [
  { id: 'blank-0', body: EMPTY_DOC, isCorrect: false },
  { id: 'blank-1', body: EMPTY_DOC, isCorrect: false },
];

const kindOf = (q: AuthoredQuestion): Kind => {
  if (q.type === 'short') return 'short';
  if (q.type === 'essay') return 'essay';
  return q.settings.selection === 'multi' ? 'multi' : 'single';
};

const initialRubricFor = (q: AuthoredQuestion): ChoiceRubricTier[] | null => {
  if (q.type !== 'choice' || q.settings.selection !== 'multi') return null;
  const correctCount = q.options.filter((option) => option.isCorrect).length;
  if (correctCount < 2) return null;
  return resolveChoiceRubric(q.settings, correctCount, q.points);
};

interface Props {
  initial: AuthoredQuestion;
  onSaved: () => void;
  onCancel?: () => void;
}

export const QuestionForm = ({ initial, onSaved, onCancel }: Props) => {
  const groupName = useId();

  const [kind] = useState<Kind>(kindOf(initial));
  const [prompt, setPrompt] = useState<RichText>(initial.body);
  const [points, setPoints] = useState(String(initial.points));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const [options, setOptions] = useState<OptionRow[]>(
    initial.type === 'choice'
      ? initial.options.map((o) => ({ id: o.id, body: o.body, isCorrect: o.isCorrect }))
      : BLANK_OPTIONS,
  );

  const [accepted, setAccepted] = useState<string[]>(
    initial.type === 'short'
      ? initial.acceptedAnswers.length > 0
        ? initial.acceptedAnswers
        : ['']
      : [''],
  );

  const [rubric, setRubric] = useState<ChoiceRubricTier[] | null>(() => initialRubricFor(initial));

  const [shortGradingMode, setShortGradingMode] = useState<ShortGradingMode>(() =>
    initial.type === 'short'
      ? resolveShortGradingMode(initial.settings)
      : ShortGradingMode.Manual,
  );
  const [caseSensitive, setCaseSensitive] = useState(() =>
    initial.type === 'short' ? initial.settings.caseSensitive : false,
  );

  const choosing = kind === 'single' || kind === 'multi';
  const correctCount = options.filter((option) => option.isCorrect).length;
  const needsRubric = kind === 'multi' && correctCount >= 2;
  const parsedPoints = Number(points);
  const maxPoints = Number.isFinite(parsedPoints) && parsedPoints >= 1 ? parsedPoints : initial.points;

  useEffect(() => {
    if (!needsRubric) {
      setRubric(null);
      return;
    }

    setRubric((current) => {
      if (current?.length !== correctCount + 1) {
        return buildEvenSplitRubric(correctCount, maxPoints);
      }
      const top = current[correctCount];
      if (top !== undefined && top.points !== maxPoints) {
        return current.map((tier, index) =>
          index === correctCount ? { ...tier, points: maxPoints } : tier,
        );
      }
      return current;
    });
  }, [correctCount, maxPoints, needsRubric]);

  const correctIndex = options.findIndex((option) => option.isCorrect);

  const setCorrect = (index: number) => {
    setOptions((rows) =>
      rows.map((row, i) =>
        kind === 'single'
          ? { ...row, isCorrect: i === index }
          : i === index
            ? { ...row, isCorrect: !row.isCorrect }
            : row,
      ),
    );
  };

  const buildQuestion = () => {
    const body = prompt;
    const pts = Number(points);

    if (kind === 'short') {
      const rubricMode = shortGradingMode === ShortGradingMode.Rubric;
      return {
        type: 'short' as const,
        body,
        points: pts,
        settings: {
          gradingMode: shortGradingMode,
          caseSensitive: rubricMode ? caseSensitive : false,
        },
        acceptedAnswers: rubricMode
          ? accepted.map((a) => a.trim()).filter((a) => a !== '')
          : [],
      };
    }

    if (kind === 'essay') {
      return {
        type: 'essay' as const,
        body,
        points: pts,
        settings: { minWords: null, maxWords: null },
      };
    }

    const optionCorrectCount = options.filter((option) => option.isCorrect).length;
    let finalRubric: ChoiceRubricTier[] | null = null;
    if (kind === 'multi' && optionCorrectCount >= 2) {
      finalRubric =
        rubric !== null && rubric.length === optionCorrectCount + 1
          ? rubric
          : buildEvenSplitRubric(optionCorrectCount, pts);
    }

    return {
      type: 'choice' as const,
      body,
      points: pts,
      settings: {
        selection: kind === 'multi' ? ('multi' as const) : ('single' as const),
        variant: 'plain' as const,
        rubric: finalRubric,
      },
      options: options.map((o) => ({ body: o.body, isCorrect: o.isCorrect })),
    };
  };

  const submit = () => {
    setError(null);

    const errors: FieldErrors = {};
    if (points.trim() === '' || Number(points) < 1) {
      errors.points = 'Enter how many marks this question is worth.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    const question = buildQuestion();

    void api
      .updateQuestion({ questionId: initial.id, question })
      .then(() => {
        setSaving(false);
        onSaved();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not save that question.');
        setSaving(false);
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit question</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={`${groupName}-kind`}>Type</Label>
            <Select value={kind} disabled>
              <SelectTrigger id={`${groupName}-kind`} className="w-full" data-testid="question-kind">
                <SelectValue>{(value) => kindLabel(value as Kind)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Delete and re-add the question to change its type.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Question</Label>
            <RichTextEditor
              value={prompt}
              autoFocus
              placeholder="Ask the question. Add an image, a link, or an equation."
              onChange={(doc) => {
                setPrompt(doc);
              }}
              data-testid="question-prompt"
            />
          </div>

          {choosing && (
            <div className="grid gap-2">
              <Label>Options</Label>
              {kind === 'single' ? (
                <RadioGroup
                  value={correctIndex >= 0 ? String(correctIndex) : ''}
                  onValueChange={(value) => {
                    if (value !== '') setCorrect(Number(value));
                  }}
                  className="gap-2"
                  data-testid="option-rows"
                >
                  {options.map((option, index) => (
                    <div key={option.id} className="flex items-center gap-2 py-0.5">
                      <RadioGroupItem
                        value={String(index)}
                        aria-label={`Option ${String(index + 1)} is correct`}
                        data-testid={`option-correct-${String(index)}`}
                      />
                      <div className="flex-1">
                        <RichTextEditor
                          compact
                          value={option.body}
                          placeholder={`Option ${String(index + 1)}`}
                          onChange={(doc) => {
                            setOptions((rows) =>
                              rows.map((row, i) => (i === index ? { ...row, body: doc } : row)),
                            );
                          }}
                          data-testid={`option-body-${String(index)}`}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={options.length <= 2}
                        onClick={() => {
                          setOptions((rows) => rows.filter((_, i) => i !== index));
                        }}
                        aria-label={`Remove option ${String(index + 1)}`}
                        data-testid={`option-remove-${String(index)}`}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <div className="flex flex-col gap-3" data-testid="option-rows">
                  {options.map((option, index) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={option.isCorrect}
                        onCheckedChange={() => {
                          setCorrect(index);
                        }}
                        aria-label={`Option ${String(index + 1)} is correct`}
                        data-testid={`option-correct-${String(index)}`}
                      />
                      <div className="flex-1">
                        <RichTextEditor
                          compact
                          value={option.body}
                          placeholder={`Option ${String(index + 1)}`}
                          onChange={(doc) => {
                            setOptions((rows) =>
                              rows.map((row, i) => (i === index ? { ...row, body: doc } : row)),
                            );
                          }}
                          data-testid={`option-body-${String(index)}`}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={options.length <= 2}
                        onClick={() => {
                          setOptions((rows) => rows.filter((_, i) => i !== index));
                        }}
                        aria-label={`Remove option ${String(index + 1)}`}
                        data-testid={`option-remove-${String(index)}`}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => {
                  setOptions((rows) => [
                    ...rows,
                    { id: crypto.randomUUID(), body: EMPTY_DOC, isCorrect: false },
                  ]);
                }}
                data-testid="option-add"
              >
                Add option
              </Button>
            </div>
          )}

          {needsRubric && rubric !== null && (
            <ChoiceRubricEditor
              rubric={rubric}
              maxPoints={maxPoints}
              disabled={saving}
              onChange={setRubric}
            />
          )}

          {kind === 'short' && (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Grading</Label>
                <RadioGroup
                  value={shortGradingMode}
                  onValueChange={(value) => {
                    setShortGradingMode(value as ShortGradingMode);
                  }}
                  className="gap-2"
                  data-testid="short-grading-mode"
                  disabled={saving}
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem
                      value={ShortGradingMode.Manual}
                      id={`${groupName}-short-manual`}
                      data-testid="short-grading-manual"
                    />
                    <div className="grid gap-0.5">
                      <Label htmlFor={`${groupName}-short-manual`} className="font-normal">
                        Mark manually
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        You score each response in Submissions. Results stay unreleased until
                        marked.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem
                      value={ShortGradingMode.Rubric}
                      id={`${groupName}-short-rubric`}
                      data-testid="short-grading-rubric"
                    />
                    <div className="grid gap-0.5">
                      <Label htmlFor={`${groupName}-short-rubric`} className="font-normal">
                        Grade automatically
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Full marks if the answer exactly matches any accepted answer.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {shortGradingMode === ShortGradingMode.Rubric && (
                <>
                  <div className="grid gap-2">
                    <Label>Accepted answers</Label>
                    <div className="flex flex-col gap-2" data-testid="accepted-rows">
                      {accepted.map((answer, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={answer}
                            disabled={saving}
                            aria-label={`Accepted answer ${String(index + 1)}`}
                            onChange={(e) => {
                              const { value } = e.target;
                              setAccepted((rows) =>
                                rows.map((row, i) => (i === index ? value : row)),
                              );
                            }}
                            data-testid={`accepted-body-${String(index)}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={saving || accepted.length <= 1}
                            onClick={() => {
                              setAccepted((rows) => rows.filter((_, i) => i !== index));
                            }}
                            aria-label={`Remove accepted answer ${String(index + 1)}`}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      disabled={saving}
                      onClick={() => {
                        setAccepted((rows) => [...rows, '']);
                      }}
                      data-testid="accepted-add"
                    >
                      Add answer
                    </Button>
                  </div>

                  <div className="grid gap-0.5">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`${groupName}-case-sensitive`}
                        checked={caseSensitive}
                        disabled={saving}
                        onCheckedChange={(checked) => {
                          setCaseSensitive(checked);
                        }}
                        data-testid="short-case-sensitive"
                      />
                      <Label htmlFor={`${groupName}-case-sensitive`} className="font-normal">
                        Case-sensitive matching
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">
                      When on, &ldquo;Paris&rdquo; and &ldquo;paris&rdquo; are treated as different
                      answers. When off, letter case is ignored.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {kind === 'essay' && (
            <p className="text-xs text-muted-foreground">
              Essays are marked by hand. Results stay unreleased until every one has a mark.
            </p>
          )}

          <div className="grid gap-2">
            <Label htmlFor={`${groupName}-points`}>Marks</Label>
            <Input
              id={`${groupName}-points`}
              type="number"
              min={1}
              value={points}
              aria-invalid={fieldErrors.points !== undefined}
              onChange={(e) => {
                setPoints(e.target.value);
                if (fieldErrors.points !== undefined) {
                  setFieldErrors((current) => {
                    const next = { ...current };
                    delete next.points;
                    return next;
                  });
                }
              }}
              data-testid="question-points"
            />
            {fieldErrors.points !== undefined && (
              <p className="text-sm text-destructive">{fieldErrors.points}</p>
            )}
          </div>

          {error !== null && (
            <p className="text-sm text-destructive" data-testid="question-form-error">
              {error}
            </p>
          )}

          <div className="scroll-mb-36 flex items-center gap-2">
            <Button type="submit" disabled={saving} data-testid="save-question">
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            {onCancel !== undefined && (
              <Button type="button" variant="ghost" onClick={onCancel} data-testid="cancel-edit">
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

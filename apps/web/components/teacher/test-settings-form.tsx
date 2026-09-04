'use client';

import { PresetButtons } from '@/components/teacher/preset-buttons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TestDetail } from '@/lib/api';
import { plainText, textDoc } from '@/lib/take/rich-text';
import {
  ATTEMPT_PRESETS,
  formatAttemptPresetLabel,
  formatPresetLabel,
  TIME_PRESETS,
} from '@/lib/teacher/time-presets';
import type { RichText } from '@scholis/schema';
import { useEffect, useRef, useState } from 'react';

export interface TestSettingsValues {
  title: string;

  timeLimitMinutes: number | null;

  allowNavigation: boolean;
  testTakingMode: boolean;
  maxAttempts: number;

  introBody: RichText;

  outroBody: RichText;

  randomizeQuestionOrder: boolean;
}

interface FieldErrors {
  title?: string;

  attempts?: string;
}

interface Props {
  test: TestDetail;

  saving: boolean;

  error: string | null;

  onChange: (values: TestSettingsValues) => void;
}

const validate = (title: string, attempts: string): FieldErrors => {
  const errors: FieldErrors = {};

  if (title.trim() === '') errors.title = 'Enter a title for this test.';

  if (attempts.trim() === '') errors.attempts = 'Enter how many attempts students may take.';

  return errors;
};

const toPayload = (
  title: string,

  limit: string,

  attempts: string,

  allowNavigation: boolean,
  testTakingMode: boolean,
  description: string,
  outro: string,
  randomizeQuestionOrder: boolean,
): TestSettingsValues | null => {
  const errors = validate(title, attempts);
  if (Object.keys(errors).length > 0) return null;
  return {
    title: title.trim(),
    timeLimitMinutes: limit === '' ? null : Number(limit),
    allowNavigation,
    testTakingMode,
    maxAttempts: Number(attempts),
    introBody: textDoc(description.trim()),
    outroBody: textDoc(outro.trim()),
    randomizeQuestionOrder,
  };
};

const descriptionEqual = (a: RichText, b: RichText): boolean =>
  plainText(a).trim() === plainText(b).trim();

export const TestSettingsForm = ({ test, saving, error, onChange }: Props) => {
  const [title, setTitle] = useState(test.title);

  const [limit, setLimit] = useState(
    test.timeLimitMinutes === null ? '' : String(test.timeLimitMinutes),
  );

  const [attempts, setAttempts] = useState(String(test.maxAttempts));

  const [allowNavigation, setAllowNavigation] = useState(test.allowNavigation);
  const [testTakingMode, setTestTakingMode] = useState(test.testTakingMode);
  const [description, setDescription] = useState(() => plainText(test.introBody));
  const [outro, setOutro] = useState(() => plainText(test.outroBody));
  const [randomizeQuestionOrder, setRandomizeQuestionOrder] = useState(test.randomizeQuestionOrder);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const skipNextEmit = useRef(true);

  useEffect(() => {
    setTitle(test.title);

    setLimit(test.timeLimitMinutes === null ? '' : String(test.timeLimitMinutes));

    setAttempts(String(test.maxAttempts));

    setAllowNavigation(test.allowNavigation);
    setTestTakingMode(test.testTakingMode);
    setDescription(plainText(test.introBody));
    setOutro(plainText(test.outroBody));
    setRandomizeQuestionOrder(test.randomizeQuestionOrder);
    skipNextEmit.current = true;
  }, [test.id, test.updatedAt]);

  useEffect(() => {
    if (skipNextEmit.current) {
      skipNextEmit.current = false;

      return;
    }

    const errors = validate(title, attempts);

    setFieldErrors(errors);
    const payload = toPayload(
      title,
      limit,
      attempts,
      allowNavigation,
      testTakingMode,
      description,
      outro,
      randomizeQuestionOrder,
    );
    if (payload === null) return;

    const unchanged =
      payload.title === test.title &&
      payload.timeLimitMinutes === test.timeLimitMinutes &&
      payload.allowNavigation === test.allowNavigation &&
      payload.testTakingMode === test.testTakingMode &&
      payload.maxAttempts === test.maxAttempts &&
      payload.randomizeQuestionOrder === test.randomizeQuestionOrder &&
      descriptionEqual(payload.introBody, test.introBody) &&
      descriptionEqual(payload.outroBody, test.outroBody);
    if (unchanged) return;

    onChange(payload);
  }, [
    title,
    limit,
    attempts,
    allowNavigation,
    testTakingMode,
    description,
    outro,
    randomizeQuestionOrder,
    onChange,
    test,
  ]);

  const clearTitleError = () => {
    if (fieldErrors.title !== undefined) {
      setFieldErrors((current) => {
        const next = { ...current };

        delete next.title;

        return next;
      });
    }
  };

  const clearAttemptsError = () => {
    if (fieldErrors.attempts !== undefined) {
      setFieldErrors((current) => {
        const next = { ...current };

        delete next.attempts;

        return next;
      });
    }
  };

  return (
    <Card data-testid="test-settings" aria-busy={saving}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Test settings</CardTitle>

        <p className="text-xs text-muted-foreground" data-testid="test-settings-status">
          {saving ? 'Saving…' : 'Saved'}
        </p>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="test-title">Title</Label>

            <Input
              id="test-title"

              value={title}

              aria-invalid={fieldErrors.title !== undefined}

              onChange={(e) => {
                setTitle(e.target.value);

                clearTitleError();
              }}

              data-testid="test-settings-title"
            />

            {fieldErrors.title !== undefined && (
              <p className="text-sm text-destructive">{fieldErrors.title}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="test-description">Test description</Label>
            <Textarea
              id="test-description"
              value={description}
              placeholder="Instructions or context shown before question 1."
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              data-testid="test-settings-intro"
            />
            <p className="text-xs text-muted-foreground">
              Students see this at the start of the test, before the first question.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="test-outro">Quiz-end message (optional)</Label>
            <Textarea
              id="test-outro"
              value={outro}
              placeholder="Thank you for completing the test."
              onChange={(e) => {
                setOutro(e.target.value);
              }}
              data-testid="test-settings-outro"
            />
            <p className="text-xs text-muted-foreground">
              Shown to students immediately after they hand in.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2">
            <div className="grid gap-2 sm:contents">
              <Label htmlFor="test-limit" className="sm:col-start-1 sm:row-start-1">
                Time limit
              </Label>
              <div className="flex items-end sm:col-start-1 sm:row-start-2">
                <PresetButtons
                  presets={TIME_PRESETS}
                  value={limit}
                  onSelect={setLimit}
                  formatLabel={formatPresetLabel}
                />
              </div>
              <Input
                id="test-limit"
                type="number"
                min={1}
                value={limit}
                className="sm:col-start-1 sm:row-start-3"
                onChange={(e) => {
                  setLimit(e.target.value);
                }}
                placeholder="No limit"
                data-testid="test-settings-limit"
              />
              <p className="text-xs text-muted-foreground sm:col-start-1 sm:row-start-4">
                In minutes. Leave blank for none.
              </p>
            </div>

            <div className="grid gap-2 sm:contents">
              <Label htmlFor="test-attempts" className="sm:col-start-2 sm:row-start-1">
                Attempts allowed
              </Label>
              <div className="flex items-end sm:col-start-2 sm:row-start-2">
                <PresetButtons
                  presets={ATTEMPT_PRESETS}
                  value={attempts}
                  onSelect={(next) => {
                    setAttempts(next);
                    clearAttemptsError();
                  }}
                  formatLabel={formatAttemptPresetLabel}
                />
              </div>
              <Input
                id="test-attempts"
                type="number"
                min={1}
                max={20}
                value={attempts}
                className="sm:col-start-2 sm:row-start-3"
                aria-invalid={fieldErrors.attempts !== undefined}
                onChange={(e) => {
                  setAttempts(e.target.value);
                  clearAttemptsError();
                }}
                data-testid="test-settings-attempts"
              />
              {fieldErrors.attempts !== undefined ? (
                <p className="text-sm text-destructive sm:col-start-2 sm:row-start-4">
                  {fieldErrors.attempts}
                </p>
              ) : (
                <p
                  className="text-xs text-muted-foreground sm:col-start-2 sm:row-start-4"
                  aria-hidden="true"
                >
                  {' '}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="test-navigation"

              checked={allowNavigation}

              onCheckedChange={(checked) => {
                setAllowNavigation(checked);
              }}

              data-testid="test-settings-navigation"
            />

            <Label htmlFor="test-navigation" className="cursor-pointer font-normal">
              Let students move back to earlier questions
            </Label>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="test-randomize"
              checked={randomizeQuestionOrder}
              onCheckedChange={(checked) => {
                setRandomizeQuestionOrder(checked);
              }}
              data-testid="test-settings-randomize"
            />
            <div className="grid gap-1">
              <Label htmlFor="test-randomize" className="cursor-pointer font-normal">
                Randomize order for students
              </Label>
              <p className="text-xs text-muted-foreground">
                Each student sees questions in a different order within each section. You always see
                the order below when editing and marking.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="test-taking-mode"
              checked={testTakingMode}
              onCheckedChange={(checked) => {
                setTestTakingMode(checked);
              }}
              data-testid="test-settings-taking-mode"
            />
            <div className="grid gap-1">
              <Label htmlFor="test-taking-mode" className="cursor-pointer font-normal">
                Discourage copying question text
              </Label>
              {/*
                Said plainly, because a teacher who believes this stops cheating
                will invigilate less carefully than one who knows it does not.
              */}
              <p className="text-xs text-muted-foreground">
                Turns off selection, right-click and copy shortcuts during the test, and stops
                pasting into written answers. It slows down casual copying — anyone determined can
                still screenshot or retype.
              </p>
            </div>
          </div>
          {error !== null && (
            <p className="text-sm text-destructive" data-testid="test-settings-error">
              {error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

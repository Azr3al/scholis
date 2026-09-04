'use client';

import { PresetButtons } from '@/components/teacher/preset-buttons';
import { TestListByTag } from '@/components/teacher/test-list-by-tag';
import { TestTagFilter } from '@/components/teacher/test-tag-filter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type TestSummary } from '@/lib/api';
import { buildTestListDisplay } from '@/lib/teacher/test-tag-views';
import {
  ATTEMPT_PRESETS,
  formatAttemptPresetLabel,
  formatPresetLabel,
  TIME_PRESETS,
} from '@/lib/teacher/time-presets';
import { textDoc } from '@/lib/take/rich-text';
import type { TestTag } from '@scholis/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface FieldErrors {
  title?: string;
  attempts?: string;
}

export default function TeacherPage() {
  const router = useRouter();
  const [tests, setTests] = useState<TestSummary[] | null>(null);
  const [orgTags, setOrgTags] = useState<TestTag[] | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(() => new Set());
  const [creatingTag, setCreatingTag] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const [limit, setLimit] = useState('');
  const [allowNavigation, setAllowNavigation] = useState(true);
  const [attempts, setAttempts] = useState('1');
  const [description, setDescription] = useState('');
  const [outro, setOutro] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const load = useCallback(() => {
    Promise.all([api.listTests(), api.listTags()])
      .then(([nextTests, nextTags]) => {
        setTests(nextTests);
        setOrgTags(nextTags);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 403) {
          router.replace('/sign-in');
          return;
        }
        setError(e instanceof Error ? e.message : 'Could not load your tests.');
      });
  }, [router]);

  useEffect(load, [load]);

  const listDisplay = useMemo(() => {
    if (tests === null || orgTags === null) return null;
    return buildTestListDisplay(tests, orgTags, selectedTagIds, search);
  }, [orgTags, search, selectedTagIds, tests]);

  const create = async () => {
    const errors: FieldErrors = {};
    if (title.trim() === '') errors.title = 'Enter a title for this test.';
    if (attempts.trim() === '') errors.attempts = 'Enter how many attempts students may take.';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setCreating(true);
    setError(null);
    setFieldErrors({});
    try {
      const created = await api.createTest({
        title,
        timeLimitMinutes: limit === '' ? null : Number(limit),
        allowNavigation,
        maxAttempts: Number(attempts),
        ...(description.trim() === '' ? {} : { introBody: textDoc(description.trim()) }),
        ...(outro.trim() === '' ? {} : { outroBody: textDoc(outro.trim()) }),
        idempotencyKey: crypto.randomUUID(),
      });
      setTitle('');
      setDescription('');
      setOutro('');
      setTests((current) => [created, ...(current ?? [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that test.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your tests</h1>

      <Card>
        <CardHeader>
          <CardTitle>New test</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            aria-busy={creating}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                aria-invalid={fieldErrors.title !== undefined}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (fieldErrors.title !== undefined) {
                    setFieldErrors((current) => {
                      const next = { ...current };
                      delete next.title;
                      return next;
                    });
                  }
                }}
                placeholder="End of term biology"
                data-testid="new-test-title"
              />
              {fieldErrors.title !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.title}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Test description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                placeholder="Instructions or context shown before question 1."
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
                data-testid="new-test-intro"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="outro">Quiz-end message (optional)</Label>
              <Textarea
                id="outro"
                value={outro}
                placeholder="Thank you for completing the test."
                onChange={(e) => {
                  setOutro(e.target.value);
                }}
                data-testid="new-test-outro"
              />
              <p className="text-xs text-muted-foreground">
                Shown to students immediately after they hand in.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2">
              <div className="grid gap-2 sm:contents">
                <Label htmlFor="limit" className="sm:col-start-1 sm:row-start-1">
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
                  id="limit"
                  type="number"
                  min={1}
                  value={limit}
                  className="sm:col-start-1 sm:row-start-3"
                  onChange={(e) => {
                    setLimit(e.target.value);
                  }}
                  placeholder="No limit"
                  data-testid="new-test-limit"
                />
                <p className="text-xs text-muted-foreground sm:col-start-1 sm:row-start-4">
                  In minutes. Leave blank for none.
                </p>
              </div>

              <div className="grid gap-2 sm:contents">
                <Label htmlFor="attempts" className="sm:col-start-2 sm:row-start-1">
                  Attempts allowed
                </Label>
                <div className="flex items-end sm:col-start-2 sm:row-start-2">
                  <PresetButtons
                    presets={ATTEMPT_PRESETS}
                    value={attempts}
                    onSelect={(next) => {
                      setAttempts(next);
                      if (fieldErrors.attempts !== undefined) {
                        setFieldErrors((current) => {
                          const updated = { ...current };
                          delete updated.attempts;
                          return updated;
                        });
                      }
                    }}
                    formatLabel={formatAttemptPresetLabel}
                  />
                </div>
                <Input
                  id="attempts"
                  type="number"
                  min={1}
                  max={20}
                  value={attempts}
                  className="sm:col-start-2 sm:row-start-3"
                  aria-invalid={fieldErrors.attempts !== undefined}
                  onChange={(e) => {
                    setAttempts(e.target.value);
                    if (fieldErrors.attempts !== undefined) {
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.attempts;
                        return next;
                      });
                    }
                  }}
                  data-testid="new-test-attempts"
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
                id="navigation"
                checked={allowNavigation}
                onCheckedChange={(checked) => {
                  setAllowNavigation(checked);
                }}
                data-testid="new-test-navigation"
              />
              <Label htmlFor="navigation" className="cursor-pointer font-normal">
                Let students move back to earlier questions
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={creating} data-testid="create-test">
                {creating ? 'Creating…' : 'Create'}
              </Button>
              <p className="text-xs text-muted-foreground">
                You can change these on the draft page before publishing.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-2">
        <Label htmlFor="test-search">Search tests</Label>
        <Input
          id="test-search"
          value={search}
          placeholder="Filter by title…"
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          data-testid="test-search"
        />
      </div>

      <TestTagFilter
        tags={orgTags ?? []}
        selectedTagIds={selectedTagIds}
        creating={creatingTag}
        onSelectAll={() => {
          setSelectedTagIds(new Set());
        }}
        onToggleTag={(tagId) => {
          setSelectedTagIds((current) => {
            const next = new Set(current);
            if (next.has(tagId)) next.delete(tagId);
            else next.add(tagId);
            return next;
          });
        }}
        onCreateTag={async (name) => {
          setCreatingTag(true);
          try {
            const created = await api.createTag({ name });
            setOrgTags((current) => [...(current ?? []), created]);
          } finally {
            setCreatingTag(false);
          }
        }}
      />

      <TestListByTag
        display={listDisplay}
        loading={tests === null || orgTags === null}
        search={search}
        hasTests={(tests?.length ?? 0) > 0}
      />
    </main>
  );
}

'use client';

import { ManageTagsList } from '@/components/teacher/manage-tags-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { TestTag } from '@scholis/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function ManageTagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<TestTag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .listTags()
      .then(setTags)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 403) {
          router.replace('/sign-in');
          return;
        }
        setError(e instanceof Error ? e.message : 'Could not load tags.');
      });
  }, [router]);

  useEffect(load, [load]);

  const submitNewTag = async () => {
    const name = newTagName.trim();
    if (name === '') return;

    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createTag({ name });
      setTags((current) => (current === null ? [created] : [...current, created]));
      setNewTagName('');
      setCreatingTag(false);
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : 'Could not create that tag.');
    } finally {
      setCreating(false);
    }
  };

  if (error !== null && tags === null) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-destructive">{error}</p>
      </main>
    );
  }

  if (tags === null) {
    return (
      <main
        className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground"
        aria-busy="true"
      >
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/teacher"
            className="text-sm text-muted-foreground transition-ui hover:text-foreground"
          >
            ← All tests
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Manage tags</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rename or delete organization tags. Assign tags to tests from the test editor.
          </p>
        </div>

        {!creatingTag ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 self-start"
            disabled={creating}
            onClick={() => {
              setCreatingTag(true);
              setCreateError(null);
            }}
            data-testid="manage-tag-create-open"
          >
            <Plus className="size-3.5" />
            New tag
          </Button>
        ) : (
          <form
            className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
            onSubmit={(e) => {
              e.preventDefault();
              void submitNewTag();
            }}
          >
            <Input
              value={newTagName}
              maxLength={50}
              placeholder="Tag name"
              className="h-8 w-full sm:w-36"
              autoFocus
              disabled={creating}
              onChange={(e) => {
                setNewTagName(e.target.value);
              }}
              data-testid="manage-tag-create-input"
            />
            <Button type="submit" size="sm" disabled={creating || newTagName.trim() === ''}>
              {creating ? 'Adding…' : 'Add'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={creating}
              onClick={() => {
                setCreatingTag(false);
                setNewTagName('');
                setCreateError(null);
              }}
            >
              Cancel
            </Button>
          </form>
        )}
      </header>

      {createError !== null && <p className="text-sm text-destructive">{createError}</p>}

      {tags.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p>No tags yet. Create one with New tag above.</p>
        </div>
      ) : (
        <ManageTagsList tags={tags} onTagsChange={setTags} />
      )}
    </main>
  );
}

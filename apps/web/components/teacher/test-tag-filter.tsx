'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { TestTag } from '@scholis/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export const TestTagFilter = ({
  tags,
  selectedTagIds,
  onSelectAll,
  onToggleTag,
  onCreateTag,
  creating,
}: {
  tags: TestTag[];
  selectedTagIds: Set<string>;
  onSelectAll: () => void;
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string) => Promise<void>;
  creating: boolean;
}) => {
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const allSelected = selectedTagIds.size === 0;

  const submitNewTag = async () => {
    const name = newTagName.trim();
    if (name === '') return;
    setCreateError(null);
    try {
      await onCreateTag(name);
      setNewTagName('');
      setCreatingTag(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create that tag.');
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="tag-filter">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={allSelected}
          className={allSelected ? 'border-primary bg-muted' : undefined}
          onClick={onSelectAll}
          data-testid="tag-filter-all"
        >
          All
        </Button>

        {tags.map((tag) => {
          const active = selectedTagIds.has(tag.id);
          return (
            <Button
              key={tag.id}
              type="button"
              variant={active ? 'default' : 'outline'}
              size="sm"
              aria-pressed={active}
              onClick={() => {
                onToggleTag(tag.id);
              }}
              data-testid={`tag-filter-${tag.id}`}
            >
              {tag.name}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!creatingTag ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={creating}
              className="border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setCreatingTag(true);
                setCreateError(null);
              }}
              data-testid="tag-create-open"
            >
              <Plus className="size-3.5" />
              New tag
            </Button>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
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
                data-testid="tag-create-input"
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
        </div>

        <Link
          href="/teacher/tags"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          data-testid="manage-tags-link"
        >
          Manage tags
        </Link>
      </div>

      {createError !== null && <p className="text-sm text-destructive">{createError}</p>}
    </div>
  );
};

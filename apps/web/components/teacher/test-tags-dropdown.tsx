'use client';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import type { TestTag } from '@scholis/contracts';
import { ChevronDownIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export const TestTagsDropdown = ({
  testId,
  assignedTagIds,
  onAssignedChange,
}: {
  testId: string;
  assignedTagIds: string[];
  onAssignedChange: (tagIds: string[], tagNames: Map<string, string>) => void;
}) => {
  const router = useRouter();
  const [orgTags, setOrgTags] = useState<TestTag[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(assignedTagIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingIds = useRef<string[] | null>(null);
  const orgTagsRef = useRef<TestTag[] | null>(null);

  useEffect(() => {
    orgTagsRef.current = orgTags;
  }, [orgTags]);

  useEffect(() => {
    api
      .listTags()
      .then(setOrgTags)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not load tags.');
      });
  }, []);

  useEffect(() => {
    setSelected(new Set(assignedTagIds));
  }, [assignedTagIds]);

  useEffect(
    () => () => {
      if (saveTimer.current !== undefined) clearTimeout(saveTimer.current);
    },
    [],
  );

  const scheduleSave = (tagIds: string[]) => {
    pendingIds.current = tagIds;
    if (saveTimer.current !== undefined) clearTimeout(saveTimer.current);
    setSaving(true);
    setError(null);

    saveTimer.current = setTimeout(() => {
      const payload = pendingIds.current;
      if (payload === null) {
        setSaving(false);
        return;
      }

      void api
        .setTestTags({ testId, tagIds: payload })
        .then(() => {
          const names = new Map((orgTagsRef.current ?? []).map((tag) => [tag.id, tag.name]));
          onAssignedChange(payload, names);
          setSaving(false);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'Could not save tags.');
          setSaving(false);
        });
    }, 500);
  };

  const toggle = (tagId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(tagId);
      else next.delete(tagId);
      scheduleSave([...next]);
      return next;
    });
  };

  const triggerLabel =
    selected.size === 0 ? 'Add tag' : saving ? 'Saving…' : `Tags (${String(selected.size)})`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={saving}
          className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          data-testid="add-tag-trigger"
        >
          {triggerLabel}
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuPositioner align="end">
            <DropdownMenuContent className="min-w-44">
              {orgTags === null && (
                <DropdownMenuItem disabled>Loading tags…</DropdownMenuItem>
              )}
              {orgTags?.length === 0 && (
                <DropdownMenuItem disabled data-testid="no-org-tags">
                  No tags yet — create on home page
                </DropdownMenuItem>
              )}
              {orgTags?.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag.id}
                  checked={selected.has(tag.id)}
                  disabled={saving}
                  onCheckedChange={(checked) => {
                    toggle(tag.id, checked);
                  }}
                  data-testid={`test-tag-${tag.id}`}
                >
                  {tag.name}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="manage-tags-dropdown-link"
                onClick={() => {
                  router.push('/teacher/tags');
                }}
              >
                Manage tags
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPositioner>
        </DropdownMenuPortal>
      </DropdownMenu>
      {error !== null && (
        <span className="sr-only" role="alert">
          {error}
        </span>
      )}
    </>
  );
};

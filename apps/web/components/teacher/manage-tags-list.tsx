'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { TestTag } from '@scholis/contracts';
import { useState } from 'react';

export const ManageTagsList = ({
  tags,
  onTagsChange,
}: {
  tags: TestTag[];
  onTagsChange: (next: TestTag[]) => void;
}) => {
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingTagId, setSavingTagId] = useState<string | null>(null);
  const [pendingDeleteTag, setPendingDeleteTag] = useState<TestTag | null>(null);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

  const startRename = (tag: TestTag) => {
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditError(null);
    setPendingDeleteTag(null);
  };

  const cancelRename = () => {
    setEditingTagId(null);
    setEditName('');
    setEditError(null);
  };

  const saveRename = async () => {
    if (editingTagId === null) return;
    const name = editName.trim();
    if (name === '') {
      setEditError('Enter a tag name.');
      return;
    }

    setSavingTagId(editingTagId);
    setEditError(null);
    try {
      const updated = await api.updateTag({ tagId: editingTagId, name });
      onTagsChange(tags.map((tag) => (tag.id === updated.id ? updated : tag)));
      cancelRename();
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : 'Could not rename that tag.');
    } finally {
      setSavingTagId(null);
    }
  };

  const confirmDelete = async () => {
    if (pendingDeleteTag === null) return;
    const tagId = pendingDeleteTag.id;
    setDeletingTagId(tagId);
    try {
      await api.deleteTag(tagId);
      onTagsChange(tags.filter((tag) => tag.id !== tagId));
      setPendingDeleteTag(null);
    } catch {
      // Keep panel open for retry.
    } finally {
      setDeletingTagId(null);
    }
  };

  const rowBusy = (tagId: string) =>
    savingTagId === tagId || deletingTagId === tagId || pendingDeleteTag?.id === tagId;

  return (
    <ul className="flex flex-col gap-3" aria-busy={savingTagId !== null || deletingTagId !== null}>
      {tags.map((tag) => {
        const editing = editingTagId === tag.id;
        const deleting = pendingDeleteTag?.id === tag.id;

        if (deleting) {
          return (
            <li
              key={tag.id}
              className="flex flex-col gap-3 rounded-md border p-4"
              data-testid={`manage-tag-delete-${tag.id}`}
            >
              <p className="text-sm">
                Delete tag &ldquo;{tag.name}&rdquo;? Tests keep their other tags; this label is
                removed from your organization.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deletingTagId === tag.id}
                  data-testid="manage-tag-delete-confirm"
                  onClick={() => {
                    void confirmDelete();
                  }}
                >
                  {deletingTagId === tag.id ? 'Deleting…' : 'Delete tag'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deletingTagId === tag.id}
                  data-testid="manage-tag-delete-cancel"
                  onClick={() => {
                    setPendingDeleteTag(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </li>
          );
        }

        return (
          <li
            key={tag.id}
            className="flex flex-wrap items-center gap-2 rounded-md border p-3"
            data-testid={`manage-tag-row-${tag.id}`}
          >
            {editing ? (
              <>
                <Input
                  value={editName}
                  maxLength={50}
                  className="h-8 w-full sm:w-48"
                  autoFocus
                  disabled={savingTagId === tag.id}
                  onChange={(e) => {
                    setEditName(e.target.value);
                  }}
                  data-testid={`manage-tag-rename-input-${tag.id}`}
                />
                <Button
                  size="sm"
                  disabled={savingTagId === tag.id || editName.trim() === ''}
                  data-testid={`manage-tag-save-${tag.id}`}
                  onClick={() => {
                    void saveRename();
                  }}
                >
                  {savingTagId === tag.id ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={savingTagId === tag.id}
                  onClick={cancelRename}
                >
                  Cancel
                </Button>
                {editError !== null && (
                  <p className="w-full text-sm text-destructive">{editError}</p>
                )}
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 font-medium">{tag.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rowBusy(tag.id) || editingTagId !== null}
                  data-testid={`manage-tag-rename-${tag.id}`}
                  onClick={() => {
                    startRename(tag);
                  }}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={rowBusy(tag.id) || editingTagId !== null}
                  data-testid={`manage-tag-delete-${tag.id}`}
                  onClick={() => {
                    setPendingDeleteTag(tag);
                    cancelRename();
                  }}
                >
                  Delete
                </Button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
};

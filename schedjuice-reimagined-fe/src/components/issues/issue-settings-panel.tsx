"use client";
import { Button, Field, Input, Skeleton, useToast } from "@/components/primitives";

import { FormFieldErrorSlot } from "@/components/form/field-error-slot";
import { RequiredMark } from "@/components/form/required-mark";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import { issuesKeys, useIssueStatuses } from "@/hooks/issues/use-issues-board";
import {
  createIssueStatus,
  deleteIssueStatus,
  updateIssueStatus,
} from "@/lib/issues-api";
import type { IssueStatus } from "@/types/issue";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, EditPencil as Pencil, Trash as Trash2, Xmark as X } from "iconoir-react";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";

function useInlineRename({
  name,
  onSave,
  isSaving,
}: {
  name: string;
  onSave: (nextName: string) => void;
  isSaving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    if (!editing) {
      setDraft(name);
    }
  }, [name, editing]);

  function cancel() {
    setDraft(name);
    setEditing(false);
  }

  function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      cancel();
      return;
    }
    onSave(trimmed);
    setEditing(false);
  }

  return {
    editing,
    draft,
    setDraft,
    startEditing: () => setEditing(true),
    cancel,
    save,
    isSaving,
  };
}

function StatusRow({
  status,
  index,
  onRename,
  onDelete,
  isRenaming,
  isDeleting,
}: {
  status: IssueStatus;
  index: number;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  isRenaming: boolean;
  isDeleting: boolean;
}) {
  const rename = useInlineRename({
    name: status.name,
    onSave: (nextName) => onRename(status.id, nextName),
    isSaving: isRenaming,
  });

  return (
    <li
      className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2.5 transition-colors hover:bg-muted/30"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5 text-sm">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
          style={{ background: status.color }}
          aria-hidden
        />
        {rename.editing ? (
          <Input
            value={rename.draft}
            onChange={(event) => rename.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                rename.save();
              }
              if (event.key === "Escape") {
                rename.cancel();
              }
            }}
            className="h-8 flex-1"
            autoFocus
            disabled={isRenaming}
          />
        ) : (
          <>
            <span className="truncate font-medium">{status.name}</span>
            {status.behavior !== "NORMAL" && (
              <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                {status.behavior}
              </span>
            )}
          </>
        )}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {rename.editing ? (
          <>
            <button
              type="button"
              aria-label={`Save ${status.name}`}
              disabled={isRenaming || !rename.draft.trim()}
              onClick={rename.save}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98] disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Cancel rename"
              disabled={isRenaming}
              onClick={rename.cancel}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Rename status ${status.name}`}
              onClick={rename.startEditing}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {status.behavior === "NORMAL" && (
              <button
                type="button"
                aria-label={`Delete status ${status.name}`}
                disabled={isDeleting}
                onClick={() => onDelete(status.id)}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive active:scale-[0.98]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-11 w-full rounded-md" />
      ))}
    </ul>
  );
}

export function IssueSettingsPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const statusesQuery = useIssueStatuses();
  const statuses = statusesQuery.data ?? [];

  const statusForm = useForm<{ name: string }>({ defaultValues: { name: "" } });
  const nameValue = statusForm.watch("name");

  const addStatus = useMutation({
    mutationFn: (name: string) =>
      createIssueStatus({
        name,
        behavior: "NORMAL",
        order: statuses.length + 1,
        color: "#64748b",
      }),
    onSuccess: () => {
      statusForm.reset({ name: "" });
      queryClient.invalidateQueries({ queryKey: issuesKeys.statuses });
      toast.add({ title: "Status added" });
    },
    onError: () => {
      toast.add({ title: "Could not add status", type: "error" });
    },
  });

  const renameStatus = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      updateIssueStatus(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: issuesKeys.statuses });
      toast.add({ title: "Status renamed" });
    },
    onError: () => {
      toast.add({ title: "Could not rename status", type: "error" });
    },
  });

  const removeStatus = useMutation({
    mutationFn: (id: number) => deleteIssueStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: issuesKeys.statuses });
      toast.add({ title: "Status removed" });
    },
    onError: () => {
      toast.add({ title: "Could not remove status", type: "error" });
    },
  });

  return (
    <section className="max-w-xl space-y-4 rounded-lg border bg-card p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Statuses</h2>
        <p className="text-sm text-muted-foreground">
          Kanban columns on the issues board. Click the pencil to rename; protected
          statuses cannot be deleted.
        </p>
      </div>

      {statusesQuery.isLoading ? (
        <ListSkeleton />
      ) : statusesQuery.isError ? (
        <p className="text-sm text-destructive">Could not load statuses.</p>
      ) : statuses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No statuses yet.</p>
      ) : (
        <ul className="space-y-2">
          {statuses.map((status, index) => (
            <StatusRow
              key={status.id}
              status={status}
              index={index}
              onRename={(id, name) => renameStatus.mutate({ id, name })}
              onDelete={(id) => removeStatus.mutate(id)}
              isRenaming={renameStatus.isPending}
              isDeleting={removeStatus.isPending}
            />
          ))}
        </ul>
      )}

      <div {...statusForm}>
        <form
          onSubmit={statusForm.handleSubmit(
            (values) => addStatus.mutate(values.name.trim()),
            () => scheduleScrollToFirstFormError(statusForm),
          )}
          className="border-t pt-4"
        >
          <Controller
            control={statusForm.control}
            name="name"
            rules={{ required: "Name is required" }}
            render={({ field, fieldState }) => (
              <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
                <Field.Label>
                  New status
                  <RequiredMark />
                </Field.Label>
                <div className="flex items-center gap-2">
                  <div>
                    <Input {...field} placeholder="e.g. Blocked" className="flex-1" />
                  </div>
                  <Button
                    type="submit"
                    disabled={!nameValue?.trim()}
                    isLoading={addStatus.isPending}
                    className="shrink-0 active:scale-[0.98]"
                  >
                    Add
                  </Button>
                </div>
                <FormFieldErrorSlot message={fieldState.error?.message} />
              </Field.Root>
            )}
          />
        </form>
      </div>
    </section>
  );
}

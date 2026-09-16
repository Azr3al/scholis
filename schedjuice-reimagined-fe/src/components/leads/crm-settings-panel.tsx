"use client";
import { Button, Field, Input, Skeleton, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import { FormFieldErrorSlot } from "@/components/form/field-error-slot";
import { RequiredMark } from "@/components/form/required-mark";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import {
  useLeadSources,
  useLeadStatuses,
  leadsKeys,
} from "@/hooks/leads/use-leads-board";
import {
  createSource,
  createStatus,
  deleteSource,
  deleteStatus,
  updateSource,
  updateStatus,
} from "@/lib/leads-api";
import type { LeadSource, LeadStatus } from "@/types/lead";
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
  status: LeadStatus;
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
      className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-surface px-3 py-2.5 transition-colors hover:bg-muted/30"
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
              <span
                className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("shrink-0 text-[10px] uppercase tracking-wide")}
              >
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
              className="rounded p-1 text-text-muted transition-colors hover:text-text-primary active:scale-[0.98] disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Cancel rename"
              disabled={isRenaming}
              onClick={rename.cancel}
              className="rounded p-1 text-text-muted transition-colors hover:text-text-primary active:scale-[0.98]"
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
              className="rounded p-1 text-text-muted transition-colors hover:text-text-primary active:scale-[0.98]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {status.behavior === "NORMAL" && (
              <button
                type="button"
                aria-label={`Delete status ${status.name}`}
                disabled={isDeleting}
                onClick={() => onDelete(status.id)}
                className="rounded p-1 text-text-muted transition-colors hover:text-destructive active:scale-[0.98]"
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

function SourceRow({
  source,
  index,
  onRename,
  onDelete,
  isRenaming,
  isDeleting,
}: {
  source: LeadSource;
  index: number;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  isRenaming: boolean;
  isDeleting: boolean;
}) {
  const rename = useInlineRename({
    name: source.name,
    onSave: (nextName) => onRename(source.id, nextName),
    isSaving: isRenaming,
  });

  return (
    <li
      className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-surface px-3 py-2.5 transition-colors hover:bg-muted/30"
      style={{ animationDelay: `${index * 40}ms` }}
    >
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
          className="h-8 min-w-0 flex-1"
          autoFocus
          disabled={isRenaming}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {source.name}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        {rename.editing ? (
          <>
            <button
              type="button"
              aria-label={`Save ${source.name}`}
              disabled={isRenaming || !rename.draft.trim()}
              onClick={rename.save}
              className="rounded p-1 text-text-muted transition-colors hover:text-text-primary active:scale-[0.98] disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Cancel rename"
              disabled={isRenaming}
              onClick={rename.cancel}
              className="rounded p-1 text-text-muted transition-colors hover:text-text-primary active:scale-[0.98]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Rename source ${source.name}`}
              onClick={rename.startEditing}
              className="rounded p-1 text-text-muted transition-colors hover:text-text-primary active:scale-[0.98]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Delete source ${source.name}`}
              disabled={isDeleting}
              onClick={() => onDelete(source.id)}
              className="rounded p-1 text-text-muted transition-colors hover:text-destructive active:scale-[0.98]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-11 w-full rounded-md" />
      ))}
    </ul>
  );
}

function AddNameForm({
  label,
  placeholder,
  form,
  onSubmit,
  isPending,
}: {
  label: string;
  placeholder: string;
  form: ReturnType<typeof useForm<{ name: string }>>;
  onSubmit: (name: string) => void;
  isPending: boolean;
}) {
  const nameValue = form.watch("name");

  return (
    <div {...form}>
      <form
        onSubmit={form.handleSubmit(
          (values) => onSubmit(values.name.trim()),
          () => scheduleScrollToFirstFormError(form),
        )}
        className="border-t pt-4"
      >
        <Controller
          control={form.control}
          name="name"
          rules={{ required: "Name is required" }}
          render={({ field, fieldState }) => (
            <Field.Root name={field.name} invalid={Boolean(fieldState.error)}>
              <Field.Label>
                {label}
                <RequiredMark />
              </Field.Label>
              <div className="flex items-center gap-2">
                <div>
                  <Input {...field} placeholder={placeholder} className="flex-1" />
                </div>
                <Button
                  type="submit"
                  disabled={!nameValue?.trim()}
                  isLoading={isPending}
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
  );
}

export function CrmSettingsPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const statusesQuery = useLeadStatuses();
  const sourcesQuery = useLeadSources();
  const statuses = statusesQuery.data ?? [];
  const sources = sourcesQuery.data ?? [];

  const statusForm = useForm<{ name: string }>({
    defaultValues: { name: "" },
  });
  const sourceForm = useForm<{ name: string }>({
    defaultValues: { name: "" },
  });

  const addStatus = useMutation({
    mutationFn: (name: string) =>
      createStatus({
        name,
        behavior: "NORMAL",
        order: statuses.length + 1,
        color: "#64748b",
      }),
    onSuccess: () => {
      statusForm.reset({ name: "" });
      queryClient.invalidateQueries({ queryKey: leadsKeys.statuses });
      toast.add({ title: "Status added" });
    },
    onError: () => {
      toast.add({ title: "Could not add status", type: "error" });
    },
  });

  const renameStatus = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      updateStatus(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.statuses });
      toast.add({ title: "Status renamed" });
    },
    onError: () => {
      toast.add({ title: "Could not rename status", type: "error" });
    },
  });

  const removeStatus = useMutation({
    mutationFn: (id: number) => deleteStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.statuses });
      toast.add({ title: "Status removed" });
    },
    onError: () => {
      toast.add({ title: "Could not remove status", type: "error" });
    },
  });

  const addSource = useMutation({
    mutationFn: (name: string) => createSource({ name, is_active: true }),
    onSuccess: () => {
      sourceForm.reset({ name: "" });
      queryClient.invalidateQueries({ queryKey: leadsKeys.sources });
      toast.add({ title: "Source added" });
    },
    onError: () => {
      toast.add({ title: "Could not add source", type: "error" });
    },
  });

  const renameSource = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      updateSource(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.sources });
      toast.add({ title: "Source renamed" });
    },
    onError: () => {
      toast.add({ title: "Could not rename source", type: "error" });
    },
  });

  const removeSource = useMutation({
    mutationFn: (id: number) => deleteSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.sources });
      toast.add({ title: "Source removed" });
    },
    onError: () => {
      toast.add({ title: "Could not remove source", type: "error" });
    },
  });

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_1fr]">
      <section className="space-y-4 rounded-lg border bg-surface p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Statuses</h2>
          <p className="text-sm text-text-muted">
            Kanban columns on the leads board. Click the pencil to rename; protected
            statuses cannot be deleted.
          </p>
        </div>

        {statusesQuery.isLoading ? (
          <ListSkeleton />
        ) : statusesQuery.isError ? (
          <p className="text-sm text-destructive">Could not load statuses.</p>
        ) : statuses.length === 0 ? (
          <p className="text-sm text-text-muted">No statuses yet.</p>
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

        <AddNameForm
          label="New status"
          placeholder="e.g. Follow-up scheduled"
          form={statusForm}
          onSubmit={(name) => addStatus.mutate(name)}
          isPending={addStatus.isPending}
        />
      </section>

      <section className="space-y-4 rounded-lg border bg-surface p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Sources</h2>
          <p className="text-sm text-text-muted">
            Where inquiries come from when creating a new lead. Click the pencil to
            rename.
          </p>
        </div>

        {sourcesQuery.isLoading ? (
          <ListSkeleton />
        ) : sourcesQuery.isError ? (
          <p className="text-sm text-destructive">Could not load sources.</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-text-muted">No sources yet.</p>
        ) : (
          <ul className="space-y-2">
            {sources.map((source, index) => (
              <SourceRow
                key={source.id}
                source={source}
                index={index}
                onRename={(id, name) => renameSource.mutate({ id, name })}
                onDelete={(id) => removeSource.mutate(id)}
                isRenaming={renameSource.isPending}
                isDeleting={removeSource.isPending}
              />
            ))}
          </ul>
        )}

        <AddNameForm
          label="New source"
          placeholder="e.g. TikTok DM"
          form={sourceForm}
          onSubmit={(name) => addSource.mutate(name)}
          isPending={addSource.isPending}
        />
      </section>
    </div>
  );
}

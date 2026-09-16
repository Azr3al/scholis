"use client";
import { Button, Dialog, Input, Switch, Textarea, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import {
  createPointType,
  fetchPointTypes,
  updatePointType,
} from "@/lib/points-api";
import type { PointType } from "@/types/points";
import { EditPencil as Pencil, Plus } from "iconoir-react";
import { useUser } from "@/hooks/useUser";
import { canManageActiveStatus } from "@/lib/form/field-visibility";

type PointTypeForm = {
  name: string;
  color: string;
  description: string;
  is_active: boolean;
};

const DEFAULT_COLOR = "#64748b";

function emptyForm(): PointTypeForm {
  return {
    name: "",
    color: DEFAULT_COLOR,
    description: "",
    is_active: true,
  };
}

function formFromType(t: PointType): PointTypeForm {
  return {
    name: t.name,
    color: t.color,
    description: t.description,
    is_active: t.is_active,
  };
}

export function PointTypeConfig() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useUser();
  const canManageActive = canManageActiveStatus(user);
  const { data: types = [], isLoading } = useQuery({
    queryKey: ["point-types"],
    queryFn: fetchPointTypes,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PointType | null>(null);
  const [form, setForm] = useState<PointTypeForm>(emptyForm);

  const sorted = [...types].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("Name is required");
      const payload = {
        name,
        color: form.color,
        description: form.description.trim(),
        sort_order: editing?.sort_order ?? 0,
        is_active: editing && canManageActive ? form.is_active : true,
      };
      if (editing) {
        return updatePointType(editing.id, payload);
      }
      return createPointType(payload);
    },
    onSuccess: () => {
      toast.add({
        title: editing ? "Point type updated." : "Point type created.",
      });
      void qc.invalidateQueries({ queryKey: ["point-types"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: () => {
      toast.add({
        type: "error",
        title: editing
          ? "Could not update point type."
          : "Could not create point type.",
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => updatePointType(id, { is_active: false }),
    onSuccess: () => {
      toast.add({ title: "Point type deactivated." });
      void qc.invalidateQueries({ queryKey: ["point-types"] });
    },
    onError: () => {
      toast.add({
        type: "error",
        title: "Could not deactivate point type.",
      });
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(t: PointType) {
    setEditing(t);
    setForm(formFromType(t));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
  }

  const nameInvalid = !form.name.trim();
  const showActiveToggle = Boolean(editing && canManageActive);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-text-muted">
          Point types are currencies staff can earn or lose. Retired types stay
          in history.
        </p>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Add point type
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-text-muted">No point types yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {sorted.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
                style={{ backgroundColor: t.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-sm font-medium">
                {t.name}
              </span>
              <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                {t.is_active ? "Active" : "Inactive"}
              </span>
              <span className="text-xs tabular-nums text-text-muted">
                #{t.sort_order}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm" aria-label={`Edit ${t.name}`}
                  onClick={() => openEdit(t)}
                >
                  <Pencil className="size-4" />
                </Button>
                {t.is_active ? (
                  <ConfirmationDialog
                    title="Deactivate this point type?"
                    content={`${t.name} will no longer appear when awarding points. Existing balances and history are kept.`}
                    isLoading={deactivateMutation.isPending}
                    onConfirm={() => deactivateMutation.mutate(t.id)}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-text-muted hover:text-destructive"
                    >
                      Deactivate
                    </Button>
                  </ConfirmationDialog>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog.Root
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setDialogOpen(true);
        }}
      >
        <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-md">
          <div>
            <Dialog.Title>
              {editing ? "Edit point type" : "New point type"}
            </Dialog.Title>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="pt-name">Name</label>
              <Input
                id="pt-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pt-color">Color</label>
              <div className="flex items-center gap-2">
                <Input
                  id="pt-color"
                  type="color"
                  value={form.color}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, color: e.target.value }))
                  }
                  className="h-9 w-14 cursor-pointer p-1"
                />
                <Input
                  value={form.color}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, color: e.target.value }))
                  }
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pt-description">Description</label>
              <Textarea
                id="pt-description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
              />
            </div>
            {showActiveToggle ? (
              <div className="flex items-center gap-2">
                <Switch
                  id="pt-active"
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, is_active: checked }))
                  }
                />
                <label htmlFor="pt-active">Active</label>
              </div>
            ) : null}
          </div>
          <div className="gap-2 sm:justify-end">
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={nameInvalid || saveMutation.isPending}
            >
              {saveMutation.isPending
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Create"}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

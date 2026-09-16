"use client";

import { Button, Skeleton, useToast } from "@/components/primitives";
import { EmptyCopy } from "@/components/primitives/empty/empty-copy";
import { EmptyState } from "@/components/primitives/empty/empty-state";
import {
  createUserTeachingSubject,
  deleteUserTeachingSubject,
  fetchUserTeachingSubjects,
  updateUserTeachingSubject,
} from "@/helpers/user-teaching-subjects";
import { staggerItem, staggerList } from "@/lib/sj/motion";
import { parseTeachingSubjectSelection, type UserTeachingSubject } from "@/types/user-teaching-subject";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "iconoir-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import {
  emptyTeachingSubjectForm,
  TeachingSubjectComposer,
  teachingSubjectFormFromRow,
  type TeachingSubjectFormState,
} from "./teaching-subject-composer";
import { TeachingSubjectsList } from "./teaching-subjects-list";

const EMPTY_ROWS: UserTeachingSubject[] = [];

type TeachingSubjectsSectionProps = {
  userId: number;
  canEdit: boolean;
};

export function TeachingSubjectsSection({ userId, canEdit }: TeachingSubjectsSectionProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["user-teaching-subjects", userId], [userId]);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<UserTeachingSubject | null>(null);
  const [form, setForm] = useState<TeachingSubjectFormState>(emptyTeachingSubjectForm);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchUserTeachingSubjects(userId),
  });

  const resolvedRows = rows ?? EMPTY_ROWS;
  const isAdding = composerOpen && composerMode === "add";
  const editingRowId =
    composerOpen && composerMode === "edit" && editing != null ? editing.id : null;

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const closeComposer = () => {
    setComposerOpen(false);
    setEditing(null);
    setForm(emptyTeachingSubjectForm());
  };

  const scrollToEditRow = (rowId: number) => {
    requestAnimationFrame(() => {
      document.getElementById(`teaching-subject-edit-${rowId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyTeachingSubjectForm());
    setComposerMode("add");
    setComposerOpen(true);
  };

  useEffect(() => {
    if (!isAdding) return;
    requestAnimationFrame(() => {
      document.getElementById("teaching-subject-composer-anchor")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [isAdding]);

  const openEdit = (row: UserTeachingSubject) => {
    setEditing(row);
    setForm(teachingSubjectFormFromRow(row));
    setComposerMode("edit");
    setComposerOpen(true);
    scrollToEditRow(row.id);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = parseTeachingSubjectSelection(form.selection);
      if (payload == null) {
        throw new Error("Invalid selection");
      }
      if (editing) {
        return updateUserTeachingSubject(userId, editing.id, payload);
      }
      return createUserTeachingSubject(userId, payload);
    },
    onSuccess: () => {
      toast.add({ title: editing ? "Teaching subject updated" : "Teaching subject added" });
      closeComposer();
      void invalidate();
    },
    onError: () => {
      toast.add({
        title: "Could not save teaching subject",
        description: "Check your selections and try again.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (rowId: number) => deleteUserTeachingSubject(userId, rowId),
    onMutate: (rowId) => setDeletingId(rowId),
    onSuccess: () => {
      toast.add({ title: "Teaching subject removed" });
      void invalidate();
    },
    onError: () => {
      toast.add({ title: "Could not remove teaching subject" });
    },
    onSettled: () => setDeletingId(null),
  });

  const composerProps = {
    userId,
    form,
    onFormChange: setForm,
    editing,
    onSave: () => saveMutation.mutate(),
    onCancel: closeComposer,
    isSaving: saveMutation.isPending,
  };

  return (
    <motion.div
      className="space-y-4"
      variants={staggerList}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={staggerItem} className="flex items-center justify-between gap-3">
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openCreate}
            disabled={composerOpen}
          >
            <Plus className="mr-1 size-4" />
            Add
          </Button>
        ) : null}
      </motion.div>

      {isAdding && canEdit ? (
        <div id="teaching-subject-composer-anchor">
          <TeachingSubjectComposer
            {...composerProps}
            open
            mode="add"
          />
        </div>
      ) : null}

      {isLoading ? (
        <motion.div variants={staggerItem} className="space-y-3" aria-busy="true">
          <Skeleton className="h-[72px] w-full rounded-lg" />
          <Skeleton className="h-[72px] w-full rounded-lg" />
        </motion.div>
      ) : resolvedRows.length === 0 && !isAdding ? (
        <motion.div variants={staggerItem}>
          <EmptyState
            action={
              canEdit ? (
                <Button type="button" variant="secondary" size="sm" onClick={openCreate}>
                  Add teaching subject
                </Button>
              ) : undefined
            }
          >
            <EmptyCopy
              enBefore="No teaching subjects "
              enHighlight="yet"
              enAfter=""
              myBefore="သင်ကြားနိုင်သော ဘာသာရပ်များ "
              myHighlight="မရှိ"
              myAfter="သေးပါ"
            />
          </EmptyState>
        </motion.div>
      ) : resolvedRows.length > 0 ? (
        <motion.div variants={staggerItem}>
          <TeachingSubjectsList
            rows={resolvedRows}
            canEdit={canEdit}
            editingRowId={editingRowId}
            onEdit={openEdit}
            onDelete={(rowId) => deleteMutation.mutate(rowId)}
            deletingId={deletingId}
            renderInlineComposer={() => (
              <TeachingSubjectComposer
                {...composerProps}
                open
                mode="edit"
              />
            )}
          />
        </motion.div>
      ) : null}
    </motion.div>
  );
}

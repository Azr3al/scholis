"use client";

import { Button } from "@/components/primitives";
import {
  TeachingSubjectEntityType,
  teachingSubjectRowLabel,
  type UserTeachingSubject,
} from "@/types/user-teaching-subject";
import { EditPencil as Pencil, Trash as Trash2 } from "iconoir-react";
import type { ReactNode } from "react";

type TeachingSubjectsListProps = {
  rows: UserTeachingSubject[];
  canEdit: boolean;
  editingRowId: number | null;
  onEdit: (row: UserTeachingSubject) => void;
  onDelete: (rowId: number) => void;
  deletingId: number | null;
  renderInlineComposer: (row: UserTeachingSubject) => ReactNode;
};

function rowSubtitle(row: UserTeachingSubject): string | null {
  if (row.entity_type === TeachingSubjectEntityType.ProgramLevel) {
    return row.program_level?.default_category?.name ?? null;
  }
  return null;
}

function rowBadge(row: UserTeachingSubject): string | null {
  if (row.entity_type === TeachingSubjectEntityType.ProgramLevel) {
    return "Level";
  }
  if (row.entity_type === TeachingSubjectEntityType.Category) {
    return "Category";
  }
  return null;
}

export function TeachingSubjectsList({
  rows,
  canEdit,
  editingRowId,
  onEdit,
  onDelete,
  deletingId,
  renderInlineComposer,
}: TeachingSubjectsListProps) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const title = teachingSubjectRowLabel(row);
        const subtitle = rowSubtitle(row);
        const badge = rowBadge(row);
        const isEditing = editingRowId === row.id;

        if (isEditing) {
          return (
            <li key={row.id} id={`teaching-subject-edit-${row.id}`}>
              {renderInlineComposer(row)}
            </li>
          );
        }

        return (
          <li
            key={row.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-text-primary">{title}</p>
                {badge ? (
                  <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-xs text-text-muted">
                    {badge}
                  </span>
                ) : null}
              </div>
              {subtitle ? (
                <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
              ) : null}
            </div>
            {canEdit ? (
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0"
                  aria-label={`Edit ${title}`}
                  onClick={() => onEdit(row)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0"
                  aria-label={`Remove ${title}`}
                  isLoading={deletingId === row.id}
                  disabled={deletingId != null && deletingId !== row.id}
                  onClick={() => onDelete(row.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

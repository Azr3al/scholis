"use client";
import { Button } from "@/components/primitives";

import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import type { DraftReportTypeField } from "@/lib/user-logs/report-type-field-validation";
import { reportTypeFieldLabel } from "@/lib/user-logs/report-type-field-validation";
import { cn } from "@/lib/utils";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { DotsGrid3x3 as GripVertical, EditPencil as Pencil, Trash as Trash2 } from "iconoir-react";

export type ReportFieldDragHandle = {
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
};

export function ReportTypeFieldRow({
  field,
  dragHandle,
  isDragging = false,
  onEdit,
  onRemove,
}: {
  field: DraftReportTypeField;
  dragHandle: ReportFieldDragHandle;
  isDragging?: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border bg-background px-2 py-2",
        isDragging && "opacity-90",
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        {...dragHandle.attributes}
        {...dragHandle.listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="flex flex-1 flex-wrap items-center gap-2 text-left"
      >
        <span className="font-medium">{field.field_label}</span>
        <span className="inline-flex items-center rounded-md border border-border bg-transparent px-2 py-0.5 text-xs font-medium text-text-secondary font-mono text-[10px]">
          {reportTypeFieldLabel(field.field_type)}
        </span>
        <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary text-[10px]">
          {field.is_required ? "Required" : "Optional"}
        </span>
      </button>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm" className="size-8 p-0"
          aria-label={`Edit ${field.field_label}`}
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <ConfirmationDialog
          title="Remove this field?"
          content={`${field.field_label} will be removed from this report type. Existing log entries keep their stored values.`}
          onConfirm={onRemove}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove ${field.field_label}`}
            className="text-muted-foreground hover:text-destructive size-8 p-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </ConfirmationDialog>
      </div>
    </div>
  );
}

"use client";
import { Button, buttonVariants } from "@/components/primitives";

import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";
import { cn } from "@/lib/utils";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { DotsGrid3x3 as GripVertical, Lock, EditPencil as Pencil, Trash as Trash2 } from "iconoir-react";

const STAGE_LABEL: Record<string, string> = {
  registration: "Registration",
  profile_completion: "Completion",
  never: "Optional",
};

export type FieldDragHandleProps = {
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
};

export function FieldRow({
  field,
  dragHandle,
  isDragging = false,
  onEdit,
  onDeactivate,
}: {
  field: CustomFieldDefinitionDto;
  dragHandle: FieldDragHandleProps;
  isDragging?: boolean;
  onEdit: (f: CustomFieldDefinitionDto) => void;
  onDeactivate?: (f: CustomFieldDefinitionDto) => void;
}) {
  const isBuiltin = field.source === "builtin";

  return (
    <div
      className={cn(
        "flex items-center gap-3 bg-background py-2",
        isDragging && "opacity-90"
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
        onClick={() => onEdit(field)}
        className="flex flex-1 flex-wrap items-center gap-2 text-left"
      >
        <span className="font-medium">{field.field_label}</span>
        <span className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("font-mono text-[10px]")}>
          {field.field_type}
        </span>
        <span className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("text-[10px]")}>
          {STAGE_LABEL[field.required_at] ?? "Optional"}
        </span>
        <span className="text-xs text-muted-foreground">
          {field.roles.length ? field.roles.join(", ") : "All roles"}
        </span>
        {field.filled_by === "admin" ? (
          <Lock
            className="h-3 w-3 text-muted-foreground"
            aria-label="Filled by admin"
          />
        ) : null}
        {isBuiltin ? (
          <span
            className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("text-[10px] text-muted-foreground")}
          >
            Built-in
          </span>
        ) : null}
      </button>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm" aria-label={`Edit ${field.field_label}`}
          onClick={() => onEdit(field)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {!isBuiltin && onDeactivate ? (
          <ConfirmationDialog
            title="Hide this field?"
            content={`${field.field_label} will be hidden from all forms and detail views. Existing values stored on records are kept and are not deleted.`}
            onConfirm={() => onDeactivate(field)}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm" aria-label={`Hide ${field.field_label}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </ConfirmationDialog>
        ) : null}
      </div>
    </div>
  );
}

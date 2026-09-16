"use client";

import { Button } from "@/components/primitives";
import React from "react";

export type CheckinControlsProps = {
  isEditMode: boolean;
  isLoading?: boolean;
  onEdit: () => void;
  onDone: () => void;
  onCancel: () => void;

  editLabel?: string;
  doneLabel?: string;
  cancelLabel?: string;

  editIcon?: React.ReactNode;
  doneIcon?: React.ReactNode;
};

export default function DataTableEditControls({
  isEditMode,
  isLoading,
  onEdit,
  onDone,
  onCancel,
  editLabel = "Edit",
  doneLabel = "Done",
  cancelLabel = "Cancel",
  editIcon,
  doneIcon,
}: CheckinControlsProps) {
  return (
    <div className="flex gap-2">
      <Button
        isLoading={!!isLoading}
        onClick={() => {
          if (isEditMode) onDone();
          else onEdit();
        }}
      >
        {isEditMode ? (
          <>
            {doneIcon}
            {doneLabel}
          </>
        ) : (
          <>
            {editIcon}
            {editLabel}
          </>
        )}
      </Button>

      {isEditMode && (
        <Button
          variant="secondary"
          disabled={!!isLoading}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
      )}
    </div>
  );
}

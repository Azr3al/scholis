"use client";
import { Button, Input, Select, Sheet, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createCustomFieldDefinition } from "@/app/client-api/imports";
import { slugifyKey } from "@/lib/custom-fields/definition-defaults";
import useImportStore from "@/store/import-store";

const QUICK_CREATE_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "choice",
  "email",
] as const;

type QuickCreateType = (typeof QUICK_CREATE_TYPES)[number];

type CreateCustomFieldSheetProps = {
  open: boolean;
  columnHeader: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (fieldKey: string) => void;
};

export function CreateCustomFieldSheet({
  open,
  columnHeader,
  onOpenChange,
  onCreated,
}: CreateCustomFieldSheetProps) {
  const roleValue = useImportStore((s) => s.role);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [label, setLabel] = useState("");
  const [type, setType] = useState<QuickCreateType>("text");
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLabel(columnHeader.trim());
      setType("text");
      setFieldError(null);
    }
  }, [open, columnHeader]);

  const createMutation = useMutation({
    mutationFn: () => {
      const trimmed = label.trim();
      if (!trimmed) throw new Error("Label required");
      const field_key = slugifyKey(trimmed);
      return createCustomFieldDefinition({
        field_key,
        field_label: trimmed,
        field_type: type,
      });
    },
    onSuccess: (newField) => {
      void queryClient.invalidateQueries({ queryKey: ["importFields", roleValue] });
      onCreated(newField.field_key);
      toast.add({ title: "Custom field created", description: newField.field_label });
    },
    onError: (err) => {
      const details = (err as { response?: { data?: { details?: Record<string, unknown> } } })
        ?.response?.data?.details;
      const labelMsg = details?.field_label;
      const keyMsg = details?.field_key;
      const first = [labelMsg, keyMsg]
        .flatMap((v) => (Array.isArray(v) ? v : v != null ? [v] : []))
        .map(String)
        .find(Boolean);
      if (first) {
        setFieldError(first);
        return;
      }
      toast.add({
        title: "Could not create field",
        description: "Check the label and try again.",
        type: "error",
      });
    },
  });

  const displayHeader = columnHeader.trim() || "this column";

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup side="right" className="sm:max-w-md">
        <div>
          <Sheet.Title>Create custom field</Sheet.Title>
          <Sheet.Description>
            Add a new field and map it to {displayHeader}.
          </Sheet.Description>
        </div>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="import-field-label">Label</label>
            <Input
              id="import-field-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setFieldError(null);
              }}
              placeholder="e.g. Guardian name"
              aria-invalid={Boolean(fieldError)}
            />
            {fieldError ? (
              <p className="text-sm text-destructive">{fieldError}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label>Type</label>
            <Select value={type} items={QUICK_CREATE_TYPES.map((t) => ({ value: String(t), label: t }))} />
          </div>
        </div>
        <div>
          <Button
            type="button"
            disabled={!label.trim() || createMutation.isLoading}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isLoading ? "Creating…" : "Create & map"}
          </Button>
        </div>
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}

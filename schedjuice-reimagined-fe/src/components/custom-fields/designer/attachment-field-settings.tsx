"use client";

import { Field, Input, Switch } from "@/components/primitives";
import { MultiCombobox } from "@/components/form/multi-combo-box";
import { ToggleGroup, ToggleGroupItem } from "@/components/misc/toggle-group";
import {
  attachmentRulesFromValidationRules,
  FILE_TYPE_PRESETS,
  PRESET_EXTENSIONS,
  type AttachmentFieldRules,
} from "@/lib/custom-fields/attachment-rules";

export function AttachmentFieldSettings({
  value,
  onChange,
}: {
  value: AttachmentFieldRules;
  onChange: (next: AttachmentFieldRules) => void;
}) {
  const extensionOptions = PRESET_EXTENSIONS[value.file_type_preset].map((ext) => ({
    value: ext,
    label: ext,
  }));

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <p className="text-sm font-medium">File upload settings</p>

      <Field.Root>
        <Field.Label>Max file size (MB)</Field.Label>
        <Input
          type="number"
          min={1}
          max={100}
          value={value.max_file_size_mb}
          onChange={(e) =>
            onChange({
              ...value,
              max_file_size_mb: Number(e.target.value) || 1,
            })
          }
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>Max files</Field.Label>
        <Input
          type="number"
          min={1}
          max={10}
          value={value.max_files}
          onChange={(e) =>
            onChange({ ...value, max_files: Number(e.target.value) || 1 })
          }
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>Allowed file types</Field.Label>
        <ToggleGroup
          type="single"
          variant="secondary"
          value={value.file_type_preset}
          onValueChange={(preset) => {
            if (!preset) return;
            onChange({
              ...value,
              file_type_preset: preset as AttachmentFieldRules["file_type_preset"],
              allowed_extensions: [],
            });
          }}
          className="flex flex-wrap justify-start"
        >
          {FILE_TYPE_PRESETS.map((preset) => (
            <ToggleGroupItem key={preset.value} value={preset.value}>
              {preset.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field.Root>

      <Field.Root>
        <Field.Label>Limit to specific extensions (optional)</Field.Label>
        <MultiCombobox
          options={extensionOptions}
          value={value.allowed_extensions}
          onChange={(allowed_extensions) => onChange({ ...value, allowed_extensions })}
          triggerLabel={
            value.allowed_extensions.length
              ? `${value.allowed_extensions.length} selected`
              : "All in preset"
          }
          placeholder="Search extensions…"
        />
      </Field.Root>

      <Field.Root className="flex items-center justify-between">
        <Field.Label className="font-normal">Allow camera capture on mobile</Field.Label>
        <Switch
          checked={value.allow_camera_capture}
          onCheckedChange={(allow_camera_capture) =>
            onChange({ ...value, allow_camera_capture })
          }
        />
      </Field.Root>
    </div>
  );
}

export function attachmentRulesFromDto(
  rules: Record<string, unknown> | null | undefined,
): AttachmentFieldRules {
  return attachmentRulesFromValidationRules(rules);
}

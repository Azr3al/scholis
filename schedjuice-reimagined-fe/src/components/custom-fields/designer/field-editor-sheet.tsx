"use client";
import { Button, Field, Input, Select, Sheet, Switch, buttonVariants } from "@/components/primitives";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/misc/collapsible";
import { MultiCombobox } from "@/components/form/multi-combo-box";
import { ToggleGroup, ToggleGroupItem } from "@/components/misc/toggle-group";

import {
  buildDefinitionPayload,
  slugifyKey,
} from "@/lib/custom-fields/definition-defaults";
import type { CustomFieldDefinitionDto, FieldGroupDto } from "@/types/custom-fields";
import { zodResolver } from "@hookform/resolvers/zod";
import { NavArrowDown as ChevronDown } from "iconoir-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import {
  handleNativeFormInvalid,
  scheduleScrollToFirstFormError,
  setFormErrrors,
} from "@/helpers/form";
import { ChoicesEditor } from "./choices-editor";
import {
  AttachmentFieldSettings,
  attachmentRulesFromDto,
} from "./attachment-field-settings";
import { FieldTypeGrid, type FieldTypeValue } from "./field-type-grid";
import {
  DEFAULT_ATTACHMENT_FIELD_RULES,
  type AttachmentFieldRules,
} from "@/lib/custom-fields/attachment-rules";

const FIELD_TYPE_ENUM = [
  "text",
  "textarea",
  "number",
  "date",
  "datetime",
  "boolean",
  "choice",
  "multichoice",
  "email",
  "url",
  "attachment",
] as const;

const editorSchema = z
  .object({
    field_label: z.string().min(1, "Give the field a label."),
    field_key: z
      .string()
      .min(1)
      .regex(
        /^[a-z0-9_-]+$/,
        "Lowercase letters, numbers, hyphens or underscores."
      ),
    field_type: z.enum(FIELD_TYPE_ENUM),
    required_at: z.enum(["registration", "profile_completion", "never"]),
    roles: z.array(z.string()).default([]),
    filled_by: z.enum(["user", "admin", "both"]).default("both"),
    group: z.number().nullable().default(null),
    is_filterable: z.boolean().default(false),
    description: z.string().default(""),
    choices: z
      .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
      .default([]),
    overrideVisibility: z.boolean().default(false),
    show_on_create: z.boolean().default(false),
    show_on_edit: z.boolean().default(true),
    show_on_detail: z.boolean().default(true),
    attachmentRules: z
      .object({
        max_file_size_mb: z.number().min(1).max(100),
        max_files: z.number().min(1).max(10),
        file_type_preset: z.enum([
          "image",
          "document",
          "image_document",
          "any",
        ]),
        allowed_extensions: z.array(z.string()).default([]),
        allow_camera_capture: z.boolean().default(false),
      })
      .default({ ...DEFAULT_ATTACHMENT_FIELD_RULES }),
  })
  .superRefine((d, ctx) => {
    if (
      (d.field_type === "choice" || d.field_type === "multichoice") &&
      d.choices.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: "Add at least one choice.",
      });
    }
  });

type EditorValues = z.infer<typeof editorSchema>;

const REQUIRED_AT_CAPTION: Record<string, string> = {
  registration: "Must be filled to sign up.",
  profile_completion: "Asked after joining.",
  never: "Optional.",
};

const NONE_GROUP = "__none__";
const NEW_GROUP = "__new__";

export type FieldEditorSubmit = {
  body: Record<string, unknown>;
  id: number | null; // null => create
};

export type FieldEditorSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  groups: FieldGroupDto[];
  /** Active definitions for this entity (client-side uniqueness checks). */
  existingDefinitions?: CustomFieldDefinitionDto[];
  roleOptions: { value: string; label: string }[];
  editing: CustomFieldDefinitionDto | null;
  onCreateGroup: (name: string) => Promise<number>;
  onSubmit: (payload: FieldEditorSubmit) => Promise<void>;
  isSaving?: boolean;
};

function valuesFromEditing(editing: CustomFieldDefinitionDto | null): EditorValues {
  if (!editing) {
    return {
      field_label: "",
      field_key: "",
      field_type: "text",
      required_at: "never",
      roles: [],
      filled_by: "both",
      group: null,
      is_filterable: false,
      description: "",
      choices: [],
      overrideVisibility: false,
      show_on_create: false,
      show_on_edit: true,
      show_on_detail: true,
      attachmentRules: { ...DEFAULT_ATTACHMENT_FIELD_RULES },
    };
  }
  return {
    field_label: editing.field_label,
    field_key: editing.field_key,
    field_type: (FIELD_TYPE_ENUM as readonly string[]).includes(editing.field_type)
      ? (editing.field_type as EditorValues["field_type"])
      : "text",
    required_at: editing.required_at,
    roles: editing.roles ?? [],
    filled_by: editing.filled_by,
    group: editing.group,
    is_filterable: editing.is_filterable,
    description: editing.description ?? "",
    choices: editing.choices ?? [],
    overrideVisibility: false,
    show_on_create: editing.show_on_create,
    show_on_edit: editing.show_on_edit,
    show_on_detail: editing.show_on_detail,
    attachmentRules:
      editing.field_type === "attachment"
        ? attachmentRulesFromDto(editing.validation_rules)
        : { ...DEFAULT_ATTACHMENT_FIELD_RULES },
  };
}

export function FieldEditorSheet({
  open,
  onOpenChange,
  entityType,
  groups,
  existingDefinitions = [],
  roleOptions,
  editing,
  onCreateGroup,
  onSubmit,
  isSaving = false,
}: FieldEditorSheetProps) {
  const form = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: valuesFromEditing(editing),
  });

  const keyDirty = useRef(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [attachmentRules, setAttachmentRules] = useState<AttachmentFieldRules>(
    DEFAULT_ATTACHMENT_FIELD_RULES,
  );

  const isBuiltin = editing?.source === "builtin";
  const isEditing = Boolean(editing);

  useEffect(() => {
    if (open) {
      const next = valuesFromEditing(editing);
      form.reset(next);
      setAttachmentRules(next.attachmentRules);
      keyDirty.current = Boolean(editing);
      setNewGroupName("");
    }
  }, [open, editing, form]);

  const fieldType = form.watch("field_type");
  const requiredAt = form.watch("required_at");
  const overrideVisibility = form.watch("overrideVisibility");
  const showsChoices = fieldType === "choice" || fieldType === "multichoice";
  const isAttachment = fieldType === "attachment";

  useEffect(() => {
    if (isAttachment) {
      form.setValue("is_filterable", false, { shouldDirty: true });
      if (requiredAt === "registration") {
        form.setValue("required_at", "never", { shouldDirty: true });
      }
    }
  }, [form, isAttachment, requiredAt]);

  const onFormSubmit = form.handleSubmit(
    async (v) => {
      const others = existingDefinitions.filter((d) => d.id !== editing?.id);
      let hasLocalConflict = false;
      if (others.some((d) => d.field_label === v.field_label)) {
        form.setError("field_label", {
          type: "validate",
          message: "A field with this label already exists.",
        });
        hasLocalConflict = true;
      }
      if (!isEditing && others.some((d) => d.field_key === v.field_key)) {
        form.setError("field_key", {
          type: "validate",
          message: "A field with this key already exists.",
        });
        hasLocalConflict = true;
      }
      if (hasLocalConflict) {
        scheduleScrollToFirstFormError(form);
        return;
      }

      const body = buildDefinitionPayload({
        entity_type: entityType,
        field_key: v.field_key,
        field_label: v.field_label,
        field_type: v.field_type,
        required_at: v.required_at,
        roles: v.roles,
        filled_by: v.filled_by,
        is_filterable: v.is_filterable,
        description: v.description,
        group: v.group,
        choices: v.choices,
        visibilityOverride: v.overrideVisibility
          ? {
              show_on_create: v.show_on_create,
              show_on_edit: v.show_on_edit,
              show_on_detail: v.show_on_detail,
            }
          : undefined,
        attachmentRules: v.field_type === "attachment" ? attachmentRules : undefined,
      });
      if (isBuiltin) {
        delete body.field_key;
        delete body.field_type;
        delete body.entity_type;
        delete body.choices;
      }
      try {
        await onSubmit({ body, id: editing?.id ?? null });
      } catch (err) {
        if (setFormErrrors(err, form)) {
          scheduleScrollToFirstFormError(form);
        }
        // Parent toasts non-field failures; keep the sheet open either way.
      }
    },
    () => scheduleScrollToFirstFormError(form)
  );

  const handleGroupChange = (raw: string) => {
    if (raw === NEW_GROUP) {
      setCreatingGroup(true);
      return;
    }
    setCreatingGroup(false);
    form.setValue("group", raw === NONE_GROUP ? null : Number(raw), {
      shouldDirty: true,
    });
  };

  const commitNewGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    const id = await onCreateGroup(name);
    form.setValue("group", id, { shouldDirty: true });
    setCreatingGroup(false);
    setNewGroupName("");
  };

  const groupValue = (() => {
    const g = form.watch("group");
    return g == null ? NONE_GROUP : String(g);
  })();

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <div>
          <Sheet.Title>{isEditing ? "Edit field" : "Add field"}</Sheet.Title>
          <Sheet.Description>
            {isBuiltin
              ? "Built-in field. The key and type are fixed; you can change how it behaves."
              : "Set what the field is, when it is required, and who fills it."}
          </Sheet.Description>
        </div>

          <form
            onSubmit={onFormSubmit}
            onInvalidCapture={handleNativeFormInvalid}
            className="flex flex-1 flex-col gap-6 py-4"
          >
            {/* Essentials */}
            <section className="space-y-4">
              <Controller
                control={form.control}
                name="field_label"
                render={({ field, fieldState }) => (
                  <Field.Root name="field_label" invalid={Boolean(fieldState.error)}>
                    <Field.Label>Label</Field.Label>
                    
                      <Input
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (!keyDirty.current && !isEditing) {
                            form.setValue("field_key", slugifyKey(e.target.value));
                          }
                        }}
                      />
                    
                    {fieldState.error?.message ? (
                      <Field.Error>{fieldState.error.message}</Field.Error>
                    ) : null}
                  </Field.Root>)}
              />

              <div className="space-y-2">
                <label>Type</label>
                <FieldTypeGrid
                  value={fieldType}
                  onChange={(v) =>
                    form.setValue("field_type", v as FieldTypeValue, {
                      shouldDirty: true,
                    })
                  }
                  disabled={isEditing}
                />
                {isEditing ? (
                  <p className="text-xs text-muted-foreground">
                    The type is fixed after a field is created.
                  </p>
                ) : null}
              </div>

              {showsChoices ? (
                <Controller
                  control={form.control}
                  name="choices"
                  render={({ field, fieldState }) => (
                    <Field.Root name="choices" invalid={Boolean(fieldState.error)}>
                      
                        <ChoicesEditor value={field.value} onChange={field.onChange} />
                      
                      {fieldState.error?.message ? (
                      <Field.Error>{fieldState.error.message}</Field.Error>
                    ) : null}
                    </Field.Root>)}
                />
              ) : null}

              {isAttachment ? (
                <AttachmentFieldSettings
                  value={attachmentRules}
                  onChange={setAttachmentRules}
                />
              ) : null}

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-4 w-4" />
                  Advanced
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <Controller
                    control={form.control}
                    name="field_key"
                    render={({ field, fieldState }) => (
                      <Field.Root name="field_key" invalid={Boolean(fieldState.error)}>
                        <Field.Label>Field key</Field.Label>
                        
                          <Input
                            {...field}
                            disabled={isEditing || isBuiltin}
                            className="font-mono"
                            onChange={(e) => {
                              keyDirty.current = true;
                              field.onChange(e);
                            }}
                          />
                        
                        <p>
                          Used in stored data, not shown to people filling the form.
                        </p>
                        {fieldState.error?.message ? (
                      <Field.Error>{fieldState.error.message}</Field.Error>
                    ) : null}
                      </Field.Root>)}
                  />
                </CollapsibleContent>
              </Collapsible>
            </section>

            {/* Behavior */}
            <section className="space-y-4 border-t pt-4">
              <Field.Root>
                <Field.Label>When is it required?</Field.Label>
                <ToggleGroup
                  type="single"
                  variant="secondary"
                  value={requiredAt}
                  onValueChange={(v) => {
                    if (v) form.setValue("required_at", v as EditorValues["required_at"], { shouldDirty: true });
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="registration" disabled={isAttachment}>
                    Registration
                  </ToggleGroupItem>
                  <ToggleGroupItem value="profile_completion">After joining</ToggleGroupItem>
                  <ToggleGroupItem value="never">Optional</ToggleGroupItem>
                </ToggleGroup>
                <p>{REQUIRED_AT_CAPTION[requiredAt]}</p>
                {isAttachment ? (
                  <p className="text-xs text-muted-foreground">
                    Attachment fields cannot be required at registration.
                  </p>
                ) : null}
              </Field.Root>

              {roleOptions.length > 0 ? (
                <Controller
                  control={form.control}
                  name="roles"
                  render={({ field, fieldState }) => (
                    <Field.Root name="roles" invalid={Boolean(fieldState.error)} className="flex flex-col gap-2">
                      <Field.Label>Roles</Field.Label>
                      <MultiCombobox
                        options={roleOptions}
                        value={field.value}
                        onChange={field.onChange}
                        triggerLabel={
                          field.value.length
                            ? `${field.value.length} selected`
                            : "Everyone"
                        }
                        placeholder="Search roles…"
                      />
                      <p>
                        Leave empty to apply to everyone.
                      </p>
                    </Field.Root>)}
                />
              ) : null}

              <Field.Root>
                <Field.Label>Who fills it?</Field.Label>
                <ToggleGroup
                  type="single"
                  variant="secondary"
                  value={form.watch("filled_by")}
                  onValueChange={(v) => {
                    if (v) form.setValue("filled_by", v as EditorValues["filled_by"], { shouldDirty: true });
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="user">User</ToggleGroupItem>
                  <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
                  <ToggleGroupItem value="both">Both</ToggleGroupItem>
                </ToggleGroup>
              </Field.Root>

              <Field.Root>
                <Field.Label>Group</Field.Label>
                {creatingGroup ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newGroupName}
                      placeholder="New group name"
                      onChange={(e) => setNewGroupName(e.target.value)}
                    />
                    <Button type="button" size="sm" onClick={commitNewGroup}>
                      Add
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setCreatingGroup(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={groupValue}
                    onValueChange={handleGroupChange}
                    placeholder="General"
                    items={[
                      { value: NONE_GROUP, label: "General" },
                      ...groups.map((g) => ({
                        value: String(g.id),
                        label: g.name,
                      })),
                      { value: NEW_GROUP, label: "+ New group…" },
                    ]}
                  />
                )}
              </Field.Root>

              <Controller
                control={form.control}
                name="is_filterable"
                render={({ field, fieldState }) => (
                  <Field.Root name="is_filterable" invalid={Boolean(fieldState.error)} className="flex items-center justify-between">
                    <Field.Label className="font-normal">Filterable in tables</Field.Label>
                    
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isAttachment}
                      />
                    
                  </Field.Root>)}
              />
            </section>

            {/* Advanced visibility */}
            <section className="border-t pt-4">
              <Collapsible
                open={overrideVisibility}
                onOpenChange={(o) =>
                  form.setValue("overrideVisibility", o, { shouldDirty: true })
                }
              >
                <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-4 w-4" />
                  Visibility overrides
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <p className="text-xs text-muted-foreground">
                    By default, visibility follows the requiredness stage. Override
                    only if you need something unusual.
                  </p>
                  <Controller
                    control={form.control}
                    name="show_on_create"
                    render={({ field, fieldState }) => (
                      <Field.Root name="show_on_create" invalid={Boolean(fieldState.error)} className="flex items-center justify-between">
                        <Field.Label className="font-normal">Show on create</Field.Label>
                        
                          <Switch
                            checked={requiredAt === "registration" ? true : field.value}
                            disabled={requiredAt === "registration"}
                            onCheckedChange={field.onChange}
                          />
                        
                      </Field.Root>)}
                  />
                  {requiredAt === "registration" ? (
                    <p className="text-xs text-muted-foreground">
                      Registration fields always show on create.
                    </p>
                  ) : null}
                  <Controller
                    control={form.control}
                    name="show_on_edit"
                    render={({ field, fieldState }) => (
                      <Field.Root name="show_on_edit" invalid={Boolean(fieldState.error)} className="flex items-center justify-between">
                        <Field.Label className="font-normal">Show on edit</Field.Label>
                        
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        
                      </Field.Root>)}
                  />
                  <Controller
                    control={form.control}
                    name="show_on_detail"
                    render={({ field, fieldState }) => (
                      <Field.Root name="show_on_detail" invalid={Boolean(fieldState.error)} className="flex items-center justify-between">
                        <Field.Label className="font-normal">Show on detail</Field.Label>
                        
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        
                      </Field.Root>)}
                  />
                </CollapsibleContent>
              </Collapsible>
            </section>

            <div className="mt-auto">
              <Button type="submit" isLoading={isSaving}>
                {isEditing ? "Save changes" : "Add field"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}

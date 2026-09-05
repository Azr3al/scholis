"use client";
import { Select, Skeleton } from "@/components/primitives";
import { ToggleGroup, ToggleGroupItem } from "@/components/misc/toggle-group";

import { FormConfigDetail } from "@/components/custom-fields/form-config-detail";
import { GroupSection } from "@/components/custom-fields/group-section";
import { UserFormSection } from "@/components/users/user-form-section";
import { useFormConfig } from "@/hooks/use-form-config";
import { buildFormSections } from "@/lib/custom-fields/build-form-sections";
import type { FormActor } from "@/lib/custom-fields/field-policy";
import {
  defaultPerspectiveForSurface,
  previewActor,
  previewBannerText,
  type PreviewPerspective,
} from "@/lib/custom-fields/preview-perspective";
import { CUSTOM_FIELD_ENTITY_USER } from "@/types/custom-fields";
import type { FormConfig, FormSurface } from "@/types/form-config";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

export type DesignerPreviewProps = {
  entityType: string;
  roleOptions: { value: string; label: string }[];
};

const SURFACE_LABEL: Record<FormSurface, string> = {
  create: "Create",
  edit: "Edit",
  detail: "Detail",
};

const PREVIEW_IDENTITY_KEYS = [
  "name",
  "email",
  "communication_email",
  "phone_number",
  "roles",
  "code",
] as const;

const PREVIEW_EDIT_OPERATIONAL_KEYS = [
  "preferred_checkin_time",
  "preferred_checkout_time",
  "access_log_name",
  "working_hour_per_month",
  "salary",
  "per_session_rate",
  "per_hour_rate",
  "student_bonus_hourly_rate",
  "contract_expiry_date",
  "probation_end_date",
  "employment_start_date",
  "employment_type",
  "zoom_user_identifier",
] as const;

function previewAvailableKeys(
  config: FormConfig,
  surface: FormSurface
): Set<string> {
  const keys = new Set<string>(PREVIEW_IDENTITY_KEYS);
  for (const group of config.groups) {
    for (const field of group.fields) keys.add(field.fieldKey);
  }
  if (surface === "edit") {
    for (const key of PREVIEW_EDIT_OPERATIONAL_KEYS) keys.add(key);
  }
  return keys;
}

function PreviewStandardSection({ label }: { label: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      Standard {label.toLowerCase()} fields (not configurable here).
    </p>
  );
}

function UserPreviewFormBody({
  config,
  surface,
  actor,
}: {
  config: FormConfig;
  surface: FormSurface;
  actor: FormActor;
}) {
  const form = useForm({ defaultValues: {} });
  const availableKeys = useMemo(
    () => previewAvailableKeys(config, surface),
    [config, surface]
  );
  const sections = useMemo(
    () => buildFormSections(config, { surface, availableKeys }),
    [config, surface, availableKeys]
  );

  return (
    <div {...form}>
      <div className="space-y-8">
        {sections.map((section, index) => {
          if (section.kind === "config") {
            return (
              <UserFormSection
                key={section.id}
                title={section.title}
                showSeparator={index > 0}
              >
                <GroupSection
                  form={form}
                  group={section.group}
                  surface={surface}
                  actor={actor}
                  entityType={config.entityType}
                />
              </UserFormSection>
            );
          }

          return (
            <UserFormSection
              key={section.id}
              title={section.title}
              description={"description" in section ? section.description : undefined}
              showSeparator={index > 0}
            >
              <PreviewStandardSection label={section.title} />
            </UserFormSection>
          );
        })}
      </div>
    </div>
  );
}

function CoursePreviewFormBody({
  config,
  surface,
  actor,
}: {
  config: FormConfig;
  surface: FormSurface;
  actor: FormActor;
}) {
  const form = useForm({ defaultValues: {} });

  return (
    <div {...form}>
      <div className="space-y-6">
        {config.groups.map((group) => (
          <GroupSection
            key={group.id ?? group.name}
            form={form}
            group={group}
            surface={surface}
            actor={actor}
            entityType={config.entityType}
          />
        ))}
      </div>
    </div>
  );
}

function PreviewFormBody({
  entityType,
  config,
  surface,
  actor,
}: {
  entityType: string;
  config: FormConfig;
  surface: FormSurface;
  actor: FormActor;
}) {
  if (entityType === CUSTOM_FIELD_ENTITY_USER) {
    return (
      <UserPreviewFormBody config={config} surface={surface} actor={actor} />
    );
  }

  return (
    <CoursePreviewFormBody config={config} surface={surface} actor={actor} />
  );
}

export function DesignerPreview({ entityType, roleOptions }: DesignerPreviewProps) {
  const [surface, setSurface] = useState<FormSurface>("create");
  const [role, setRole] = useState<string>(roleOptions[0]?.value ?? "");
  const [perspective, setPerspective] = useState<PreviewPerspective>(() =>
    defaultPerspectiveForSurface("create"),
  );

  const roles = role ? [role] : [];
  const { data: config, isLoading } = useFormConfig(surface, roles, entityType);

  const roleLabel =
    roleOptions.find((r) => r.value === role)?.label ?? role ?? "Role";
  const actor = previewActor(perspective);
  const previewKey = `${surface}-${role}-${perspective}`;

  const handleSurfaceChange = (next: FormSurface) => {
    setSurface(next);
    setPerspective(defaultPerspectiveForSurface(next));
  };

  const hasPreviewContent =
    config != null &&
    (entityType === CUSTOM_FIELD_ENTITY_USER ||
      config.groups.some((g) => g.fields.length > 0));

  return (
    <div className="lg:sticky lg:top-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base">Preview</h3>
          {roleOptions.length > 0 ? (
            <div className="flex flex-col items-end gap-1">
              <label htmlFor="preview-view-as-role" className="sr-only">
                View as role
              </label>
              <Select value={role} onValueChange={setRole} items={roleOptions.map((r) => ({ value: String(r.value), label: r.label }))} placeholder='View as role' className='h-8 w-40' />
            </div>
          ) : null}
        </div>

        {roleOptions.length > 0 && role ? (
          <div
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
            role="status"
          >
            {previewBannerText(roleLabel, perspective, surface)}
          </div>
        ) : null}

        <ToggleGroup
          type="single"
          variant="secondary"
          value={surface}
          onValueChange={(v) => v && handleSurfaceChange(v as FormSurface)}
          className="justify-start"
        >
          <ToggleGroupItem value="create">Create</ToggleGroupItem>
          <ToggleGroupItem value="edit">Edit</ToggleGroupItem>
          <ToggleGroupItem value="detail">Detail</ToggleGroupItem>
        </ToggleGroup>

        {surface !== "detail" ? (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Perspective</label>
            <ToggleGroup
              type="single"
              variant="secondary"
              value={perspective}
              onValueChange={(v) => v && setPerspective(v as PreviewPerspective)}
              className="justify-start"
            >
              <ToggleGroupItem value="self">Self</ToggleGroupItem>
              <ToggleGroupItem value="staff">Staff</ToggleGroupItem>
            </ToggleGroup>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Preview how this role&apos;s form looks on each screen.{" "}
          <span className="font-medium text-foreground">Self</span> = editing their
          own profile;{" "}
          <span className="font-medium text-foreground">Staff</span> = an admin
          editing their record.
        </p>
      </div>
      <div>
        {isLoading || !config ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : !hasPreviewContent ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No fields on {SURFACE_LABEL[surface]} for {roleLabel} yet.
          </p>
        ) : surface === "detail" ? (
          <FormConfigDetail config={config} source={{}} />
        ) : (
          <PreviewFormBody
            key={previewKey}
            entityType={entityType}
            config={config}
            surface={surface}
            actor={actor}
          />
        )}
      </div>
    </div>
  );
}

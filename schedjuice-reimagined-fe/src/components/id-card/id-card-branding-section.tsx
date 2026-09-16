"use client";
import { Button, Input, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import { useEffect, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { IdCardTemplateSettings } from "@/components/id-card/id-card-template-settings";
import { ResolveIdCardFace } from "@/components/id-card/resolve-id-card-face";
import { ImageCropPreset } from "@/components/images/image-crop-presets";
import ImageUploader from "@/components/images/image-uploader";
import { getActiveIdCardTemplate } from "@/lib/id-card/active-template";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { buildIdCardPreview } from "@/lib/id-card/build-id-card";
import { extractLogoColor } from "@/lib/id-card/logo-color";
import type { organizationType } from "@/types/organization";
import { IdCardTemplateAudience } from "@/types/id-card-template";

type IdCardBrandingFieldKey =
  | "id_card_org_name"
  | "id_card_staff_accent"
  | "id_card_student_accent";

type IdCardBrandingSectionProps = {
  organization: organizationType;
  form: UseFormReturn<Record<string, unknown>>;
  qrDataUrl: string;
  logoCleared: boolean;
  onLogoClearedChange: (cleared: boolean) => void;
  onLogoUploadFinished: () => void;
};

export function IdCardBrandingSection({
  organization,
  form,
  qrDataUrl,
  logoCleared,
  onLogoClearedChange,
  onLogoUploadFinished,
}: IdCardBrandingSectionProps) {
  const { user } = useUser();
  const toast = useToast();
  const [isLogoUploadOpen, setIsLogoUploadOpen] = useState(false);
  const [logoColor, setLogoColor] = useState<string | null>(null);
  const [logoColorLoading, setLogoColorLoading] = useState(false);

  const idCardOrgName = form.watch("id_card_org_name");
  const idCardStaffAccent = form.watch("id_card_staff_accent");
  const idCardStudentAccent = form.watch("id_card_student_accent");

  const displayLogoUrl = logoCleared
    ? organization.logo ?? null
    : organization.id_card_logo ?? organization.logo ?? null;

  useEffect(() => {
    if (!displayLogoUrl) {
      setLogoColor(null);
      setLogoColorLoading(false);
      return;
    }

    let active = true;
    setLogoColorLoading(true);
    extractLogoColor(displayLogoUrl)
      .then((color) => {
        if (active) setLogoColor(color);
      })
      .finally(() => {
        if (active) setLogoColorLoading(false);
      });

    return () => {
      active = false;
    };
  }, [displayLogoUrl]);

  const previewTenant = useMemo(() => {
    return {
      ...organization,
      id_card_org_name:
        typeof idCardOrgName === "string" && idCardOrgName.trim()
          ? idCardOrgName.trim()
          : null,
      id_card_staff_accent:
        typeof idCardStaffAccent === "string" && idCardStaffAccent.trim()
          ? idCardStaffAccent.trim()
          : null,
      id_card_student_accent:
        typeof idCardStudentAccent === "string" && idCardStudentAccent.trim()
          ? idCardStudentAccent.trim()
          : null,
      id_card_logo: logoCleared ? null : organization.id_card_logo,
    } as organizationType;
  }, [
    organization,
    idCardOrgName,
    idCardStaffAccent,
    idCardStudentAccent,
    logoCleared,
  ]);

  const staffPreview = useMemo(() => {
    if (!user) return null;
    return buildIdCardPreview(user, previewTenant, "staff");
  }, [user, previewTenant]);

  const studentPreview = useMemo(() => {
    if (!user) return null;
    return buildIdCardPreview(user, previewTenant, "student");
  }, [user, previewTenant]);

  const logoColorSuggestion = logoColorLoading ? null : logoColor;

  function fieldValue(key: IdCardBrandingFieldKey): string {
    const value = form.getValues(key);
    return typeof value === "string" ? value : "";
  }

  function updateField(key: IdCardBrandingFieldKey, next: string) {
    form.setValue(key, next, { shouldDirty: true });
  }

  function resetField(key: IdCardBrandingFieldKey) {
    form.setValue(key, "", { shouldDirty: true });
  }

  function handleLogoUploadFinished() {
    onLogoClearedChange(false);
    onLogoUploadFinished();
    toast.add({ description: "Logo uploaded." });
  }

  return (
    <div className="space-y-10">
      <IdCardTemplateSettings organization={organization} />

      <div className="border-t border-border pt-8">
        <div className="mb-6">
          <p className="text-sm font-medium text-text-primary">Default card branding</p>
          <p className="text-xs text-text-muted">
            Used when no custom uploaded template is active for that audience.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start">
          <div className="order-2 flex flex-col gap-4 lg:order-1">
        <Field
          id="id-card-org-name"
          label="Display school name"
          hint="Leave blank to use your organization name."
          value={fieldValue("id_card_org_name")}
          onChange={(next) => updateField("id_card_org_name", next)}
          onReset={() => resetField("id_card_org_name")}
        />

        <LogoField
          displayLogoUrl={displayLogoUrl}
          hasCustomLogo={Boolean(organization.id_card_logo) && !logoCleared}
          onUpload={() => setIsLogoUploadOpen(true)}
          onReset={() => onLogoClearedChange(true)}
        />

        {displayLogoUrl && logoColorLoading ? (
          <p className="text-xs text-text-muted">Detecting logo color…</p>
        ) : null}
        {displayLogoUrl && !logoColorLoading && !logoColor ? (
          <p className="text-xs text-text-muted">
            Couldn&apos;t detect a logo color.
          </p>
        ) : null}

        <ColorField
          id="id-card-staff-accent"
          label="Staff accent color"
          value={fieldValue("id_card_staff_accent")}
          onChange={(next) => updateField("id_card_staff_accent", next)}
          onReset={() => resetField("id_card_staff_accent")}
          suggestion={logoColorSuggestion}
          onUseSuggestion={() => {
            if (logoColorSuggestion) {
              updateField("id_card_staff_accent", logoColorSuggestion);
            }
          }}
        />

        <ColorField
          id="id-card-student-accent"
          label="Student accent color"
          value={fieldValue("id_card_student_accent")}
          onChange={(next) => updateField("id_card_student_accent", next)}
          onReset={() => resetField("id_card_student_accent")}
          suggestion={logoColorSuggestion}
          onUseSuggestion={() => {
            if (logoColorSuggestion) {
              updateField("id_card_student_accent", logoColorSuggestion);
            }
          }}
        />
      </div>

      <div className="order-1 lg:sticky lg:top-24 lg:order-2">
        <PreviewPanel
          organization={organization}
          staffPreview={staffPreview}
          studentPreview={studentPreview}
          qrDataUrl={qrDataUrl}
        />
      </div>
        </div>

      <ImageUploader
        isOpen={isLogoUploadOpen}
        setIsOpen={setIsLogoUploadOpen}
        entity="organizations"
        entityId={organization.id}
        uploadKey="id_card_logo"
        cropPreset={ImageCropPreset.Square}
        dialogTitle="ID card logo"
        onUploadFinished={handleLogoUploadFinished}
      />
      </div>
    </div>
  );
}

type PreviewPanelProps = {
  organization: organizationType;
  staffPreview: ReturnType<typeof buildIdCardPreview> | null;
  studentPreview: ReturnType<typeof buildIdCardPreview> | null;
  qrDataUrl: string;
};

function PreviewPanel({
  organization,
  staffPreview,
  studentPreview,
  qrDataUrl,
}: PreviewPanelProps) {
  const { tenant } = useTenant();
  const tenantSource = tenant ?? organization;
  const staffTemplate = getActiveIdCardTemplate(
    tenantSource,
    IdCardTemplateAudience.staff,
  );
  const studentTemplate = getActiveIdCardTemplate(
    tenantSource,
    IdCardTemplateAudience.student,
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:p-6">
      <div>
        <p className="text-sm font-medium text-text-primary">Live preview</p>
        <p className="text-xs text-text-muted">
          Shows the active uploaded template when set; otherwise the default
          SVG card with branding below.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <PreviewCard
          label="Staff"
          vm={staffPreview}
          qrDataUrl={qrDataUrl}
          template={staffTemplate}
        />
        <PreviewCard
          label="Student"
          vm={studentPreview}
          qrDataUrl={qrDataUrl}
          template={studentTemplate}
        />
      </div>
    </div>
  );
}

type PreviewCardProps = {
  label: string;
  vm: ReturnType<typeof buildIdCardPreview> | null;
  qrDataUrl: string;
  template: ReturnType<typeof getActiveIdCardTemplate>;
};

function PreviewCard({ label, vm, qrDataUrl, template }: PreviewCardProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <div className="flex items-center justify-center rounded-xl bg-surface/60 p-4">
        {vm ? (
          <ResolveIdCardFace
            vm={vm}
            qrDataUrl={qrDataUrl}
            template={template}
            width={200}
            className="drop-shadow-md"
          />
        ) : (
          <p className="text-sm text-text-muted">Preview unavailable.</p>
        )}
      </div>
    </div>
  );
}

type LogoFieldProps = {
  displayLogoUrl: string | null;
  hasCustomLogo: boolean;
  onUpload: () => void;
  onReset: () => void;
};

function LogoField({ displayLogoUrl, hasCustomLogo, onUpload, onReset }: LogoFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label>ID card logo</label>
        {hasCustomLogo ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={onReset}>
            Reset
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
          {displayLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayLogoUrl}
              alt="Current ID card logo"
              className="size-full object-contain p-1"
            />
          ) : (
            <span className="text-xs text-text-muted">None</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button type="button" variant="secondary" size="sm" onClick={onUpload}>
            {hasCustomLogo ? "Change logo" : "Upload logo"}
          </Button>
          <p className="text-xs text-text-muted">
            Leave unset to use your organization logo. A PNG with a transparent
            background blends best on the card header.
          </p>
        </div>
      </div>
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
};

function Field({ id, label, hint, value, onChange, onReset }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id}>{label}</label>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={onReset}>
          Reset
        </Button>
      </div>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

type ColorFieldProps = FieldProps & {
  suggestion?: string | null;
  onUseSuggestion?: () => void;
};

function ColorField({
  id,
  label,
  value,
  onChange,
  onReset,
  suggestion,
  onUseSuggestion,
}: ColorFieldProps) {
  const colorValue = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#5ea37e";
  const showSuggestion =
    suggestion &&
    suggestion.toUpperCase() !== value.trim().toUpperCase();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id}>{label}</label>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={onReset}>
          Reset
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#5ea37e"
        />
        <input
          aria-label={`${label} picker`}
          type="color"
          value={colorValue}
          onChange={(e) => onChange(e.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
        />
      </div>
      {showSuggestion ? (
        <button
          type="button"
          onClick={onUseSuggestion}
          className="flex w-fit items-center gap-2 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <span
            className="size-3 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: suggestion }}
            aria-hidden
          />
          Use logo color ({suggestion})
        </button>
      ) : null}
    </div>
  );
}

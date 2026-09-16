"use client";
import { Button, buttonVariants, useToast } from "@/components/primitives";

import { useMemo, useState } from "react";
import type { Area } from "react-easy-crop";
import ImageUploader from "@/components/images/image-uploader";
import { ImageCropPreset } from "@/components/images/image-crop-presets";
import { useCroppedPreviewUrl } from "@/components/images/use-cropped-preview-url";
import { orgLogoMonogram } from "@/lib/org-logo-monogram";
import type { organizationType } from "@/types/organization";
import { OrganizationLogoPlacements } from "./organization-logo-placements";

type OrganizationLogoCropPreviewProps = {
  imageSrc: string;
  croppedAreaPixels: Area | null;
  file: File;
  orgName: string;
};

function OrganizationLogoCropPreview({
  imageSrc,
  croppedAreaPixels,
  file,
  orgName,
}: OrganizationLogoCropPreviewProps) {
  const previewUrl = useCroppedPreviewUrl({ imageSrc, croppedAreaPixels, file });
  return (
    <OrganizationLogoPlacements logoUrl={previewUrl} orgName={orgName} compact />
  );
}

type OrganizationLogoSectionProps = {
  organization: organizationType;
  onUploadFinished: () => void;
};

export function OrganizationLogoSection({
  organization,
  onUploadFinished,
}: OrganizationLogoSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toast = useToast();
  const logoUrl = organization.logo ?? null;

  const CropPreview = useMemo(
    () =>
      function CropPreview(props: {
        imageSrc: string;
        croppedAreaPixels: Area | null;
        file: File;
      }) {
        return (
          <OrganizationLogoCropPreview {...props} orgName={organization.name} />
        );
      },
    [organization.name],
  );

  return (
    <section className="space-y-6 rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">School logo</h2>
        <p className="text-sm text-muted-foreground">
          Square crop recommended. PNG with a transparent background works best.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%,transparent_75%,#e5e7eb_75%,#e5e7eb),linear-gradient(45deg,#e5e7eb_25%,transparent_25%,transparent_75%,#e5e7eb_75%,#e5e7eb)] bg-size-[8px_8px] bg-position-[0_0,4px_4px]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Current school logo"
              className="size-full object-contain p-1"
            />
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">
              {orgLogoMonogram(organization.name)}
            </span>
          )}
        </div>
        <Button type="button" variant="secondary" onClick={() => setIsOpen(true)}>
          {logoUrl ? "Change logo" : "Upload logo"}
        </Button>
      </div>

      <div className="space-y-3 border-t border-border/60 pt-4">
        <div>
          <p className="text-sm font-medium text-foreground">Where your logo appears</p>
          <p className="text-xs text-muted-foreground">
            Previews of surfaces that use your organization logo.
          </p>
        </div>
        <OrganizationLogoPlacements
          logoUrl={logoUrl}
          orgName={organization.name}
        />
      </div>

      <ImageUploader
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        entity="organizations"
        entityId={organization.id}
        uploadKey="logo"
        cropPreset={ImageCropPreset.Square}
        dialogTitle="School logo"
        renderAfterCrop={CropPreview}
        onUploadFinished={() => {
          onUploadFinished();
          toast.add({ description: "Image uploaded successfully" });
        }}
      />
    </section>
  );
}

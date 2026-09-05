"use client";
import { Controller } from "react-hook-form";
import { Button, useToast, Field } from "@/components/primitives";

import { getQualificationsEditorOptions } from "@/components/editor/config";
import { insertQualificationImage } from "@/components/editor/qualifications-image-upload";
import TextEditor from "@/components/editor/editor";
import CopyInput from "@/components/misc/copy-input";
import { fetchUserCertifications } from "@/helpers/user-certifications";
import { primaryStaffRoleLabel } from "@/helpers/role";
import { useQuery } from "@tanstack/react-query";
import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import { PublicProfilePreview } from "./profile/public-profile-preview";
import { PublicProfileSettingsCard } from "./profile/public-profile-settings-card";
import { toPublicCertifications } from "./profile/public-profile-utils";
import type { PublicTenantBranding } from "@/types/user-certification";
import type { UserFormFieldsContext } from "./user-form-fields";

export function UserPublicProfileFields({
  form,
  registerPreSubmit,
  mode,
  savePublicProfile,
  isSavingPublicProfile,
  subjectUser,
  tenant,
}: UserFormFieldsContext) {
  const toast = useToast();
  const editor = useEditor(getQualificationsEditorOptions());
  const isSubmitting = form.formState.isSubmitting;
  const slug = form.watch("public_profile_slug");
  const enabled = form.watch("is_public_profile_enabled");
  const showCertifications = form.watch("show_certifications_on_public_profile");
  const qualifications = form.watch("qualifications");
  const [origin, setOrigin] = useState("");

  const subject = subjectUser ?? form.getValues();
  const roleLabel = primaryStaffRoleLabel(subject.roles);
  const profileImageUrl =
    (subject.profile_image_url as string | null | undefined) ?? null;

  const { data: certifications } = useQuery({
    queryKey: ["user-certifications", subject?.id],
    queryFn: () => fetchUserCertifications(subject!.id),
    enabled: Boolean(subject?.id),
  });

  const previewCerts = useMemo(
    () => toPublicCertifications(certifications ?? []),
    [certifications],
  );

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!editor) return;
    const content = form.getValues("qualifications");
    if (content) {
      editor.commands.setContent(content);
    }
  }, [editor, form]);

  useEffect(() => {
    if (!editor || !registerPreSubmit) return;
    return registerPreSubmit(() => {
      form.setValue("qualifications", editor.getJSON(), { shouldDirty: true });
    });
  }, [editor, form, registerPreSubmit]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      form.setValue("qualifications", editor.getJSON(), { shouldDirty: true });
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, form]);

  const shareUrl = slug && origin ? `${origin}/people/${slug}` : "";

  const handleQualificationImage = (file: File) => {
    if (!editor || !subject?.id) return;
    void insertQualificationImage(editor, file, subject.id, () => {}).catch((err) => {
      toast.add({
        title: err.message === "unsupported_image" ? "Unsupported image" : "Image upload failed",
        description:
          err.message === "unsupported_image"
            ? "Use PNG, JPEG, GIF, or WebP under 10 MB."
            : "Try again or pick a different image."});
    });
  };

  const previewTenant = useMemo((): PublicTenantBranding | null => {
    if (!tenant) return null;
    const cover = tenant.default_cover_image;
    return {
      name: tenant.name,
      logo: tenant.logo ?? null,
      default_cover_image:
        typeof cover === "string" && cover.length > 0 ? cover : null,
      tagline: tenant.tagline,
    };
  }, [tenant]);

  return (
    <div className="space-y-6" aria-busy={isSubmitting}>
      <PublicProfileSettingsCard
        form={form}
        isSubmitting={isSubmitting}
        enabled={Boolean(enabled)}
      />

      {subject?.id ? (
        <PublicProfilePreview
          name={subject.name ?? ""}
          roleLabel={roleLabel}
          profileImageUrl={profileImageUrl}
          qualifications={qualifications}
          showCertifications={Boolean(showCertifications)}
          certifications={previewCerts}
          enabled={Boolean(enabled)}
          tenant={previewTenant}
        />
      ) : null}

      {editor ? (
        <Controller
          control={form.control}
          name="qualifications"
          render={({ fieldState }) => (
            <Field.Root className="w-full" name="qualifications" invalid={Boolean(fieldState.error)}>
              <Field.Label>Qualifications</Field.Label>
              <Field.Description className="mb-2">
                Paste or drop images inline (PNG, JPEG, GIF, WebP — max 10 MB).
              </Field.Description>
<div
                  onPaste={(event) => {
                    const items = event.clipboardData?.items;
                    if (!items) return;
                    for (const item of Array.from(items)) {
                      if (!item.type.startsWith("image/")) continue;
                      event.preventDefault();
                      const file = item.getAsFile();
                      if (file) handleQualificationImage(file);
                      return;
                    }
                  }}
                  onDrop={(event) => {
                    const file = event.dataTransfer?.files?.[0];
                    if (!file?.type.startsWith("image/")) return;
                    event.preventDefault();
                    handleQualificationImage(file);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                >
                  <TextEditor
                    editor={editor}
                    editable={!isSubmitting}
                    hideMenu={isSubmitting}
                  />
                </div>
                <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
            </Field.Root>
          )}
        />
      ) : null}

      {mode === "edit" && savePublicProfile ? (
        <Button
          type="button"
          onClick={savePublicProfile}
          isLoading={isSavingPublicProfile}
          disabled={isSubmitting}
        >
          Save public profile
        </Button>
      ) : null}

      {slug ? (
        <CopyInput
          label="Share link"
          text={shareUrl}
          description={
            enabled
              ? "Copy this link to share your public profile."
              : "Disabled — this link won't work until you enable public profile."
          }
          disabled={isSubmitting || !shareUrl}
        />
      ) : (
        <p className="text-sm text-text-muted">
          Save your public profile to generate a share link.
        </p>
      )}
    </div>
  );
}

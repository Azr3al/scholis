"use client";
import { useToast } from "@/components/primitives";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHoriz } from "iconoir-react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu } from "@/components/primitives/menu";
import { RecordImageUploadDialog } from "@/components/record/media/record-image-upload-dialog";
import {
  PROFILE_UPLOAD_TARGETS,
  type ProfileUploadTarget,
} from "@/components/record/record-profile-media";
import {
  RecordAdminDialogs,
  RecordAdminMenuItems,
  useRecordAdminActions,
} from "@/components/record/record-actions-menu";
import {
  canUpdateCoverImage,
  hasAdminCredentials,
} from "@/helpers/authorization";
import { canMutateUserField } from "@/lib/users/steward-fields";
import type { accountType } from "@/types/user";

export function RecordProfileHeaderActions({
  subject,
  viewer,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  recordQueryKey: unknown[];
}) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeUpload, setActiveUpload] = useState<ProfileUploadTarget | null>(null);

  const admin = useRecordAdminActions({ subject, viewer, recordQueryKey });
  const canEditProfile = canMutateUserField({
    viewer,
    subject,
    field: "profile_image",
  });
  const canEditCover = canUpdateCoverImage(viewer, subject.id);
  const canEditIdPhoto = canMutateUserField({
    viewer,
    subject,
    field: "id_photo",
  });
  const isOwnProfile = viewer.id === subject.id;

  const openUpload = useCallback((target: ProfileUploadTarget) => {
    setActiveUpload(target);
    setUploadOpen(true);
  }, []);

  const handleUploaded = useCallback(() => {
    if (activeUpload) {
      toast.add({
        title: activeUpload.successTitle,
        description: activeUpload.successDescription});
    }
    void queryClient.invalidateQueries({ queryKey: recordQueryKey });
  }, [activeUpload, queryClient, recordQueryKey, toast]);

  const mediaMenuItems = useMemo(() => {
    const items: { label: string; target: ProfileUploadTarget }[] = [];
    if (canEditProfile) {
      items.push({
        label: "Update profile photo",
        target: PROFILE_UPLOAD_TARGETS.profile,
      });
    }
    if (canEditCover) {
      items.push({
        label: "Update cover image",
        target: PROFILE_UPLOAD_TARGETS.cover,
      });
    }
    if (canEditIdPhoto) {
      items.push({ label: "Update ID photo", target: PROFILE_UPLOAD_TARGETS.idPhoto });
    }
    return items;
  }, [canEditProfile, canEditCover, canEditIdPhoto]);

  const showMedia = mediaMenuItems.length > 0;
  const showIdCard = isOwnProfile;
  const showAdmin = hasAdminCredentials(viewer);

  if (!showMedia && !showIdCard && !showAdmin) return null;

  const showSeparatorBeforeAdmin = showAdmin && (showMedia || showIdCard);
  const showSeparatorBeforeIdCard = showIdCard && showMedia;

  return (
    <>
      {activeUpload ? (
        <RecordImageUploadDialog
          key={activeUpload.uploadKey}
          open={uploadOpen}
          onOpenChange={(open) => {
            setUploadOpen(open);
            if (!open) setActiveUpload(null);
          }}
          entityId={subject.id}
          uploadKey={activeUpload.uploadKey}
          cropPreset={activeUpload.cropPreset}
          cropShape={activeUpload.cropShape}
          title={activeUpload.title}
          onUploaded={handleUploaded}
        />
      ) : null}

      <RecordAdminDialogs admin={admin} subject={subject} recordQueryKey={recordQueryKey} />

      <Menu.Root>
        <Menu.Trigger
          className="inline-flex size-9 items-center justify-center rounded-md text-text-secondary outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          aria-label="Profile options"
        >
          <MoreHoriz width={18} height={18} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end">
            <Menu.Popup>
              {mediaMenuItems.map((item) => (
                <Menu.Item key={item.target.uploadKey} onClick={() => openUpload(item.target)}>
                  {item.label}
                </Menu.Item>
              ))}
              {showSeparatorBeforeIdCard ? <Menu.Separator /> : null}
              {showIdCard ? (
                <Menu.Item onClick={() => router.push("/id-card")}>View ID card</Menu.Item>
              ) : null}
              {showSeparatorBeforeAdmin ? <Menu.Separator /> : null}
              {showAdmin ? <RecordAdminMenuItems admin={admin} subject={subject} /> : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}

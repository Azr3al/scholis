"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Button, Sheet } from "@/components/primitives";
import { RecordSection } from "@/components/record/record-section";
import {
  listUserImages,
  resolveUserImage,
} from "@/app/client-api/user-images";
import {
  canUploadUserImage,
  canViewUserImage,
} from "@/helpers/authorization";
import { cn } from "@/lib/utils";
import type { accountType } from "@/types/user";
import {
  USER_IMAGE_TYPE_LABELS,
  type UserImageType,
} from "@/types/user-image";
import { UserImageUploadDialog } from "./user-image-upload-dialog";

const IMAGE_TYPES: UserImageType[] = ["award_image", "id_image"];

function formatWhen(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function UserImageCard({
  subject,
  viewer,
  imageType,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  imageType: UserImageType;
  recordQueryKey: unknown[];
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const canUpload = canUploadUserImage(viewer, imageType);
  const canView = canViewUserImage(viewer, imageType);

  const resolveQuery = useQuery({
    queryKey: ["user-image-resolve", subject.id, imageType],
    queryFn: () => resolveUserImage(subject.id, imageType),
    enabled: canView,
  });

  const historyQuery = useQuery({
    queryKey: ["user-image-history", subject.id, imageType],
    queryFn: () => listUserImages(subject.id, imageType),
    enabled: canView && historyOpen,
  });

  if (!canView) return null;

  const resolved = resolveQuery.data;
  const previewUrl = resolved?.url ?? null;
  const label = USER_IMAGE_TYPE_LABELS[imageType];
  const lastUploaded = formatWhen(resolved?.created_at);
  const isLegacy = resolved?.source === "legacy_id_photo";

  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{label}</h3>
          {isLegacy ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Legacy id_photo
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          {canUpload ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setUploadOpen(true)}
            >
              Upload
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(true)}
          >
            View history
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "relative flex min-h-[140px] max-w-xs items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-3",
        )}
      >
        {resolveQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : previewUrl ? (
          <Image
            src={previewUrl}
            alt={`${subject.name ?? "User"} ${label}`}
            width={240}
            height={300}
            className="max-h-40 w-auto object-contain"
            unoptimized
          />
        ) : (
          <p className="text-sm text-muted-foreground">No photo</p>
        )}
      </div>

      {lastUploaded ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Last uploaded: {lastUploaded}
        </p>
      ) : isLegacy ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing legacy profile ID photo
        </p>
      ) : null}

      {canUpload ? (
        <UserImageUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          userId={subject.id}
          imageType={imageType}
          recordQueryKey={recordQueryKey}
        />
      ) : null}

      <Sheet.Root open={historyOpen} onOpenChange={setHistoryOpen}>
        <Sheet.Portal>
          <Sheet.Backdrop />
          <Sheet.Popup className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
            <Sheet.Title>{label} history</Sheet.Title>
            <Sheet.Description>
              All uploads for {subject.name ?? "this user"}, newest first.
            </Sheet.Description>
            <div className="flex flex-col gap-3 p-4 pt-0">
              {historyQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading history…</p>
              ) : historyQuery.data?.items.length ? (
                historyQuery.data.items.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 rounded-md border border-border p-2"
                  >
                    {row.image_url ? (
                      <Image
                        src={row.image_url}
                        alt=""
                        width={48}
                        height={48}
                        className="h-12 w-12 shrink-0 rounded object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded bg-muted" />
                    )}
                    <div className="min-w-0 text-sm">
                      <p>{formatWhen(row.created_at)}</p>
                      {row.uploaded_by?.name ? (
                        <p className="truncate text-muted-foreground">
                          by {row.uploaded_by.name}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No uploads yet.</p>
              )}
            </div>
          </Sheet.Popup>
        </Sheet.Portal>
      </Sheet.Root>
    </div>
  );
}

export function UserPhotosSection({
  subject,
  viewer,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  recordQueryKey: unknown[];
}) {
  const visibleTypes = IMAGE_TYPES.filter((type) => canViewUserImage(viewer, type));
  if (visibleTypes.length === 0) return null;

  return (
    <RecordSection title="Photos">
      <div className="grid gap-4 md:grid-cols-2">
        {visibleTypes.map((imageType) => (
          <UserImageCard
            key={imageType}
            subject={subject}
            viewer={viewer}
            imageType={imageType}
            recordQueryKey={recordQueryKey}
          />
        ))}
      </div>
    </RecordSection>
  );
}

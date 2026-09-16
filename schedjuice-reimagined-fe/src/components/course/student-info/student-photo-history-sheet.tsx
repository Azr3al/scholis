"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Sheet } from "@/components/primitives";
import { listUserImages } from "@/app/client-api/user-images";
import {
  USER_IMAGE_TYPE_LABELS,
  type UserImageType,
} from "@/types/user-image";

function formatWhen(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function StudentPhotoHistorySheet({
  open,
  onOpenChange,
  userId,
  userName,
  imageType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  userName: string | null;
  imageType: UserImageType;
}) {
  const label = USER_IMAGE_TYPE_LABELS[imageType];
  const historyQuery = useQuery({
    queryKey: ["user-image-history", userId, imageType],
    queryFn: () => listUserImages(userId, imageType),
    enabled: open,
  });

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          <Sheet.Title>{label} history</Sheet.Title>
          <Sheet.Description>
            All uploads for {userName ?? "this student"}, newest first.
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
  );
}

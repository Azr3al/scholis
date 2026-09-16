"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useMemo } from "react";
import { Book as BookOpen, NavArrowRight as ChevronRight, OpenNewWindow as ExternalLink, Folder, Trash as Trash2 } from "iconoir-react";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { isRasterImageFilename } from "@/lib/announcement/is-raster-image-filename";
import type { WikiItemAttachmentPreview } from "@/lib/wiki/fetch-wiki-item-attachments";
import { cn } from "@/lib/utils";
import type { WikiItem } from "@/types/wiki-item";

type CourseMaterialsGalleryProps = {
  items: WikiItem[];
  attachmentByItemId: Record<number, WikiItemAttachmentPreview>;
  attachmentsLoading: boolean;
  canDeleteItem: (item: WikiItem) => boolean;
  deletePending: boolean;
  onDelete: (itemId: number) => void;
  onOpenFolder: (item: WikiItem) => void;
  onOpenMaterial: (item: WikiItem) => void;
};

function resolveDisplayFilename(
  item: WikiItem,
  preview?: WikiItemAttachmentPreview,
) {
  return preview?.filename?.trim() || item.name;
}

export function CourseMaterialsGallery({
  items,
  attachmentByItemId,
  attachmentsLoading,
  canDeleteItem,
  deletePending,
  onDelete,
  onOpenFolder,
  onOpenMaterial,
}: CourseMaterialsGalleryProps) {
  const folders = useMemo(
    () => items.filter((item) => item.is_folder),
    [items],
  );
  const materials = useMemo(
    () => items.filter((item) => !item.is_folder),
    [items],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {folders.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Folders</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {folders.map((item) => (
              <li
                key={item.id}
                className="group flex items-center gap-2 px-3 py-3"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => onOpenFolder(item)}
                >
                  <Folder
                    className="h-5 w-5 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="truncate font-medium">{item.name}</span>
                  <ChevronRight
                    className="ml-auto h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </button>
                {canDeleteItem(item) ? (
                  <ConfirmationDialog
                    title="Remove material?"
                    content="This permanently deletes the item from this folder."
                    onConfirm={() => onDelete(item.id)}
                    isLoading={deletePending}
                  >
                    <button
                      type="button"
                      className={cn(
                        "shrink-0 rounded p-1 opacity-0 transition-opacity",
                        "hover:bg-destructive/10 hover:text-destructive",
                        "group-hover:opacity-100 focus-visible:opacity-100",
                      )}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </ConfirmationDialog>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {materials.length > 0 ? (
        <section className="space-y-2">
          {folders.length > 0 ? (
            <h3 className="text-sm font-medium text-muted-foreground">
              Files and links
            </h3>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {materials.map((item) => {
              const preview = attachmentByItemId[item.id];
              const isLink = item.item_type === "link";
              const isFile = item.item_type === "file";
              const filename = resolveDisplayFilename(item, preview);
              const isImage = isFile && isRasterImageFilename(filename);
              const downloadUrl = preview?.downloadUrl;
              const TileIcon = isLink ? ExternalLink : BookOpen;

              return (
                <div key={item.id} className="group relative">
                  <button
                    type="button"
                    className="flex aspect-[4/5] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:bg-accent/20"
                    onClick={() => onOpenMaterial(item)}
                  >
                    <div className="relative min-h-0 flex-1 bg-muted">
                      {isImage && downloadUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed JuiceBox URLs
                        <img
                          src={downloadUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          {attachmentsLoading && isFile ? (
                            <Spinner
 className="h-6 w-6 text-muted-foreground"
 aria-hidden
 />
                          ) : (
                            <TileIcon
                              className="h-8 w-8 text-primary"
                              aria-hidden
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="border-t border-border px-2 py-2">
                      <span className="line-clamp-2 text-xs font-medium text-foreground">
                        {item.name}
                      </span>
                    </div>
                  </button>
                  {canDeleteItem(item) ? (
                    <ConfirmationDialog
                      title="Remove material?"
                      content="This permanently deletes the item from this folder."
                      onConfirm={() => onDelete(item.id)}
                      isLoading={deletePending}
                    >
                      <button
                        type="button"
                        className={cn(
                          "absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1.5 opacity-0 shadow-sm transition-opacity",
                          "hover:bg-destructive/10 hover:text-destructive",
                          "group-hover:opacity-100 focus-visible:opacity-100",
                        )}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </ConfirmationDialog>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

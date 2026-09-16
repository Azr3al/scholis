"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Book as BookOpen, NavArrowRight as ChevronRight, FolderPlus, Link, Upload } from "iconoir-react";
import { CourseMaterialsGallery } from "@/components/course/materials/course-materials-gallery";
import { Button } from "@/components/primitives";
import {
  Dialog,
} from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { Skeleton } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { deleteEntity, makePostRequest } from "@/app/client-api/utils";
import { canEditCourse, permissionsFor } from "@/helpers/authorization";
import { getCourseMemberIdsFromCourse } from "@/helpers/course-hub";
import { fetchJuiceBoxAttachments } from "@/lib/juicebox/fetch-by-resource";
import {
  WikiItemRollbackFailedError,
  createFileItemWithUpload,
} from "@/lib/wiki/create-file-item-with-upload";
import type { WikiItemAttachmentPreview } from "@/lib/wiki/fetch-wiki-item-attachments";
import {
  courseItemsQueryKey,
  searchCourseItems,
} from "@/lib/wiki/items-search";
import { useWikiItemAttachments } from "@/lib/wiki/use-wiki-item-attachments";
import {
  collectClipboardFiles,
  filterFilesForAttachments,
} from "@/components/attachment-uploader/attachment-dropzone-files";
import type { courseType } from "@/types/course";
import type { accountType } from "@/types/user";
import type { WikiItem } from "@/types/wiki-item";

type BreadcrumbEntry = {
  id: number | null;
  name: string;
};

type CreateDialogMode = "folder" | "file" | "link" | null;

type CourseMaterialsPanelProps = {
  courseId: string;
  course: courseType;
  user: accountType;
};

export function CourseMaterialsPanel({
  courseId,
  course,
  user,
}: CourseMaterialsPanelProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const memberIds = getCourseMemberIdsFromCourse(course);
  const canEdit = canEditCourse(user, memberIds);

  const [parentStack, setParentStack] = useState<BreadcrumbEntry[]>([
    { id: null, name: "All materials" },
  ]);
  const currentParent = parentStack[parentStack.length - 1];
  const parentId = currentParent?.id ?? null;

  const [dialogMode, setDialogMode] = useState<CreateDialogMode>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const itemsQuery = useQuery({
    queryKey: courseItemsQueryKey(courseId, parentId),
    queryFn: () => searchCourseItems(courseId, parentId),
    refetchOnWindowFocus: false,
  });

  const resetDialog = useCallback(() => {
    setDialogMode(null);
    setName("");
    setUrl("");
    setFile(null);
  }, []);

  const invalidateItems = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: courseItemsQueryKey(courseId, parentId),
    });
  }, [courseId, parentId, queryClient]);

  const createFolderMutation = useMutation({
    mutationFn: async () =>
      makePostRequest("items", {
        name,
        course: Number(courseId),
        parent: parentId,
        is_folder: true,
      }),
    onSuccess: () => {
      toast.add({ title: "Folder added." });
      invalidateItems();
      resetDialog();
    },
    onError: () =>
      toast.add({ title: "Could not add folder." }),
  });

  const createLinkMutation = useMutation({
    mutationFn: async () =>
      makePostRequest("items", {
        name,
        url,
        course: Number(courseId),
        parent: parentId,
        item_type: "link",
        is_folder: false,
      }),
    onSuccess: () => {
      toast.add({ title: "Link added." });
      invalidateItems();
      resetDialog();
    },
    onError: () =>
      toast.add({ title: "Could not add link." }),
  });

  const createFileMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error("File is required");
      }
      return createFileItemWithUpload({
        name,
        courseId,
        parentId,
        files: [file],
      });
    },
    onSuccess: () => {
      toast.add({ title: "File added." });
      invalidateItems();
      resetDialog();
    },
    onError: (error) => {
      if (error instanceof WikiItemRollbackFailedError) {
        toast.add({
          title: "Upload failed. Material was not added.",
          description:
            "We could not remove the draft. Refresh the list or delete the empty item.",
        });
        return;
      }
      toast.add({
        title: "Upload failed. Material was not added.",
        description: "Check your connection and try again.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => deleteEntity("items", itemId),
    onSuccess: () => {
      toast.add({ title: "Material removed." });
      invalidateItems();
    },
    onError: () =>
      toast.add({ title: "Could not remove material." }),
  });

  const isSaving =
    createFolderMutation.isPending ||
    createLinkMutation.isPending ||
    createFileMutation.isPending;

  const navigateToFolder = useCallback((item: WikiItem) => {
    setParentStack((prev) => [...prev, { id: item.id, name: item.name }]);
  }, []);

  const navigateBreadcrumb = useCallback((index: number) => {
    setParentStack((prev) => prev.slice(0, index + 1));
  }, []);

  const openItem = useCallback(
    async (
      item: WikiItem,
      cachedPreview?: WikiItemAttachmentPreview,
    ) => {
      if (item.is_folder) {
        navigateToFolder(item);
        return;
      }
      if (item.item_type === "link" && item.url) {
        window.open(item.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (item.item_type === "file") {
        try {
          let downloadUrl = cachedPreview?.downloadUrl ?? null;
          if (!downloadUrl) {
            const response = await fetchJuiceBoxAttachments(
              "app_wiki_item",
              String(item.id),
            );
            downloadUrl =
              response.attachments?.[0]?.downloadUrl ??
              response.attachments?.[0]?.download_url ??
              null;
          }
          if (!downloadUrl) {
            throw new Error("Missing download URL");
          }
          window.open(downloadUrl, "_blank", "noopener,noreferrer");
        } catch {
          toast.add({
            title: "Could not open this file.",
          });
        }
      }
    },
    [navigateToFolder, toast],
  );

  const canDeleteItem = useCallback(
    (item: WikiItem) => {
      if (!canEdit) return false;
      if (permissionsFor(user).can("course.manage_all")) return true;
      return item.created_by === user.id;
    },
    [canEdit, user],
  );

  const dialogTitle = useMemo(() => {
    if (dialogMode === "folder") return "New folder";
    if (dialogMode === "file") return "Upload file";
    if (dialogMode === "link") return "Add link";
    return "";
  }, [dialogMode]);

  const handleDialogPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (dialogMode !== "file" || isSaving || file) return;

      const clipboardFiles = collectClipboardFiles(e.clipboardData);
      if (clipboardFiles.length === 0) return;

      const { accepted, rejected } = filterFilesForAttachments(
        clipboardFiles,
        { isImageOnly: true, remainingSlots: 1 },
      );

      if (rejected.length > 0 && accepted.length === 0) {
        e.preventDefault();
        toast.add({
          type: "error",
          title: "Images only",
          description:
            "Paste only works with copied images (screenshots or photos).",
        });
        return;
      }

      if (accepted.length === 0) return;
      e.preventDefault();
      setFile(accepted[0] ?? null);
    },
    [dialogMode, file, isSaving, toast],
  );

  const handleDialogSubmit = useCallback(() => {
    if (!name.trim()) return;
    if (dialogMode === "folder") {
      createFolderMutation.mutate();
      return;
    }
    if (dialogMode === "link") {
      if (!url.trim()) return;
      createLinkMutation.mutate();
      return;
    }
    if (dialogMode === "file") {
      if (!file) return;
      createFileMutation.mutate();
    }
  }, [
    createFileMutation,
    createFolderMutation,
    createLinkMutation,
    dialogMode,
    file,
    name,
    url,
  ]);

  const items = itemsQuery.data ?? [];

  const fileItemIds = useMemo(
    () =>
      items
        .filter((item) => !item.is_folder && item.item_type === "file")
        .map((item) => item.id),
    [items],
  );

  const attachmentsQuery = useWikiItemAttachments(
    fileItemIds,
    !itemsQuery.isLoading && !itemsQuery.isError,
  );

  const attachmentByItemId = attachmentsQuery.data ?? {};

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex flex-row items-start justify-between gap-4 p-6">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-2xl font-medium">
              <BookOpen className="h-6 w-6" aria-hidden />
              Materials
            </h3>
            <p className="text-text-secondary">
              Course files, links, and folders for this class.
            </p>
          </div>
          {canEdit ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setDialogMode("folder")}
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                New folder
              </Button>
              <Button size="sm" onClick={() => setDialogMode("file")}>
                <Upload className="mr-2 h-4 w-4" />
                Upload file
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setDialogMode("link")}
              >
                <Link className="mr-2 h-4 w-4" />
                Add link
              </Button>
            </div>
          ) : null}
        </div>
        <div className="space-y-4 p-6 pt-0">
          <nav
            className="flex flex-wrap items-center gap-1 text-sm"
            aria-label="Folder path"
          >
            {parentStack.map((crumb, index) => {
              const isLast = index === parentStack.length - 1;
              return (
                <span key={`${crumb.id ?? "root"}-${index}`} className="inline-flex items-center gap-1">
                  {index > 0 ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  ) : null}
                  {isLast ? (
                    <span className="font-medium text-foreground">{crumb.name}</span>
                  ) : (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => navigateBreadcrumb(index)}
                    >
                      {crumb.name}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>

          {itemsQuery.isLoading ? (
            <div className="space-y-4" aria-busy="true">
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-xl border p-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-48 max-w-full" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="aspect-[4/5] rounded-2xl" />
                ))}
              </div>
            </div>
          ) : itemsQuery.isError ? (
            <p className="text-sm text-destructive" role="alert">
              Could not load materials.
            </p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No materials in this folder yet.
              {canEdit ? " Use the buttons above to add folders, files, or links." : ""}
            </p>
          ) : (
            <CourseMaterialsGallery
              items={items}
              attachmentByItemId={attachmentByItemId}
              attachmentsLoading={attachmentsQuery.isLoading}
              canDeleteItem={canDeleteItem}
              deletePending={deleteMutation.isPending}
              onDelete={(itemId) => deleteMutation.mutate(itemId)}
              onOpenFolder={navigateToFolder}
              onOpenMaterial={(item) =>
                void openItem(item, attachmentByItemId[item.id])
              }
            />
          )}
        </div>
      </div>

      <Dialog.Root
        open={dialogMode != null}
        onOpenChange={(open) => {
          if (!open && !isSaving) resetDialog();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup className="sm:max-w-md" onPaste={handleDialogPaste}>
            <Dialog.Title>{dialogTitle}</Dialog.Title>
          <div className="space-y-4 py-2">
            <Field.Root className="space-y-2">
              <Field.Label htmlFor="material-name">Name</Field.Label>
              <Input
                id="material-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSaving}
                placeholder="Enter a name"
              />
            </Field.Root>
            {dialogMode === "link" ? (
              <Field.Root className="space-y-2">
                <Field.Label htmlFor="material-url">Link URL</Field.Label>
                <Input
                  id="material-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isSaving}
                  placeholder="https://"
                />
              </Field.Root>
            ) : null}
            {dialogMode === "file" ? (
              <Field.Root className="space-y-2">
                <Field.Label htmlFor="material-file">File</Field.Label>
                <Input
                  id="material-file"
                  type="file"
                  disabled={isSaving}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  You can also paste an image from your clipboard.
                </p>
              </Field.Root>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={resetDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={isSaving}
              disabled={isSaving || !name.trim() || (dialogMode === "link" && !url.trim()) || (dialogMode === "file" && !file)}
              onClick={handleDialogSubmit}
            >
              Save
            </Button>
          </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

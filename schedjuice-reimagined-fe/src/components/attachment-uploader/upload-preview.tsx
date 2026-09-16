"use client";
import { Button, Dialog } from "@/components/primitives";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { VisuallyHidden } from "react-aria";
import { Microphone as FileAudio, Page as FileIcon, Xmark as X } from "iconoir-react";
import { attachmentType } from "@/types/attachment";
import { downloadFile, isImage } from "@/helpers/file";
import {
  getAttachmentUrl,
  isAttachmentImage,
} from "@/lib/attachment/attachment-url";
import { cn } from "@/lib/utils";

interface UploadPreviewProps {
  files: (File | attachmentType)[];
  setFiles?: (files: (File | attachmentType)[]) => void;
  canDelete?: boolean;
  isPublicData?: boolean;
  setToDeletedAttachmentId?: React.Dispatch<React.SetStateAction<number[]>>;
}

function getSortableId(
  f: File | attachmentType,
  index: number,
  fileIdMap: WeakMap<File, string>,
): string {
  if (f instanceof File) {
    let id = fileIdMap.get(f);
    if (!id) {
      id = `file-${crypto.randomUUID()}`;
      fileIdMap.set(f, id);
    }
    return id;
  }
  return `att-${f.id ?? index}`;
}

type SortableTileProps = {
  id: string;
  sortable: boolean;
  className?: string;
  children: React.ReactNode;
};

function SortableTile({ id, sortable, className, children }: SortableTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !sortable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        className,
        sortable && "cursor-grab active:cursor-grabbing",
        isDragging && "z-10 opacity-80",
      )}
      {...(sortable ? { ...attributes, ...listeners } : {})}
    >
      {children}
    </div>
  );
}

const UploadPreview: React.FC<UploadPreviewProps> = ({
  files,
  setFiles,
  canDelete = true,
  isPublicData = false,
  setToDeletedAttachmentId,
}) => {
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | undefined>();
  const fileIdMap = useRef(new WeakMap<File, string>());

  const sortable = Boolean(setFiles);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const sortableIds = useMemo(
    () => files.map((f, i) => getSortableId(f, i, fileIdMap.current)),
    [files],
  );

  const getPersistedDownload = (
    f: File | attachmentType,
  ): { url: string; filename: string } | null => {
    if (f instanceof File) return null;
    const url = getAttachmentUrl(
      isPublicData ? { ...f, data: f.public_data ?? f.data } : f,
    ).trim();
    if (!url) return null;
    return { url, filename: f.filename };
  };

  const handlePersistedDownload = (f: File | attachmentType) => {
    const download = getPersistedDownload(f);
    if (!download) return;
    downloadFile(download.url, download.filename);
  };

  const removeFile = useCallback(
    (f: File | attachmentType) => {
      if (!setFiles) return;
      if (f instanceof File) {
        setFiles(
          files.filter((file) => {
            if (file instanceof File) return f !== file;
            return true;
          }),
        );
      } else {
        setFiles(
          files.filter((file) => {
            if (file instanceof File) return true;
            return f.id !== (file as attachmentType).id;
          }),
        );
        setToDeletedAttachmentId?.((prev) => [...prev, f.id]);
      }
    },
    [files, setFiles, setToDeletedAttachmentId],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!setFiles || !over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    setFiles(arrayMove(files, oldIndex, newIndex));
  };

  const renderFile = (f: File | attachmentType, i: number) => {
    const sortableId = sortableIds[i];
    const isFile = f instanceof File;
    const isImg = isFile ? isImage(f) : isAttachmentImage(f);
    const displayName = isFile ? f.name : f.filename;
    const isAudio = isFile
      ? f.type.startsWith("audio/")
      : (f.file_type || "").startsWith("audio/");

    if (!isImg) {
      const persistedDownload = getPersistedDownload(f);
      const canDownload = Boolean(persistedDownload);

      return (
        <SortableTile
          key={sortableId}
          id={sortableId}
          sortable={sortable}
          className={cn(
            "group relative h-20 w-20 overflow-hidden rounded-md border border-border bg-card shadow-sm sm:h-24 sm:w-24",
            canDownload && "cursor-pointer",
          )}
        >
          <div
            onClick={() => canDownload && handlePersistedDownload(f)}
            onKeyDown={(e) => {
              if (canDownload && e.key === "Enter") {
                handlePersistedDownload(f);
              }
            }}
            role={canDownload ? "button" : undefined}
            tabIndex={canDownload ? 0 : undefined}
            aria-label={canDownload ? `Download ${displayName}` : undefined}
            className="h-full w-full"
          >
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              {isAudio ? (
                <FileAudio className="h-7 w-7 text-muted-foreground" />
              ) : (
                <FileIcon className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-[10px] leading-tight text-white"
              title={displayName}
            >
              {displayName}
            </div>
          </div>
          {canDelete && (
            <div className="absolute inset-0 hidden items-start justify-end p-1 group-hover:flex bg-black/0 group-hover:bg-black/10 transition">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(f);
                }}
                size="sm" variant="secondary"
                className="pointer-events-auto h-5 w-5"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </SortableTile>
      );
    }

    const imageUrl = attachmentUrls[i] || "";

    return (
      <SortableTile
        key={sortableId}
        id={sortableId}
        sortable={sortable}
        className="group relative h-20 w-20 overflow-hidden rounded-md border border-border bg-card shadow-sm sm:h-24 sm:w-24"
      >
        <Image
          unoptimized
          className="h-full w-full object-cover"
          width={128}
          height={128}
          src={imageUrl}
          alt={displayName}
          onClick={() => {
            if (imageUrl) {
              setSelectedImage(imageUrl);
              setIsDialogOpen(true);
            }
          }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-[10px] leading-tight text-white"
          title={displayName}
        >
          {displayName}
        </div>
        {canDelete && (
          <div className="pointer-events-none absolute inset-0 items-start justify-end p-1 group-hover:flex bg-black/0 group-hover:bg-black/10 transition">
            <Button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeFile(f);
              }}
              size="sm" variant="secondary"
              className="pointer-events-auto h-5 w-5"
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SortableTile>
    );
  };

  useEffect(() => {
    const urls = files.map((f) => {
      if (f instanceof File) {
        return URL.createObjectURL(f);
      }
      if (isPublicData && f.public_data) {
        return getAttachmentUrl({ ...f, data: f.public_data });
      }
      return getAttachmentUrl(f);
    });
    setAttachmentUrls(urls);
    return () => {
      files.forEach((f, idx) => {
        if (f instanceof File && urls[idx]) {
          URL.revokeObjectURL(urls[idx]);
        }
      });
    };
  }, [files, isPublicData]);

  const grid = (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => renderFile(f, i))}
    </div>
  );

  return (
    <>
      {sortable ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortableIds}
            strategy={horizontalListSortingStrategy}
          >
            {grid}
          </SortableContext>
        </DndContext>
      ) : (
        grid
      )}
      <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="m-0 w-full bg-transparent p-0">
          <VisuallyHidden>
            <Dialog.Title>Image preview</Dialog.Title>
          </VisuallyHidden>
          {selectedImage && (
            <Image
              unoptimized
              width={1024}
              height={1024}
              className="h-full w-full object-contain"
              src={selectedImage}
              alt="Selected Image"
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default UploadPreview;

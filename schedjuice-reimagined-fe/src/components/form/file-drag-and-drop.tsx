import { Button, Dialog, buttonVariants, useToast } from "@/components/primitives";
import { Page as FileIcon, Microphone as FileAudio, CloudUpload as UploadCloud, Xmark as X } from "iconoir-react";
import { useDropzone } from "react-dropzone";
import { useCallback, useEffect, useState } from "react";
import { VisuallyHidden } from "react-aria";
import { v4 as uuid } from "uuid";
import Image from "next/image";
import {
  downloadFile,
  isImage,
  ALLOWED_ACCEPT_FOR_DROPZONE,
  ALLOWED_ACCEPT_INPUT,
  ALLOWED_ACCEPT_NO_VIDEO_FOR_DROPZONE,
  ALLOWED_ACCEPT_NO_VIDEO_INPUT,
  isAllowedFileType,
  isAllowedFileTypeNoVideo,
} from "@/helpers/file";
import { fileType } from "@/config/quiz";
import { cn } from "@/lib/utils";
import ImageCarousel from "../images/carousel";
import {
  type FileDragAndDropDensity,
  fileDropzoneButtonWrapClassName,
  fileDropzoneIconClassName,
  fileDropzoneIconWrapClassName,
  fileDropzoneInnerClassName,
  fileDropzoneRootClassName,
} from "./file-drag-and-drop-density";
import {
  collectClipboardFiles,
  filterFilesForAttachments,
} from "@/components/attachment-uploader/attachment-dropzone-files";

export type externalFileType = {
  id: string;
  src: string;
  name: string;
  is_image: boolean;
  fileType?: fileType;
  reference_key?: string;
};
export type localFileType = {
  id: string;
  file: File;
  isRemoved?: boolean;
  is_image: boolean;
  fileType?: fileType;
};

export type extendedFileType = externalFileType | localFileType;

interface IFileDragAndDropProps {
  label?: string;
  labelClassName?: string;
  className?: string;
  files: extendedFileType[];
  setFiles: (files: extendedFileType[]) => void;
  isReadOnly?: boolean;
  isDownloadable?: boolean;
  isMultiple?: boolean;
  showSelectedFiles?: boolean;
  showSelectionCount?: boolean;
  buttonLabel?: string;
  isButtonDisabled?: boolean;
  disabled?: boolean;
  maxSize?: number;
  maxFiles?: number;
  showCarousel?: boolean;
  showCarouselControls?: boolean;
  excludeVideos?: boolean;
  density?: FileDragAndDropDensity;
}

const FileDragAndDrop: React.FC<IFileDragAndDropProps> = ({
  label = "Attachments",
  labelClassName,
  className,
  files,
  setFiles,
  isReadOnly: readOnly = false,
  isDownloadable: downloadable = true,
  isMultiple = true,
  showSelectedFiles = true,
  showSelectionCount = true,
  buttonLabel = "Add",
  isButtonDisabled = false,
  disabled = false,
  maxSize = 100 * 1024 * 1024,
  maxFiles = 3,
  showCarousel = true,
  showCarouselControls = true,
  excludeVideos = false,
  density = "default",
}) => {
  const dropzoneAccept = excludeVideos
    ? ALLOWED_ACCEPT_NO_VIDEO_FOR_DROPZONE
    : ALLOWED_ACCEPT_FOR_DROPZONE;
  const inputAccept = excludeVideos
    ? ALLOWED_ACCEPT_NO_VIDEO_INPUT
    : ALLOWED_ACCEPT_INPUT;
  const fileTypeAllowed = excludeVideos ? isAllowedFileTypeNoVideo : isAllowedFileType;
  const allowedTypesDescription = excludeVideos
    ? "Images, PDF, and Office documents"
    : "Images, videos, PDF, and Office documents";
  const [sources, setSources] = useState<(string | null)[]>([]);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | undefined>();
  const toast = useToast();
  const appendAcceptedFiles = useCallback(
    (acceptedFiles: File[]) => {
      if (files.length + acceptedFiles.length > maxFiles) {
        toast.add({
          type: "error",
          title: "Max files reached",
          description: `You can only upload ${maxFiles} files`,
        });
        return;
      }
      const filtered = acceptedFiles.filter((f) => {
        const ok = fileTypeAllowed(f);
        if (!ok) {
          toast.add({
            type: "error",
            title: "Unsupported file type",
            description: excludeVideos
              ? `${f.name} is not allowed. Allowed: photos, PDF, Microsoft Office files (no videos).`
              : `${f.name} is not allowed. Allowed: photos, videos, PDF, Microsoft Office files`,
          });
        }
        return ok;
      });
      if (filtered.length === 0) return;
      setFiles([
        ...files,
        ...filtered.map((f) => ({
          file: f,
          id: uuid().toString(),
          is_image: isImage(f),
        })),
      ]);
    },
    [excludeVideos, fileTypeAllowed, files, maxFiles, setFiles, toast],
  );

  const onDrop = (acceptedFiles: File[]) => {
    appendAcceptedFiles(acceptedFiles);
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const clipboardFiles = collectClipboardFiles(e.clipboardData);
      if (clipboardFiles.length === 0) return;

      const visibleCount = files.filter(
        (f) => !("isRemoved" in f && f.isRemoved),
      ).length;
      const remaining = Math.max(0, maxFiles - visibleCount);
      const { accepted, rejected } = filterFilesForAttachments(
        clipboardFiles,
        { isImageOnly: true, remainingSlots: remaining },
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
      appendAcceptedFiles(accepted);
    },
    [appendAcceptedFiles, files, maxFiles, toast],
  );
  const removeFile = (file: extendedFileType) => {
    if ("src" in file && file.src) {
      setFiles(
        files.map((f) => (f.id === file.id ? { ...file, isRemoved: true } : f))
      );
    } else {
      setFiles(files.filter((f) => f.id !== file.id));
    }
  };
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: isMultiple,
    noClick: true,
    noKeyboard: true,
    disabled: disabled || readOnly,
    maxSize: maxSize * 1024 * 1024,
    maxFiles: maxFiles,
    accept: dropzoneAccept,
    onDropRejected(fileRejections) {
      toast.add({
        title: "Error",
        description: fileRejections.map((f) => f.errors[0].message).join(", "),
        type: "error",
      });
    },
  });

  const attachmentClickHandler = (f: extendedFileType) => {
    if ("src" in f) {
      downloadFile(f.src, f.name);
    }
  };

  const visibleFiles = files.filter(
    (f) => !("isRemoved" in f && f.isRemoved)
  );

  useEffect(() => {
    const visible = files.filter((f) => !("isRemoved" in f && f.isRemoved));
    const newSources: (string | null)[] = visible.map((f) => {
      if ("file" in f && f.is_image) return URL.createObjectURL(f.file);
      if ("src" in f && f.is_image) return f.src;
      return null;
    });
    setSources(newSources);
  }, [files]);

  const displayName = (f: extendedFileType) =>
    "file" in f && f.file ? f.file.name : "name" in f ? f.name : "";

  const isAudio = (f: extendedFileType) =>
    "file" in f && f.file
      ? f.file.type.startsWith("audio/")
      : "src" in f && "name" in f
        ? false
        : false;

  return (
    <div className={cn("space-y-4", className)}>
      <label className={labelClassName ?? "text-sm font-medium"}>{label}</label>
      {!readOnly && (
        <div
          {...getRootProps({
            className: cn(
              fileDropzoneRootClassName(density),
              disabled && "pointer-events-none opacity-50",
            ),
            onPaste: handlePaste,
          })}
        >
          <input {...getInputProps()} accept={inputAccept} />
          <div className={fileDropzoneInnerClassName(density)}>
            <div
              className={cn(
                fileDropzoneIconWrapClassName(density),
                isDragActive ? "bg-primary/10" : "bg-muted",
              )}
            >
              <UploadCloud
                className={cn(
                  fileDropzoneIconClassName(density),
                  isDragActive ? "text-primary" : "text-muted-foreground",
                )}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm">
                {isDragActive ? (
                  <span className="text-primary">Drop to upload</span>
                ) : (
                  <>
                    Drag & drop files here or
                    <span className="mx-1 font-medium">browse</span>
                    to upload
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {allowedTypesDescription}
                {maxFiles ? ` • Up to ${maxFiles} file${maxFiles > 1 ? "s" : ""}` : ""}
                {" • Paste images from clipboard"}
              </p>
            </div>
          </div>
          <div className={fileDropzoneButtonWrapClassName(density)}>
            <Button
              type="button"
              variant="secondary" disabled={disabled || isButtonDisabled || visibleFiles.length >= maxFiles}
              onClick={open}
            >
              {buttonLabel}
            </Button>
          </div>
        </div>
      )}
      {showSelectionCount ? (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {visibleFiles.length} selected
          </div>
          {visibleFiles.length > 0 && !readOnly && (
            <Button
              type="button"
              variant="ghost" size="sm"
              onClick={() => setFiles([])}
            >
              Clear
            </Button>
          )}
        </div>
      ) : null}
      {showSelectedFiles && (
        <div className="flex gap-2 flex-wrap">
          {visibleFiles.map((f, i) => {
            const name = displayName(f);
            if (!f.is_image) {
              return (
                <div
                  key={f.id}
                  className={`group relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-md border border-border bg-card shadow-sm ${downloadable && "src" in f && f.src ? "cursor-pointer" : ""}`}
                  onClick={() => downloadable && "src" in f && f.src && attachmentClickHandler(f)}
                  onKeyDown={(e) => downloadable && "src" in f && f.src && e.key === "Enter" && attachmentClickHandler(f)}
                  role={downloadable && "src" in f && f.src ? "button" : undefined}
                  tabIndex={downloadable && "src" in f && f.src ? 0 : undefined}
                >
                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    {isAudio(f) ? (
                      <FileAudio className="h-7 w-7 text-muted-foreground" />
                    ) : (
                      <FileIcon className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <div
                    className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-[10px] leading-tight text-white"
                    title={name}
                  >
                    {name}
                  </div>
                  {!readOnly && (
                    <div className="absolute inset-0 hidden items-start justify-end p-1 group-hover:flex bg-black/0 group-hover:bg-black/10 transition">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm" className="h-5 w-5"
                        aria-label="Remove"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeFile(f);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            }
            const src = sources[i] ?? ("src" in f ? f.src : null);
            return (
              <div
                key={f.id}
                className="group relative overflow-hidden rounded-md border border-border bg-card shadow-sm h-20 w-20 sm:h-24 sm:w-24"
              >
                {src && (
                  <Image
                    unoptimized
                    className="h-full w-full object-cover cursor-pointer"
                    width={128}
                    height={128}
                    src={src}
                    alt={name}
                    onClick={() => {
                      setSelectedImageSrc(src);
                      setIsImageDialogOpen(true);
                    }}
                  />
                )}
                <div
                  className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-[10px] leading-tight text-white"
                  title={name}
                >
                  {name}
                </div>
                {!readOnly && (
                  <div className="pointer-events-none absolute inset-0 hidden items-start justify-end p-1 group-hover:flex bg-black/0 group-hover:bg-black/10 transition">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm" className="pointer-events-auto h-5 w-5"
                      aria-label="Remove"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeFile(f);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showCarousel && visibleFiles.filter((f) => f.is_image).length > 0 && (
        <ImageCarousel
          images={sources.filter((s): s is string => s != null)}
          showControls={showCarouselControls}
        />
      )}
      <Dialog.Root open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="m-0 w-full bg-transparent p-0">
          <VisuallyHidden>
            <Dialog.Title>Image preview</Dialog.Title>
          </VisuallyHidden>
          {selectedImageSrc && (
            <Image
              unoptimized
              width={1024}
              height={1024}
              className="h-full w-full object-contain"
              src={selectedImageSrc}
              alt="Preview"
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default FileDragAndDrop;

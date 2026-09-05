"use client";
import { Button } from "@/components/primitives";

import UploadPreview from "./upload-preview";
import { attachmentType } from "@/types/attachment";
import { Attachment as Paperclip, CloudUpload as UploadCloud } from "iconoir-react";
import {
  ALLOWED_ACCEPT_INPUT,
} from "@/helpers/file";
import {
  useAttachmentDropzone,
  type AttachmentDropzoneBindings,
} from "./use-attachment-dropzone";

interface AttachmentUploaderProps {
  entityName: string;
  maxFiles?: number;
  attachments: (attachmentType | File)[];
  setAttachments: (attachments: (attachmentType | File)[]) => void;
  isImageOnly?: boolean;
  isAnnouncement?: boolean;
  setToDeletedAttachmentId?: React.Dispatch<React.SetStateAction<number[]>>;
  dropzone?: AttachmentDropzoneBindings;
}

const AttachmentUploader: React.FC<AttachmentUploaderProps> = ({
  entityName: _entityName,
  maxFiles = 1,
  attachments,
  setAttachments,
  isImageOnly = false,
  isAnnouncement = false,
  setToDeletedAttachmentId,
  dropzone: externalDropzone,
}) => {
  const internalDropzone = useAttachmentDropzone({
    attachments,
    setAttachments,
    maxFiles,
    isImageOnly,
  });

  const dropzone = externalDropzone ?? internalDropzone;
  const { getRootProps, getInputProps, isDragActive, open, onPaste } = dropzone;
  const ownsDropzone = !externalDropzone;

  const handlePaste = (e: React.ClipboardEvent) => {
    onPaste(e.nativeEvent);
  };

  return (
    <div className="space-y-4" onPaste={handlePaste}>
      {isAnnouncement ? (
        <div className="flex items-center gap-3">
          {ownsDropzone && (
            <input
              {...getInputProps()}
              accept={isImageOnly ? "image/*" : ALLOWED_ACCEPT_INPUT}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 rounded-lg border border-border shadow-xs"
            onClick={open}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <p className="text-xs text-muted-foreground">
            {isImageOnly
              ? "You can also paste images from your clipboard"
              : "Attach PDFs and documents (use the editor toolbar for images)"}
          </p>
        </div>
      ) : (
        <div
          {...getRootProps({
            className:
              "group relative flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 hover:bg-muted/40 transition-colors p-6 sm:p-8 text-center outline-none",
          })}
        >
          <input
            {...getInputProps()}
            accept={isImageOnly ? "image/*" : ALLOWED_ACCEPT_INPUT}
          />
          <div className="pointer-events-none flex flex-col items-center gap-3">
            <div
              className={`rounded-full p-2 ${
                isDragActive ? "bg-primary/10" : "bg-muted"
              }`}
            >
              <UploadCloud
                className={`h-6 w-6 ${
                  isDragActive ? "text-primary" : "text-muted-foreground"
                }`}
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
                {isImageOnly
                  ? "Images only"
                  : "Images, videos, PDF, and Office documents"}
                {maxFiles
                  ? ` • Up to ${maxFiles} file${maxFiles > 1 ? "s" : ""}`
                  : ""}
                {" • Paste images from clipboard"}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Button type="button" variant="secondary" onClick={open}>
              Choose files
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {attachments.length} selected
        </div>
        {attachments.length > 0 && (
          <Button
            type="button"
            variant="ghost" size="sm"
            onClick={() => {
              setAttachments([]);
              setToDeletedAttachmentId?.((prev) => [
                ...prev,
                ...attachments
                  .filter(
                    (att): att is attachmentType => !(att instanceof File),
                  )
                  .map((att) => att.id),
              ]);
            }}
          >
            Clear
          </Button>
        )}
      </div>
      <UploadPreview
        files={attachments}
        setFiles={setAttachments}
        setToDeletedAttachmentId={setToDeletedAttachmentId}
      />
    </div>
  );
};

export default AttachmentUploader;

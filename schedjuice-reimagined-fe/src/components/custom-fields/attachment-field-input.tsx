"use client";

import { Button, useToast } from "@/components/primitives";
import {
  uploadCustomFieldAttachments,
} from "@/lib/custom-fields/attachment-api";
import {
  attachmentRulesFromValidationRules,
  buildAttachmentDropzoneAccept,
  buildAttachmentFileInputAccept,
  PRESET_EXTENSIONS,
} from "@/lib/custom-fields/attachment-rules";
import {
  attachmentRowLabel,
  isImageAttachment,
  mergeDoneFilesFromValue,
  parseDoneFiles,
  toFormAttachmentValue,
  type DoneFile,
} from "@/lib/custom-fields/attachment-field-state";
import type { FormConfigField } from "@/types/form-config";
import { Attachment as Paperclip, Trash as Trash2 } from "iconoir-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";

type AttachmentFieldInputProps = {
  field: FormConfigField;
  entityType: string;
  value: unknown;
  onChange: (next: ReturnType<typeof toFormAttachmentValue>) => void;
  readOnly: boolean;
  onUploadStateChange?: (uploading: boolean) => void;
};

export function AttachmentFieldInput({
  field,
  entityType,
  value,
  onChange,
  readOnly,
  onUploadStateChange,
}: AttachmentFieldInputProps) {
  const toast = useToast();
  const rules = useMemo(
    () => attachmentRulesFromValidationRules(field.validationRules),
    [field.validationRules],
  );
  const [files, setFiles] = useState<DoneFile[]>(() => parseDoneFiles(value));
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setFiles((prev) => mergeDoneFilesFromValue(prev, value));
  }, [value]);

  useEffect(() => {
    onUploadStateChange?.(uploading);
  }, [onUploadStateChange, uploading]);

  const sync = useCallback(
    (next: DoneFile[]) => {
      setFiles(next);
      onChange(toFormAttachmentValue(next));
    },
    [onChange],
  );

  const maxBytes = rules.max_file_size_mb * 1024 * 1024;
  const allowedExt =
    rules.allowed_extensions.length > 0
      ? rules.allowed_extensions
      : PRESET_EXTENSIONS[rules.file_type_preset];

  const fileInputAccept = useMemo(
    () => buildAttachmentFileInputAccept(allowedExt),
    [allowedExt],
  );
  const dropzoneAccept = useMemo(
    () => buildAttachmentDropzoneAccept(allowedExt),
    [allowedExt],
  );

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const remaining = Math.max(0, rules.max_files - files.length);
      const batch = accepted.slice(0, remaining);
      if (batch.length === 0) {
        toast.add({
          type: "error",
          title: "Limit reached",
          description: `You can upload at most ${rules.max_files} file(s).`,
        });
        return;
      }
      for (const file of batch) {
        const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
        if (!allowedExt.includes(ext)) {
          toast.add({
            type: "error",
            title: "Unsupported file type",
            description: `${file.name} is not allowed.`,
          });
          return;
        }
        if (file.size > maxBytes) {
          toast.add({
            type: "error",
            title: "File too large",
            description: `${file.name} exceeds ${rules.max_file_size_mb} MB.`,
          });
          return;
        }
      }

      setUploading(true);
      try {
        const uploaded = await uploadCustomFieldAttachments({
          entityType,
          fieldKey: field.fieldKey,
          files: batch,
        });
        const next = [
          ...files,
          ...uploaded.map((row) => ({
            id: row.id,
            filename: row.filename,
            size: row.size ?? 0,
            mime: row.mime ?? row.file_type,
            downloadUrl: row.download_url,
          })),
        ];
        sync(next);
      } catch (err) {
        toast.add({
          type: "error",
          title: "Upload failed",
          description: err instanceof Error ? err.message : "Try again.",
        });
      } finally {
        setUploading(false);
      }
    },
    [
      allowedExt,
      entityType,
      field.fieldKey,
      files,
      maxBytes,
      rules.max_file_size_mb,
      rules.max_files,
      sync,
      toast,
    ],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted) => void onDrop(accepted),
    maxFiles: rules.max_files,
    maxSize: maxBytes,
    accept: dropzoneAccept,
    disabled: readOnly || uploading || files.length >= rules.max_files,
    noClick: true,
    noKeyboard: true,
  });

  if (readOnly) {
    return (
      <ul className="space-y-2 text-sm">
        {files.map((f) => (
          <li key={f.id} className="truncate">
            {attachmentRowLabel(f)}
          </li>
        ))}
        {files.length === 0 ? <span className="text-muted-foreground">—</span> : null}
      </ul>
    );
  }

  return (
    <div {...getRootProps()} className="space-y-3 rounded-lg border border-dashed p-4">
      <input
        {...getInputProps()}
        accept={fileInputAccept}
        capture={rules.allow_camera_capture ? "environment" : undefined}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={open}
          disabled={uploading || files.length >= rules.max_files}
        >
          <Paperclip className="mr-1 h-4 w-4" />
          Choose file{rules.max_files > 1 ? "s" : ""}
        </Button>
        <span className="text-xs text-muted-foreground">
          {uploading
            ? "Uploading…"
            : isDragActive
              ? "Drop to upload"
              : `Up to ${rules.max_file_size_mb} MB`}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Allowed: {allowedExt.join(", ")}
      </p>
      <ul className="space-y-2">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              {isImageAttachment(file) && file.downloadUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file.downloadUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : null}
              <span className="min-w-0 truncate">{attachmentRowLabel(file)}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove file"
              disabled={uploading}
              onClick={(e) => {
                e.stopPropagation();
                sync(files.filter((f) => f.id !== file.id));
              }}
            >
              <Trash2 className="size-5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";
import { Progress } from "@/components/misc/progress";

import { formatBytes } from "@/lib/product-docs/media-markdown";

type UploadPlaceholderProps = {
  fileName: string;
  fileSize: number;
  progress: number;
};

export function DocsMarkdownEditorUploadPlaceholder({
  fileName,
  fileSize,
  progress,
}: UploadPlaceholderProps) {
  return (
    <div className="my-3 rounded-lg border border-dashed border-border bg-surface-elevated p-4">
      <p className="text-sm font-medium text-text-primary">
        {fileName}
        <span className="text-text-muted"> · {formatBytes(fileSize)}</span>
      </p>
      <Progress className="mt-2" value={progress} />
      <p className="mt-1 text-xs text-text-muted">Uploading… {progress}%</p>
    </div>
  );
}

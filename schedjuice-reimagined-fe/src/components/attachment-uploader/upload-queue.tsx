"use client";
import { Button } from "@/components/primitives";
import { Progress } from "@/components/misc/progress";

import { useUploadQueueStore } from "./upload-queue-store";

function formatEta(seconds?: number) {
  if (!seconds || !isFinite(seconds)) return "--";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatSpeed(bps?: number) {
  if (!bps || !isFinite(bps)) return "";
  const kb = bps / 1024;
  const mb = kb / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${kb.toFixed(0)} KB/s`;
}

export default function UploadQueue() {
  const store = useUploadQueueStore();
  const { items, markCanceled } = store as any;

  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No active uploads</div>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {items.map((it: any) => (
        <div key={it.id} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate" title={it.fileName}>
                {it.fileName}
              </span>
              <span className="text-muted-foreground">
                {Math.round((it.progress || 0) * 100)}%
              </span>
            </div>
            <Progress value={(it.progress || 0) * 100} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>{formatSpeed(it.speedBps)}</span>
              <span>ETA: {formatEta(it.etaSeconds)}</span>
            </div>
            {it.errorMessage && (
              <div className="text-xs text-destructive mt-1">
                {it.errorMessage}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {it.status === "uploading" && it.abort && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    it.abort?.();
                    (store as any).markPaused?.(it.id);
                  }}
                >
                  Pause
                </Button>
              </>
            )}
            {it.resume &&
              (it.status === "canceled" || it.status === "paused") && (
                <Button
                  size="sm"
                  variant="primary" onClick={() => it.resume?.()}
                >
                  Resume
                </Button>
              )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                it.abort?.();
                markCanceled?.(it.id);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

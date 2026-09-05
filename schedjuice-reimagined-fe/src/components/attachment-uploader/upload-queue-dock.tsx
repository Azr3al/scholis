"use client";

import UploadQueue from "./upload-queue";
import { useUploadQueueStore } from "./upload-queue-store";

export default function UploadQueueDock() {
  const { items } = useUploadQueueStore();

  return (
    <div className="fixed bottom-4 right-4 z-toast w-[380px] max-w-[90vw]">
      <div className="rounded-md border border-border bg-background shadow-lg">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-medium">Uploads</div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
            </div>
          </div>
        </div>
        <div className="p-3">
          <UploadQueue />
        </div>
      </div>
    </div>
  );
}

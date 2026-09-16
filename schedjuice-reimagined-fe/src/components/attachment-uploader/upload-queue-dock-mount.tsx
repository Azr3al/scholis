"use client";

import UploadQueueDock from "./upload-queue-dock";
import { useUploadQueueStore } from "./upload-queue-store";

export default function UploadQueueDockMount() {
  const { items } = useUploadQueueStore();
  if (!items || items.length === 0) return null;
  return <UploadQueueDock />;
}

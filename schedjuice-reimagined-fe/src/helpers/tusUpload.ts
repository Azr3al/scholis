import { useUploadQueueStore } from "@/components/attachment-uploader/upload-queue-store";
import { getCookie } from "cookies-next";
import { Upload } from "tus-js-client";

export type UploadMeta = {
  tableName: string;
  foreignKey: string;
  isPublic?: boolean;
  token: string;
  clientTag?: string;
};

export type UploadStatus =
  | { status: "idle" }
  | { status: "uploading"; bytesSent: number; bytesTotal: number }
  | { status: "success"; url: string | null }
  | { status: "error"; error: Error };

export function startTusUpload(
  file: File,
  meta: UploadMeta,
  onUpdate: (u: UploadStatus) => void
) {
  const schema = getCookie("schema");
  const base = process.env.NEXT_PUBLIC_TUSD_ORIGIN || "";
  const endpoint = `${base}/files/`;
  // any cuz tus didn't provided the types
  const upload: any = new Upload(file, {
    endpoint,
    metadata: {
      original_name: file.name,
      file_type: file.type || "application/octet-stream",
      is_image: String((file.type || "").startsWith("image/")),
      table_name: meta.tableName,
      foreign_key: meta.foreignKey,
      is_public: String(Boolean(meta.isPublic)),
      client_tag: meta.clientTag || "",
      // Tus hooks often do not forward X-Schema; embed tenant schema for post-finish DB writes.
      schema: String(schema ?? ""),
    },
    headers: {
      Authorization: `Bearer ${meta.token}`,
      "X-Schema": schema as string,
    },
    chunkSize: 8 * 1024 * 1024, // 8 MiB
    parallelUploads: 3,
    retryDelays: [0, 3000, 5000, 10000],
    onError: (error: Error) => onUpdate({ status: "error", error }),
    onProgress: (bytesSent: number, bytesTotal: number) =>
      onUpdate({ status: "uploading", bytesSent, bytesTotal }),
    onSuccess: () => onUpdate({ status: "success", url: upload.url }),
  });

  upload.start();
  return upload;
}

// Convenience wrapper that wires into the upload queue toast/store
export function startTusUploadWithQueue(file: File, meta: UploadMeta) {
  const schema = getCookie("schema");
  const state = useUploadQueueStore.getState();
  const id = state.addItem({ fileName: file.name, fileSize: file.size });
  const base = process.env.NEXT_PUBLIC_TUSD_ORIGIN || "";
  const endpoint = `${base}/files/`;
  const parallel = 1; // disable concatenation to avoid UploadPartCopy on large files
  let upload: any = new Upload(file, {
    endpoint,
    metadata: {
      original_name: file.name,
      file_type: file.type || "application/octet-stream",
      is_image: String((file.type || "").startsWith("image/")),
      table_name: meta.tableName,
      foreign_key: meta.foreignKey,
      is_public: String(Boolean(meta.isPublic)),
      client_tag: meta.clientTag || "",
      schema: String(schema ?? ""),
    },
    headers: { Authorization: `Bearer ${meta.token}`, "X-Schema": schema! },
    chunkSize: 8 * 1024 * 1024,
    parallelUploads: parallel,
    retryDelays: [0, 3000, 5000, 10000],
    onBeforeRequest: () => state.setUploading(id),
    onProgress: (sent: number, total: number) =>
      state.updateProgress(id, sent, total),
    onSuccess: () => state.markSuccess(id, upload.url || null),
    onError: (error: Error) => state.markError(id, error.message),
  });
  state.setAbort(id, () => upload.abort());
  // Provide hard termination (deletes the TUS upload on server) to avoid ghost parts
  state.setTerminate?.(id, () => {
    try {
      // terminate() sends DELETE to current upload URL
      // If no URL yet, skip
      // @ts-ignore
      if (upload && typeof upload.terminate === "function") {
        // @ts-ignore
        upload.terminate();
      }
    } catch {}
  });
  state.setResume?.(id, async () => {
    const opts = {
      endpoint,
      metadata: {
        original_name: file.name,
        file_type: file.type || "application/octet-stream",
        is_image: String((file.type || "").startsWith("image/")),
        table_name: meta.tableName,
        foreign_key: meta.foreignKey,
        is_public: String(Boolean(meta.isPublic)),
        client_tag: meta.clientTag || "",
        schema: String(schema ?? ""),
      },
      headers: { Authorization: `Bearer ${meta.token}`, "X-Schema": schema! },
      chunkSize: 8 * 1024 * 1024,
      parallelUploads: parallel,
      retryDelays: [0, 3000, 5000, 10000],
      onBeforeRequest: () => state.setUploading(id),
      onProgress: (sent: number, total: number) =>
        state.updateProgress(id, sent, total),
      onSuccess: () => state.markSuccess(id, upload.url || null),
      onError: (error: Error) => state.markError(id, error.message),
    };
    upload = new Upload(file, opts);
    try {
      const previous = await upload.findPreviousUploads();
      if (previous && previous.length > 0) {
        upload.resumeFromPreviousUpload(previous[0]);
      }
    } catch {}
    upload.start();
  });
  upload.start();
  return upload;
}

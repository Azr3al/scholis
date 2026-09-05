import { axiosClient } from "@/lib/api";

export type IdPhotoAudience = "student" | "staff";
export type IdPhotoExportFormat = "zip" | "pdf";

export type DownloadIdPhotosParams = {
  audience: IdPhotoAudience;
  format: IdPhotoExportFormat;
  categoryId?: number | null;
};

function filenameFromDisposition(
  disposition: string | undefined,
  fallback: string,
): string {
  if (!disposition) return fallback;
  const match = disposition.match(/filename="?([^";\n]+)"?/i);
  return match?.[1]?.trim() || fallback;
}

export async function downloadIdPhotos(
  params: DownloadIdPhotosParams,
): Promise<void> {
  const { downloadFile } = await import("@/helpers/file");

  const query: Record<string, string> = {
    audience: params.audience,
    format: params.format,
  };
  if (params.categoryId != null) {
    query.category_id = String(params.categoryId);
  }

  const response = await axiosClient.get("reports/id-photos/export", {
    params: query,
    responseType: "blob",
  });

  const fallback = `${params.audience}-id-photos.${params.format}`;
  const disposition = response.headers["content-disposition"] as
    | string
    | undefined;
  const filename = filenameFromDisposition(disposition, fallback);
  const url = URL.createObjectURL(response.data as Blob);
  try {
    downloadFile(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

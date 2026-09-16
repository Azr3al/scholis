import type { JuiceBoxUploadResponse } from "@/lib/juicebox/types";
import { getJuiceBoxOrigin, juiceBoxAuthHeaders } from "@/lib/juicebox/auth";

const UPLOAD_PATH = "/attachments/upload";

type UploadToJuiceBoxParams = {
  files: File[];
  tableName: string;
  foreignKey: string;
  isPublic?: boolean;
  purge?: boolean;
};

export async function uploadToJuiceBoxMultipart({
  files,
  tableName,
  foreignKey,
  isPublic = false,
  purge = false,
}: UploadToJuiceBoxParams): Promise<JuiceBoxUploadResponse> {
  if (!files.length) {
    throw new Error("At least one file is required for upload.");
  }
  if (!foreignKey) {
    throw new Error("foreignKey is required for JuiceBox upload.");
  }

  const formData = new FormData();
  files.forEach((file) => {
    formData.append("attachments[]", file);
  });
  formData.append("table_name", tableName);
  formData.append("foreign_key", foreignKey);
  formData.append("is_public", String(isPublic));
  formData.append("purge", String(purge));

  const response = await fetch(`${getJuiceBoxOrigin()}${UPLOAD_PATH}`, {
    method: "POST",
    body: formData,
    headers: juiceBoxAuthHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "File upload failed");
    throw new Error(errorBody || "File upload failed");
  }

  return response.json();
}

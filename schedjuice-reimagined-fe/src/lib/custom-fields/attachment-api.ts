import { makeGetRequest, makePostRequest } from "@/app/client-api/utils";

export type CustomFieldAttachmentSnapshot = {
  id: number;
  filename: string;
  size?: number;
  mime?: string;
  file_type?: string;
  download_url?: string;
};

export async function uploadCustomFieldAttachments(params: {
  entityType: string;
  fieldKey: string;
  files: File[];
}): Promise<CustomFieldAttachmentSnapshot[]> {
  const formData = new FormData();
  formData.append("entity_type", params.entityType);
  formData.append("field_key", params.fieldKey);
  params.files.forEach((file) => formData.append("file", file));
  const res = await makePostRequest("custom-field-attachments", formData);
  const rows = res?.data?.data;
  return Array.isArray(rows) ? rows : [];
}

export async function fetchCustomFieldAttachmentDownloadUrl(
  attachmentId: number,
): Promise<string | null> {
  const res = await makeGetRequest(
    `custom-field-attachments/${attachmentId}/download-url`,
  );
  const url = res?.data?.data?.url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

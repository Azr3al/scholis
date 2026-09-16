import { axiosClient } from "@/lib/api";
import type {
  DocumentTemplate,
  DocumentTemplateScope,
} from "@/lib/document-template/types";

type Envelope<T> = { isError: boolean; message: string; data: T };

export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  const res = await axiosClient.get<Envelope<DocumentTemplate[]>>(
    "document-templates",
  );
  return res.data.data ?? [];
}

export async function getDocumentTemplate(
  id: number,
): Promise<DocumentTemplate> {
  const res = await axiosClient.get<Envelope<DocumentTemplate>>(
    `document-templates/${id}`,
  );
  return res.data.data;
}

export async function createDocumentTemplate(input: {
  scope: DocumentTemplateScope;
  name?: string;
}): Promise<DocumentTemplate> {
  const res = await axiosClient.post<Envelope<DocumentTemplate>>(
    "document-templates",
    input.name?.trim()
      ? { scope: input.scope, name: input.name.trim() }
      : { scope: input.scope },
  );
  return res.data.data;
}

export async function updateDocumentTemplate(
  id: number,
  input: { name?: string; document?: unknown },
): Promise<DocumentTemplate> {
  const res = await axiosClient.patch<Envelope<DocumentTemplate>>(
    `document-templates/${id}`,
    input,
  );
  return res.data.data;
}

export async function deleteDocumentTemplate(id: number): Promise<void> {
  await axiosClient.delete(`document-templates/${id}`);
}

export async function publishDocumentTemplate(
  id: number,
): Promise<DocumentTemplate> {
  const res = await axiosClient.post<Envelope<DocumentTemplate>>(
    `document-templates/${id}/publish`,
    {},
  );
  return res.data.data;
}

export async function duplicateDocumentTemplate(
  id: number,
): Promise<DocumentTemplate> {
  const res = await axiosClient.post<Envelope<DocumentTemplate>>(
    `document-templates/${id}/duplicate`,
    {},
  );
  return res.data.data;
}

export async function promoteDocumentTemplate(
  id: number,
): Promise<DocumentTemplate> {
  const res = await axiosClient.post<Envelope<DocumentTemplate>>(
    `document-templates/${id}/promote`,
    {},
  );
  return res.data.data;
}

export async function uploadDocumentTemplateAsset(
  id: number,
  file: File,
): Promise<{ url: string }> {
  const body = new FormData();
  body.append("file", file);
  const res = await axiosClient.post<Envelope<{ url: string }>>(
    `document-templates/${id}/assets`,
    body,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data.data;
}

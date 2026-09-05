import { axiosClient } from "@/lib/api";
import type {
  DocArticleAdmin,
  DocArticleSummary,
  DocArticleWriteBody,
  DocCategory,
  DocCategoryWriteBody,
  DocMediaUpload,
  PlatformContext,
} from "@/types/product-docs";

type Envelope<T> = { isError: boolean; message: string; data: T };

export async function fetchHelpCategories(): Promise<DocCategory[]> {
  const res = await axiosClient.get<Envelope<DocCategory[]>>("product-docs/categories");
  return res.data.data;
}

export async function fetchHelpArticles(params?: {
  q?: string;
  category?: string;
}): Promise<DocArticleSummary[]> {
  const res = await axiosClient.get<Envelope<DocArticleSummary[]>>("product-docs/articles", {
    params,
  });
  return res.data.data;
}

export async function fetchHelpArticle(slug: string): Promise<DocArticleSummary> {
  const res = await axiosClient.get<Envelope<DocArticleSummary>>(
    `product-docs/articles/${slug}`,
  );
  return res.data.data;
}

export async function fetchPlatformContext(): Promise<PlatformContext> {
  const res = await axiosClient.get<Envelope<PlatformContext>>("platform/context");
  return res.data.data;
}

export async function fetchAdminCategories(): Promise<DocCategory[]> {
  const res = await axiosClient.get<Envelope<DocCategory[]>>("platform/docs/categories");
  return res.data.data;
}

export async function createAdminCategory(body: DocCategoryWriteBody): Promise<DocCategory> {
  const res = await axiosClient.post<Envelope<DocCategory>>("platform/docs/categories", body);
  return res.data.data;
}

export async function fetchAdminArticles(): Promise<DocArticleAdmin[]> {
  const res = await axiosClient.get<Envelope<DocArticleAdmin[]>>("platform/docs/articles");
  return res.data.data;
}

export async function fetchAdminArticle(id: number): Promise<DocArticleAdmin> {
  const res = await axiosClient.get<Envelope<DocArticleAdmin>>(`platform/docs/articles/${id}`);
  return res.data.data;
}

export async function createAdminArticle(body: DocArticleWriteBody): Promise<DocArticleAdmin> {
  const res = await axiosClient.post<Envelope<DocArticleAdmin>>("platform/docs/articles", body);
  return res.data.data;
}

export async function updateAdminArticle(
  id: number,
  body: Partial<DocArticleWriteBody>,
): Promise<DocArticleAdmin> {
  const res = await axiosClient.patch<Envelope<DocArticleAdmin>>(
    `platform/docs/articles/${id}`,
    body,
  );
  return res.data.data;
}

export async function publishAdminArticle(id: number): Promise<DocArticleAdmin> {
  const res = await axiosClient.post<Envelope<DocArticleAdmin>>(
    `platform/docs/articles/${id}/publish`,
  );
  return res.data.data;
}

export async function unpublishAdminArticle(id: number): Promise<DocArticleAdmin> {
  const res = await axiosClient.post<Envelope<DocArticleAdmin>>(
    `platform/docs/articles/${id}/unpublish`,
  );
  return res.data.data;
}

export async function deleteAdminArticle(id: number): Promise<void> {
  await axiosClient.delete(`platform/docs/articles/${id}`);
}

export async function uploadDocMedia(
  file: File,
  articleId?: number,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<DocMediaUpload> {
  const form = new FormData();
  form.append("file", file);
  if (articleId) form.append("article_id", String(articleId));
  const res = await axiosClient.post<Envelope<DocMediaUpload>>("platform/docs/media", form, {
    headers: { "Content-Type": "multipart/form-data" },
    signal,
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return res.data.data;
}

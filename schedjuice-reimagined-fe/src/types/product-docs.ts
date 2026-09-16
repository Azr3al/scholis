export type DocAudience = "all" | "admin" | "teacher" | "student";

export type DocCategory = {
  id: number;
  slug: string;
  title: string;
  sort_order: number;
  default_audience: DocAudience;
  article_count?: number;
};

export type DocArticleSummary = {
  id: number;
  slug: string;
  title: string;
  markdown_body?: string;
  category_slug: string;
  category_title: string;
  audiences: DocAudience[];
  published_at: string | null;
  updated_at: string;
};

export type DocArticleAdmin = DocArticleSummary & {
  category: number;
  status: "draft" | "published";
};

export type DocVideo = {
  id: number;
  title: string;
  video_url: string;
  duration_sec: number | null;
  status: "uploading" | "ready" | "failed";
  error_message: string;
  article: number | null;
  markdown_snippet: string;
};

export type DocMediaUpload = {
  media_type: "video" | "image";
  url: string;
  markdown_snippet: string;
  id?: number;
  status?: "ready";
  video_url?: string;
};

export type DocArticleWriteBody = {
  slug: string;
  title: string;
  markdown_body: string;
  category: number;
  audiences: DocAudience[];
};

export type DocCategoryWriteBody = {
  slug: string;
  title: string;
  sort_order?: number;
  default_audience?: DocAudience;
};

export type PlatformContext = {
  admin_org: {
    id: number;
    name: string;
    domain_url: string;
  };
};

import { axiosClient } from "@/lib/api";
import type {
  AwardDisplayTemplate,
  AwardFamily,
  AwardTemplate,
  AwardTitle,
  AwardTitleSummary,
  CourseAwardsBoard,
} from "@/types/award";

type Envelope<T> = { isError: boolean; message: string; data: T };

export type AwardTitleWrite = {
  name: string;
  family?: AwardFamily | null;
  is_pinned?: boolean;
  sort_order?: number;
};

export async function listAwardTitles(): Promise<AwardTitle[]> {
  const res = await axiosClient.get<Envelope<AwardTitle[]>>(
    "award-titles?size=-1",
  );
  return res.data.data ?? [];
}

export async function getAwardTitle(id: number): Promise<AwardTitle> {
  const res = await axiosClient.get<Envelope<AwardTitle>>(`award-titles/${id}`);
  return res.data.data;
}

export async function createAwardTitle(
  input: AwardTitleWrite,
): Promise<AwardTitle> {
  const res = await axiosClient.post<Envelope<AwardTitle>>(
    "award-titles",
    input,
  );
  return res.data.data;
}

export async function updateAwardTitle(
  id: number,
  input: Partial<AwardTitleWrite>,
): Promise<AwardTitle> {
  const res = await axiosClient.patch<Envelope<AwardTitle>>(
    `award-titles/${id}`,
    input,
  );
  return res.data.data;
}

export async function retireAwardTitle(id: number): Promise<AwardTitle> {
  const res = await axiosClient.post<Envelope<AwardTitle>>(
    `award-titles/${id}/retire`,
    {},
  );
  return res.data.data;
}

export async function getCourseAwards(
  courseId: number | string,
  params: { period_kind: "month" | "overall"; year?: number; month?: number },
): Promise<CourseAwardsBoard> {
  const search = new URLSearchParams({ period_kind: params.period_kind });
  if (params.period_kind === "month" && params.year != null && params.month != null) {
    search.set("year", String(params.year));
    search.set("month", String(params.month));
  }
  const res = await axiosClient.get<Envelope<CourseAwardsBoard>>(
    `courses/${courseId}/awards?${search.toString()}`,
  );
  return res.data.data;
}

export async function createAwardGrant(
  courseId: number | string,
  input: {
    title_id?: number | null;
    name?: string | null;
    user: number;
    period_kind: "month" | "overall";
    year?: number;
    month?: number;
  },
): Promise<{ id: number; title: AwardTitleSummary }> {
  const res = await axiosClient.post<Envelope<{ id: number; title: AwardTitleSummary }>>(
    `courses/${courseId}/award-grants`,
    input,
  );
  return res.data.data;
}

export async function createAwardGrantBatch(
  courseId: number | string,
  input: {
    title_id?: number | null;
    name?: string | null;
    user_ids: number[];
    period_kind: "month" | "overall";
    year?: number;
    month?: number;
  },
): Promise<{
  title: AwardTitleSummary;
  granted: Array<{ id: number; user: number; title: AwardTitleSummary }>;
  errors: Array<{ user: number; message: string }>;
}> {
  const res = await axiosClient.post<
    Envelope<{
      title: AwardTitleSummary;
      granted: Array<{ id: number; user: number; title: AwardTitleSummary }>;
      errors: Array<{ user: number; message: string }>;
    }>
  >(`courses/${courseId}/award-grants/batch`, input);
  return res.data.data;
}

export async function getAwardDisplayTemplate(
  courseId: number | string,
  titleId: number,
): Promise<AwardDisplayTemplate | null> {
  const res = await axiosClient.get<Envelope<AwardDisplayTemplate | null>>(
    `courses/${courseId}/award-titles/${titleId}/display-template`,
  );
  return res.data.data ?? null;
}

export async function deleteAwardGrant(grantId: number): Promise<void> {
  await axiosClient.delete(`award-grants/${grantId}`);
}

export async function promoteAwardTitle(
  courseId: number | string,
  titleId: number,
): Promise<AwardTitle> {
  const res = await axiosClient.post<Envelope<AwardTitle>>(
    `courses/${courseId}/award-titles/${titleId}/promote`,
    {},
  );
  return res.data.data;
}

export async function listAwardTemplates(titleId: number): Promise<AwardTemplate[]> {
  const res = await axiosClient.get<Envelope<AwardTemplate[]>>(
    `award-titles/${titleId}/templates`,
  );
  return res.data.data ?? [];
}

export async function createAwardTemplate(
  titleId: number,
  name?: string,
): Promise<AwardTemplate> {
  const res = await axiosClient.post<Envelope<AwardTemplate>>(
    `award-titles/${titleId}/templates`,
    name ? { name } : {},
  );
  return res.data.data;
}

export async function getAwardTemplate(id: number): Promise<AwardTemplate> {
  const res = await axiosClient.get<Envelope<AwardTemplate>>(
    `award-templates/${id}`,
  );
  return res.data.data;
}

export async function updateAwardTemplate(
  id: number,
  input: { name?: string; document?: unknown; background?: File },
): Promise<AwardTemplate> {
  if (input.background) {
    const body = new FormData();
    if (input.name != null) body.append("name", input.name);
    if (input.document !== undefined) {
      body.append("document", JSON.stringify(input.document));
    }
    body.append("background", input.background);
    const res = await axiosClient.patch<Envelope<AwardTemplate>>(
      `award-templates/${id}`,
      body,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data.data;
  }
  const res = await axiosClient.patch<Envelope<AwardTemplate>>(
    `award-templates/${id}`,
    {
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.document !== undefined ? { document: input.document } : {}),
    },
  );
  return res.data.data;
}

export async function deleteAwardTemplate(id: number): Promise<void> {
  await axiosClient.delete(`award-templates/${id}`);
}

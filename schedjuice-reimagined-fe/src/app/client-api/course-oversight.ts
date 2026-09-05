import { axiosClient } from "@/lib/api";

export type CourseScopeReason = {
  type: "program" | "category";
  id: number;
  name: string;
};

export type CourseScopeOverseerRow = {
  user: { id: number; name: string; email: string };
  scope_reasons: CourseScopeReason[];
};

export async function getCourseScopeOverseers(courseId: string | number) {
  const res = await axiosClient.get<{ data: CourseScopeOverseerRow[] }>(
    `courses/${courseId}/scope-overseers`,
  );
  return res.data.data ?? [];
}

export function formatScopeReasons(reasons: CourseScopeReason[]): string {
  return reasons.map((r) => r.name).join(" · ");
}

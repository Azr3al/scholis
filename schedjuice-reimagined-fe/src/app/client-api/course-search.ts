import { searchEntities } from "@/app/client-api/utils";
import { courseType } from "@/types/course";
import {
  type CourseScope,
  EMPTY_COURSE_SCOPE,
  buildCourseScopeFilterParams,
} from "@/lib/imports/course-scope";
import { AxiosRequestConfig } from "axios";

export interface CourseSearchResponse {
  results: courseType[];
  total: number;
  page: number;
  used_fallback: boolean;
}

const SEARCH_FIELDS = ["id", "title", "code"];

export async function fetchCourseSearch(
  q: string,
  page: number,
  signal?: AbortSignal,
  scope: CourseScope = EMPTY_COURSE_SCOPE,
): Promise<CourseSearchResponse> {
  const res = await searchEntities(
    "courses",
    {
      page,
      size: 20,
      q,
      fields: SEARCH_FIELDS,
      sorts: ["-created_at"],
    },
    { filter_params: buildCourseScopeFilterParams(scope) },
    { signal } as AxiosRequestConfig,
  );
  const payload = res.data ?? {};
  const results = (payload.data ?? []) as courseType[];
  return {
    results,
    total: payload.count ?? results.length,
    page,
    used_fallback: Boolean(payload.used_fallback),
  };
}

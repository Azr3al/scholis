import type { Course } from "../_types/courses";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListCoursesArgs = SearchListArgs;

export const coursesSearch = defineSearchListResource<Course>({
  path: "courses",
  keyNamespace: "courses",
});

export const listCourses = coursesSearch.list;

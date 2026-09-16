import type { queryParamOptions } from "@/types/api";

/** Shared programs list params for the create-flow gate and courses list prefetch. */
export const CREATE_FLOW_PROGRAMS_QUERY_PARAMS: queryParamOptions = {
  fields: [
    "id",
    "name",
    "course_creation_method",
    "subject_strategy",
    "is_active",
  ],
  sorts: ["name"],
};

export const CREATE_FLOW_PROGRAMS_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000,
} as const;

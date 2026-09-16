import { useQuery } from "@tanstack/react-query";

import { makePostRequest } from "@/app/client-api/utils";
import type { TeacherCandidate } from "@/components/course/teacher-assignment/types";
import { listToApiArray } from "@/helpers/filter-params";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";

const TEACHER_CANDIDATE_FIELDS = [
  "id",
  "name",
  "email",
  "profile_image",
  "alternative_name",
];

export function useTeacherCandidates({
  courseId,
  search,
  excludeUserIds,
  assignedAsRoleId,
}: {
  courseId: string | number;
  search: string;
  excludeUserIds: number[];
  assignedAsRoleId?: number | null;
}) {
  const excludeKey = [...excludeUserIds].sort((a, b) => a - b).join(",");

  const query = useQuery({
    queryKey: [
      "teacher-candidates",
      String(courseId),
      search,
      excludeKey,
      assignedAsRoleId ?? "",
    ],
    keepPreviousData: true,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      makePostRequest(
        `courses/${courseId}/available-users`,
        {
          filter_params: [
            {
              field_name: "roles",
              operator: operatorEnum.contains,
              value: listToApiArray([role.teacher]),
            },
          ],
          exclude_params: excludeKey
            ? [
                {
                  field_name: "id",
                  operator: operatorEnum.in,
                  value: excludeKey,
                },
              ]
            : [],
        },
        {
          sorts: ["name"],
          size: 25,
          fields: TEACHER_CANDIDATE_FIELDS,
          ...(search ? { q: search } : {}),
          ...(assignedAsRoleId != null
            ? { assigned_as_role_id: assignedAsRoleId }
            : {}),
        },
        {},
        { signal },
      ),
  });

  return {
    candidates: (query.data?.data?.data ?? []) as TeacherCandidate[],
    isLoading: query.isLoading,
    isRefetching: query.isFetching && query.isPreviousData,
  };
}

"use client";

import { fetchUserImageUrls } from "@/app/client-api/user-images";
import { useQuery } from "@tanstack/react-query";
import type { StudentPhotoTypeFilter } from "@/hooks/course-student-info/use-course-student-photo-filters";

export function useCourseStudentPhotoUrls(
  studentIds: number[],
  typeFilter: StudentPhotoTypeFilter,
) {
  const needId = typeFilter === "all" || typeFilter === "id";
  const needAward = typeFilter === "all" || typeFilter === "award";
  const sortedKey = [...studentIds].sort((a, b) => a - b).join(",");

  const idQuery = useQuery({
    queryKey: ["course-student-photo-urls", "id_image", sortedKey],
    queryFn: () => fetchUserImageUrls(studentIds, "id_image"),
    enabled: needId && studentIds.length > 0,
  });

  const awardQuery = useQuery({
    queryKey: ["course-student-photo-urls", "award_image", sortedKey],
    queryFn: () => fetchUserImageUrls(studentIds, "award_image"),
    enabled: needAward && studentIds.length > 0,
  });

  return {
    idUrls: idQuery.data?.urls ?? {},
    idSources: idQuery.data?.sources ?? {},
    awardUrls: awardQuery.data?.urls ?? {},
    awardSources: awardQuery.data?.sources ?? {},
    isLoading:
      (needId && idQuery.isInitialLoading) ||
      (needAward && awardQuery.isInitialLoading),
  };
}

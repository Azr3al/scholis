import type { QueryClient } from "@tanstack/react-query";

const LIST_CACHE_PREFIXES = [
  ["academic-hub-list"],
  ["academic-hub-aggregate"],
  ["course-search"],
  ["chatCourses"],
] as const;

export async function invalidateCourseSummaryCaches(
  queryClient: QueryClient,
  courseId?: number | string,
): Promise<void> {
  const invalidations = LIST_CACHE_PREFIXES.map((queryKey) =>
    queryClient.invalidateQueries({ queryKey }),
  );

  if (courseId != null && courseId !== "") {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: ["getCourse", String(courseId)],
      }),
      queryClient.invalidateQueries({
        queryKey: ["getCourse", courseId],
      }),
    );
  }

  await Promise.all(invalidations);
}

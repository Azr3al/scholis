type NamedCourseRelation = number | { name?: string } | null | undefined;

export type CourseBreadcrumbLike = {
  program?: NamedCourseRelation;
  level?: NamedCourseRelation;
  section?: NamedCourseRelation;
};

function relationName(relation: NamedCourseRelation): string | undefined {
  return typeof relation === "object" && relation !== null
    ? relation.name
    : undefined;
}

export function buildCourseBreadcrumb(course: CourseBreadcrumbLike): string {
  const parts = [
    relationName(course.program),
    relationName(course.level),
    relationName(course.section),
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

"use client";

import CourseHistory from "@/components/users/course-history/course-history";
import type { accountType } from "@/types/user";

export function RecordAcademicHistory({ user }: { user: accountType }) {
  return <CourseHistory user={user} embedded />;
}

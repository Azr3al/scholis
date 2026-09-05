"use client";

import { UserProfileAssessments } from "@/components/users/profile/user-profile-assessments";

export function RecordAcademicAssessments({ userId }: { userId: string }) {
  return <UserProfileAssessments userId={userId} embedded />;
}

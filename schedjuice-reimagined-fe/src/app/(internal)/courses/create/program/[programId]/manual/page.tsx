"use client";

import { ManualCourseForm } from "@/components/scheduling/manual-course-form";
import { useParams } from "next/navigation";

export default function ManualCourseCreatePage() {
  const { programId } = useParams<{ programId: string }>();
  return <ManualCourseForm programId={programId} />;
}

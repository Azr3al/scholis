"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { CourseIdentityBlock } from "@/components/course-identity/course-identity-block";
import { staggerItem } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

export type RecordCourseRowData = {
  userCourseId: number;
  courseId: number;
  title: string;
  code?: string | null;
  status?: string | null;
  assignedRoleName?: string | null;
  roleSeniority?: string | null;
  program?: number | { name?: string; subject_strategy?: string } | null;
  level?: number | { name?: string } | null;
  section?: number | { name?: string } | null;
  subject?: number | { id: number; name: string } | null;
  course_subjects?: { subject: number | { id: number; name: string } | null }[];
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
  nextSessionLabel?: string | null;
  isShared?: boolean;
};

export function RecordCourseRow({ row }: { row: RecordCourseRowData }) {
  return (
    <motion.div variants={staggerItem}>
      <Link
        href={`/courses/${row.courseId}`}
        className={cn(
          "group block rounded-lg border border-border-strong bg-surface-elevated px-3 py-4 transition-colors hover:bg-surface-hover",
          row.isShared && "border-l-2 border-brand pl-4",
        )}
      >
        <CourseIdentityBlock
          variant="record"
          course={row}
          assignedRoleName={row.assignedRoleName}
          roleSeniority={row.roleSeniority}
          isShared={row.isShared}
          nextSessionLabel={row.nextSessionLabel}
        />
      </Link>
    </motion.div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CourseIdentityBlock } from "@/components/course-identity/course-identity-block";
import type { CourseIdentityCourse } from "@/components/course-identity/course-identity-types";
import {
  COURSE_CONTEXT_PARENT,
  courseRecordHref,
  courseRecordNavActive,
  visibleCourseRecordNavSections,
  type CourseRecordNavEntry,
} from "@/config/course-record-nav";
import { RecordRailHeader } from "@/components/shell/record-rail-header";
import { transition, staggerItem, staggerList } from "@/lib/sj/motion";
import { playClick } from "@/lib/sound/click-sound";
import {
  RecordRailGroupHeader,
  RecordRailGroupItems,
} from "@/components/shell/record-rail-nav-group";
import { cn } from "@/lib/utils";
import type { courseType } from "@/types/course";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

function CourseNavLink({
  courseId,
  entry,
  pathname,
  onNavigate,
}: {
  courseId: string;
  entry: CourseRecordNavEntry;
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  const href = courseRecordHref(courseId, entry);
  const active = courseRecordNavActive(entry.id, pathname, courseId);

  return (
    <motion.div variants={staggerItem}>
      <Link
        href={href}
        onClick={(e) => {
          if (!active) {
            playClick();
            if (!e.metaKey && !e.ctrlKey && e.button === 0) {
              onNavigate(href);
            }
          }
        }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "block rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
          active
            ? "bg-surface-active font-medium text-text-primary"
            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        {entry.label}
      </Link>
    </motion.div>
  );
}

export function CourseSectionRail({
  courseId,
  course,
  user,
  tenant,
  pathname,
  isLoading,
}: {
  courseId: string;
  course: courseType | null;
  user: accountType | undefined;
  tenant: organizationType | null;
  pathname: string;
  isLoading: boolean;
}) {
  const router = useRouter();
  const sections =
    course && !isLoading
      ? visibleCourseRecordNavSections(user, course, tenant)
      : null;

  return (
    <motion.aside
      initial={{ width: 0 }}
      animate={{ width: 208 }}
      exit={{ width: 0 }}
      transition={transition.panelWipe}
      className="sj-root relative h-full shrink-0 overflow-hidden bg-surface-sunken"
    >
      <motion.div
        variants={staggerList}
        initial="hidden"
        animate="show"
        className="flex h-full w-52 flex-col"
      >
        <motion.div variants={staggerItem}>
          <RecordRailHeader parent={COURSE_CONTEXT_PARENT}>
            {course && !isLoading ? (
              <CourseIdentityBlock
                variant="rail"
                course={course as unknown as CourseIdentityCourse}
              />
            ) : (
              <div className="space-y-2" aria-busy="true" aria-label="Loading course">
                <div className="h-3 w-24 animate-pulse rounded bg-surface-skeleton" />
                <div className="h-4 w-full animate-pulse rounded bg-surface-skeleton" />
                <div className="h-3 w-16 animate-pulse rounded bg-surface-skeleton" />
              </div>
            )}
          </RecordRailHeader>
        </motion.div>

        {sections ? (
          <motion.nav
            key="course-sections-ready"
            variants={staggerList}
            initial="hidden"
            animate="show"
            aria-label="Course sections"
            className="flex flex-col gap-4 px-2 py-2 pb-4"
          >
            {sections.overview ? (
              <CourseNavLink
                courseId={courseId}
                entry={sections.overview}
                pathname={pathname}
                onNavigate={router.push}
              />
            ) : null}

            {sections.groups.map((group) => (
              <div key={group.id}>
                <motion.div variants={staggerItem}>
                  <RecordRailGroupHeader>{group.label}</RecordRailGroupHeader>
                </motion.div>
                <RecordRailGroupItems>
                  {group.entries.map((entry) => (
                    <CourseNavLink
                      key={entry.id}
                      courseId={courseId}
                      entry={entry}
                      pathname={pathname}
                      onNavigate={router.push}
                    />
                  ))}
                </RecordRailGroupItems>
              </div>
            ))}
          </motion.nav>
        ) : null}
      </motion.div>
    </motion.aside>
  );
}

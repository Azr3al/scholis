"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { UserCheckinButton } from "@/components/course/user-checkin-button";
import { useHomeMotionVariants } from "@/components/home/home-motion";
import { ListRowsSkeleton } from "@/components/loading/structured-skeletons";
import {
  permissionsFor,
  canAccessStaffShortcuts,
  isStudentOnlyUser,
} from "@/helpers/authorization";
import { canShowSessionCheckin } from "@/hooks/useSessionCheckinEnabled";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { useHomeSchedule, type HomeScheduleEvent } from "@/lib/home/use-home-schedule";
import { cn } from "@/lib/utils";

function ScheduleRowAction({
  courseId,
  showCheckin,
  showMark,
}: {
  courseId: number;
  showCheckin: boolean;
  showMark: boolean;
}) {
  if (showCheckin) {
    return <UserCheckinButton courseId={String(courseId)} />;
  }
  if (showMark) {
    return (
      <Link
        href={`/courses/${courseId}/attendance/marking/today`}
        className={cn("sj-ink-act text-sm font-medium text-accent")}
      >
        Mark
      </Link>
    );
  }
  return null;
}

export function ScheduleSection({
  events,
  isLoading,
  formatClock,
}: {
  events: HomeScheduleEvent[];
  isLoading: boolean;
  formatClock: (timeFrom: string) => string;
}) {
  const { crossfade } = useHomeMotionVariants();
  const { user, isTeacher } = useUser();
  const { tenant } = useTenant();
  const isStudent = user ? isStudentOnlyUser(user) : false;

  const showCheckin =
    !!user &&
    canShowSessionCheckin({
      isTeacher: Boolean(isTeacher),
      isStudent: Boolean(isStudent),
      useTeacherSessionCheckin: tenant?.use_teacher_session_checkin !== false,
      useStudentCheckin: tenant?.use_student_checkin === true,
    });
  const canMark = user ? permissionsFor(user).can("attendance.mark") : false;

  if (!isLoading && events.length === 0) return null;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isLoading ? (
        <motion.section
          key="schedule-loading"
          className="mt-8"
          aria-busy="true"
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <ListRowsSkeleton rows={3} />
        </motion.section>
      ) : (
        <motion.section
          key="schedule-ready"
          className="mt-8 space-y-1"
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
            Today&apos;s schedule
          </h2>
          <div>
            {events.map((ev) => {
              const courseId = ev.courseId;
              const showRowCheckin = showCheckin && courseId != null;
              const showRowMark = !showRowCheckin && canMark && courseId != null;
              return (
                <div
                  key={ev.id}
                  className="flex items-baseline gap-4 border-b border-rule py-3 last:border-b-0"
                >
                  <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-text-muted">
                    {formatClock(ev.time_from)}
                  </span>
                  <div className="min-w-0 flex-1 text-sm text-text-primary">
                    {ev.courseTitle}
                  </div>
                  <div className="shrink-0">
                    {courseId != null ? (
                      <ScheduleRowAction
                        courseId={courseId}
                        showCheckin={showRowCheckin}
                        showMark={showRowMark}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <Link
            href={
              user && canAccessStaffShortcuts(user)
                ? "/shortcuts/todays-classes"
                : "/shortcuts/user-schedule"
            }
            className="inline-block pt-2 text-sm text-text-muted hover:text-text-primary"
          >
            Full schedule →
          </Link>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

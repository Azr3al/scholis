"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AcademicPaneSwitcher } from "@/components/record/academic/academic-pane-switcher";
import { RecordAcademicAssessments } from "@/components/record/academic/record-academic-assessments";
import { RecordAcademicHistory } from "@/components/record/academic/record-academic-history";
import { RecordAcademicSchedule } from "@/components/record/academic/record-academic-schedule";
import { RecordCourseList } from "@/components/record/academic/record-course-list";
import { RecordThisWeekAgenda } from "@/components/record/academic/record-this-week-agenda";
import { useAcademicPane } from "@/components/record/academic/use-academic-pane";
import { buildNextSessionByCourseId } from "@/helpers/profile-courses/build-next-session-by-course-id";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";
import { crossfade } from "@/lib/sj/motion";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";
import { eventType } from "@/types/course";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";

type RecordAcademicProps = {
  userId: string;
  user: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  calendarEvents: ProfileCalendarEventLike[];
  calendarLoading: boolean;
  calendarLoadError: boolean;
  onCalendarRetry: () => void;
  renderCalendarEvent: (event: eventType) => React.ReactNode;
  viewerTeachingCourseIds: number[];
  hasSharedCourses: boolean;
  enrollmentCounts?: { activeCount: number; totalCount: number };
  countsLoading?: boolean;
};

export function RecordAcademic({
  userId,
  user,
  viewer,
  tenant,
  calendarEvents,
  calendarLoading,
  calendarLoadError,
  onCalendarRetry,
  renderCalendarEvent,
  viewerTeachingCourseIds,
  hasSharedCourses,
  enrollmentCounts,
  countsLoading,
}: RecordAcademicProps) {
  const { pane, setPane } = useAcademicPane();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  const sessionByCourseId = useMemo(
    () => buildNextSessionByCourseId(calendarEvents, tenant?.timezone, timeFormat),
    [calendarEvents, tenant?.timezone, timeFormat],
  );

  return (
    <div className="sj-root flex flex-col gap-6">
      <AcademicPaneSwitcher pane={pane} onPaneChange={setPane} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pane}
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {pane === "courses" && (
            <>
              <RecordCourseList
                subjectId={userId}
                viewer={viewer}
                subject={user}
                calendarEvents={calendarEvents}
                sessionByCourseId={sessionByCourseId}
                tenantTimezone={tenant?.timezone}
                timeDisplayFormat={timeFormat}
                viewerTeachingCourseIds={viewerTeachingCourseIds}
                hasSharedCourses={hasSharedCourses}
                enrollmentCounts={enrollmentCounts}
                countsLoading={countsLoading}
              />
              <RecordThisWeekAgenda
                events={calendarEvents}
                courseIds={[]}
                sharedIds={viewerTeachingCourseIds}
                tenantTimezone={tenant?.timezone}
                timeDisplayFormat={timeFormat}
                onViewSchedule={() => setPane("schedule")}
              />
            </>
          )}

          {pane === "schedule" && (
            <RecordAcademicSchedule
              events={calendarEvents}
              isLoading={calendarLoading}
              loadError={calendarLoadError}
              onRetry={onCalendarRetry}
              renderCalendarEvent={renderCalendarEvent}
              sharedIds={viewerTeachingCourseIds}
              hasSharedCourses={hasSharedCourses}
            />
          )}

          {pane === "assessments" && <RecordAcademicAssessments userId={userId} />}

          {pane === "history" && <RecordAcademicHistory user={user} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

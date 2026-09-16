"use client";
import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import { Button, buttonVariants } from "@/components/primitives";
import { RecordPageSkeleton } from "@/components/record/record-page-skeleton";
import { RecordOverview } from "@/components/record/sections/record-overview";
import { RecordAccess } from "@/components/record/sections/record-access";
import { RecordRecords } from "@/components/record/sections/record-records";
import { RecordFinance } from "@/components/record/sections/record-finance";
import { RecordAcademic } from "@/components/record/sections/record-academic";
import { RecordCertifications } from "@/components/record/sections/record-certifications";
import { RecordPoints } from "@/components/record/sections/record-points";
import { RecordAi } from "@/components/record/sections/record-ai";
import { RecordConsultation } from "@/components/record/sections/record-consultation";
import { RecordSettings } from "@/components/record/sections/record-settings";
import { mergeAccountPreservingProfileImage } from "@/lib/user/profile-image-url";
import { CompletionBanner } from "@/components/custom-fields/completion/completion-banner";
import { useFormConfig } from "@/hooks/use-form-config";
import { UserProfileStats } from "@/components/users/profile/user-profile-stats";
import {
  isStudent,
  isStudentOnlyUser,
  canManagePaymentInfoForUser,
} from "@/helpers/authorization";
import {
  courseIdFromProfileEvent,
  getOngoingProfileSessionsWithCourse,
  profileEventDisplayTitle,
  type ProfileCalendarEventLike,
} from "@/helpers/user-profile";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { accountType } from "@/types/user";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatTimeslotRangeForDisplay } from "@/helpers/timeslot";
import { useParams, useRouter } from "next/navigation";

import { useEffect, useMemo, useState } from "react";
import { searchEntities } from "@/app/client-api/utils";
import { assignmentType } from "@/types/assignment";
import { format } from "date-fns";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { crossfade } from "@/lib/sj/motion";
import { RecordProfileHeader } from "@/components/record/record-profile-header";
import { RecordProfileHeaderActions } from "@/components/record/record-profile-header-actions";
import { RecordMobileSections } from "@/components/record/record-mobile-sections";
import { RecordSectionRail } from "@/components/record/record-section-rail";
import { useRecordSection } from "@/components/record/use-record-section";
import { useAcademicPane } from "@/components/record/academic/use-academic-pane";
import { useContextRail } from "@/components/shell/use-context-rail";
import { UserRecordPageHeader } from "@/components/record/user-record-page-header";
import { useProfileEnrollmentCounts } from "@/hooks/profile-courses/use-profile-enrollment-counts";
import { useProfileHasSharedCourses } from "@/hooks/profile-courses/use-profile-has-shared-courses";
import { useProfileTeachingCount } from "@/hooks/profile-courses/use-profile-teaching-count";
import { useProfileUpcomingEvents } from "@/hooks/profile-courses/use-profile-upcoming-events";
import { useProfileScheduleEvents } from "@/hooks/profile-courses/use-profile-schedule-events";
import { useViewerTeachingCourseIds } from "@/hooks/profile-courses/use-viewer-teaching-course-ids";
import { resetMainContentScroll } from "@/lib/main-content-scroll";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";

const USER_RECORD_CONTEXT_PARENT = { label: "Users", href: "/users" } as const;

const USER_PROFILE_EXPAND = ["visibility", "user_events"] as const;

function dedupeCalendarEvents(events: ProfileCalendarEventLike[]) {
  const seen = new Set<string>();
  const deduped: ProfileCalendarEventLike[] = [];
  for (const e of events) {
    const key =
      e.id != null
        ? `id:${e.id}`
        : `${String(e.date)}|${String(e.time_from)}|${String(e.time_to)}|${String(e.title ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  return deduped;
}

function courseTitleFromEvent(event: ProfileCalendarEventLike): string {
  return profileEventDisplayTitle(event, "Course");
}

const UserDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const { user: account, isLoading: isAccountLoading } = useUser();
  const [isAuthCheckFinished, setIsAuthCheckFinished] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<ProfileCalendarEventLike[]>([]);
  const [user, setUser] = useState<accountType | null>(null);
  const { data: editConfig } = useFormConfig(
    "edit",
    (user?.roles as string[] | undefined) ?? [],
    undefined,
    { enabled: Boolean(tenant && user) },
  );
  const editConfigFields = useMemo(
    () => editConfig?.groups.flatMap((g) => g.fields) ?? [],
    [editConfig],
  );

  const { section, setSection } = useRecordSection();
  const { pane: academicPane } = useAcademicPane();
  const recordQueryKey = useMemo(
    () => [`getUser${id}`, ...USER_PROFILE_EXPAND],
    [id],
  );

  const academicSectionActive = section === "academic";

  const {
    data,
    isSuccess,
    isLoading,
    isError: userQueryIsError,
    refetch: refetchUser,
  } = useQuery({
    queryKey: [`getUser${id}`, ...USER_PROFILE_EXPAND],
    queryFn: () => fetchEntity("users", id, [...USER_PROFILE_EXPAND]),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const viewerTeachingQuery = useViewerTeachingCourseIds(account?.id);
  const viewerTeachingCourseIds = viewerTeachingQuery.data ?? [];

  const enrollmentCountsQuery = useProfileEnrollmentCounts(id, academicSectionActive);
  const teachingCountQuery = useProfileTeachingCount(id, Boolean(user));
  const hasSharedQuery = useProfileHasSharedCourses(
    id,
    viewerTeachingCourseIds,
    academicSectionActive,
  );

  const upcomingEventsQuery = useProfileUpcomingEvents(
    id,
    tenant?.timezone,
    Boolean(user),
  );
  const scheduleEventsQuery = useProfileScheduleEvents(
    id,
    tenant?.timezone,
    academicSectionActive && academicPane === "schedule",
  );

  const { data: staffEventsData, isLoading: staffEventsLoading } = useQuery({
    queryKey: [`userEvents${id}`],
    queryFn: async () => {
      if (!user || !(user as { user_events?: { event?: number }[] }).user_events) return [];

      const eventIds = (
        user as unknown as { user_events: { event?: number }[] }
      ).user_events
        .map((ue) => ue.event)
        .filter(Boolean);

      if (eventIds.length === 0) return [];

      const res = await searchEntities(
        "events",
        {
          size: -1,
          fields: ["id", "title", "date", "time_from", "time_to", "course"],
        },
        {
          filter_params: [
            {
              field_name: "id",
              operator: operatorEnum.in,
              value: eventIds.join(","),
            },
          ],
        },
      );

      return res.data.data as ProfileCalendarEventLike[];
    },
    enabled: !!user && !!(user as { user_events?: unknown[] }).user_events,
  });

  const {
    data: assignmentsData,
    isLoading: isAssignmentsLoading,
    isError: assignmentsIsError,
  } = useQuery({
    queryKey: ["userAssignments", id],
    queryFn: async () => {
      const res = await searchEntities(
        "assignments",
        { size: -1, expand: ["submissions", "course"] },
        {
          filter_params: [
            {
              field_name: "course__user_courses__user_id",
              operator: operatorEnum.exact,
              value: id,
            },
          ],
        },
      );
      return res.data.data as assignmentType[];
    },
    enabled: !!user && isStudent(user) && academicSectionActive,
  });

  useEffect(() => {
    setUser(null);
  }, [id]);

  useEffect(() => {
    if (isSuccess && data?.data?.data) {
      setUser((prev) =>
        mergeAccountPreservingProfileImage(prev ?? undefined, data.data.data),
      );
    } else if (userQueryIsError) {
      setUser(null);
    }
  }, [isSuccess, data, userQueryIsError]);

  useEffect(() => {
    if (section !== "settings" || !account) return;
    if (account.id !== Number(id)) {
      void setSection("overview");
    }
  }, [section, account, id, setSection]);

  useContextRail(
    RecordSectionRail,
    () =>
      isAuthCheckFinished && !userQueryIsError
        ? { subject: user, viewer: account, tenant, section, onSelect: setSection }
        : null,
    USER_RECORD_CONTEXT_PARENT,
  );

  useEffect(() => {
    if (isAccountLoading || !account) return;
    if (isStudent(account) && account.id !== Number(id)) {
      router.push("/");
      return;
    }
    setIsAuthCheckFinished(true);
  }, [account, id, router, isAccountLoading]);

  const assignmentEvents = useMemo(() => {
    if (!assignmentsData?.length) return [];
    return assignmentsData.flatMap((assignment) => {
      const courseObj = assignment.course;
      const courseTitle =
        typeof courseObj === "object" && courseObj != null && "title" in courseObj
          ? String((courseObj as { title?: string }).title ?? "Course")
          : "Course";
      return [
        {
          id: `assignment-available-${assignment.id}`,
          title: `Assignment available: ${assignment.title}`,
          date: format(new Date(assignment.available_datetime), "yyyy-MM-dd"),
          assignment,
          course: { title: courseTitle },
          type: "assignment_available",
          statusLabel: "Available",
        },
        {
          id: `assignment-due-${assignment.id}`,
          title: `Assignment due: ${assignment.title}`,
          date: format(new Date(assignment.due_datetime), "yyyy-MM-dd"),
          assignment,
          course: { title: courseTitle },
          type: "assignment_due",
          statusLabel: "Due",
        },
      ] as unknown as ProfileCalendarEventLike[];
    });
  }, [assignmentsData]);

  useEffect(() => {
    if (!academicSectionActive) {
      setCalendarEvents([]);
      return;
    }

    const staffTagged = (staffEventsData ?? []).map((event) => {
      const staffCourseId = courseIdFromProfileEvent(event);
      return {
        ...event,
        ...(staffCourseId != null ? { course: staffCourseId } : {}),
        courseTitle: courseTitleFromEvent(event),
      };
    });

    const courseEventsRaw =
      academicPane === "schedule"
        ? (scheduleEventsQuery.data ?? [])
        : (upcomingEventsQuery.data ?? []);

    const courseEvents = courseEventsRaw.map((event) => ({
      ...event,
      courseTitle: courseTitleFromEvent(event),
    }));

    let next: ProfileCalendarEventLike[] = [...staffTagged];

    if (user && isStudent(user)) {
      next = [...next, ...assignmentEvents, ...courseEvents];
    } else {
      next = [...next, ...courseEvents];
    }

    setCalendarEvents(dedupeCalendarEvents(next));
  }, [
    academicSectionActive,
    academicPane,
    user,
    staffEventsData,
    assignmentEvents,
    upcomingEventsQuery.data,
    scheduleEventsQuery.data,
  ]);

  const statsCalendarEvents = useMemo(() => {
    const staffTagged = (staffEventsData ?? []).map((event) => ({
      ...event,
      courseTitle: courseTitleFromEvent(event),
    }));
    const upcoming = (upcomingEventsQuery.data ?? []).map((event) => ({
      ...event,
      courseTitle: courseTitleFromEvent(event),
    }));
    return dedupeCalendarEvents([...staffTagged, ...upcoming]);
  }, [staffEventsData, upcomingEventsQuery.data]);

  const [ongoingRefreshToken, setOngoingRefreshToken] = useState(0);
  useEffect(() => {
    const t = window.setInterval(
      () => setOngoingRefreshToken((n) => n + 1),
      30000,
    );
    return () => window.clearInterval(t);
  }, []);

  const teachingCoursesCount = teachingCountQuery.data ?? null;

  const profileStatsLoading =
    upcomingEventsQuery.isLoading ||
    teachingCountQuery.isLoading ||
    staffEventsLoading;

  const ongoingSessions = useMemo(
    () =>
      getOngoingProfileSessionsWithCourse(
        statsCalendarEvents,
        tenant?.timezone,
        new Date(),
      ),
    [statsCalendarEvents, tenant?.timezone, ongoingRefreshToken],
  );

  const showPaymentInfoTab = !!user && !isStudentOnlyUser(user);
  const canManagePaymentInfo =
    !!account && !!user && canManagePaymentInfoForUser(account, user.id);

  const calendarLoading =
    academicSectionActive &&
    (upcomingEventsQuery.isLoading ||
      (academicPane === "schedule" && scheduleEventsQuery.isLoading) ||
      (user != null && isStudent(user) && isAssignmentsLoading));

  const calendarLoadError =
    academicSectionActive &&
    (upcomingEventsQuery.isError ||
      scheduleEventsQuery.isError ||
      assignmentsIsError);

  function renderCalendarEvent(event: ProfileCalendarEventLike & { type?: string; statusLabel?: string }) {
    if (
      event.type === "assignment_available" ||
      event.type === "assignment_due"
    ) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{event.title}</span>
          <span className="text-xs font-normal text-text-muted">
            {event.statusLabel ?? "Assignment"}
          </span>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">
          {profileEventDisplayTitle(event, "—")}
        </span>
        {event.time_from && event.time_to && event.date ? (
          <span className="text-xs font-normal text-text-muted">
            {formatTimeslotRangeForDisplay(
              {
                date: event.date,
                time_from: event.time_from,
                time_to: event.time_to,
              },
              tenant?.timezone,
              orgTimeDateFnsPattern(timeFormat),
            )}
          </span>
        ) : null}
      </div>
    );
  }

  useEffect(() => {
    resetMainContentScroll();
  }, [section, id]);

  const headerActions = useMemo(
    () =>
      user && account && isAuthCheckFinished && !userQueryIsError ? (
        <RecordProfileHeaderActions
          subject={user}
          viewer={account}
          recordQueryKey={recordQueryKey}
        />
      ) : null,
    [user, account, isAuthCheckFinished, userQueryIsError, recordQueryKey],
  );

  const isProfilePending =
    !isAuthCheckFinished ||
    isLoading ||
    (!user && !userQueryIsError);

  return (
    <>
      <UserRecordPageHeader section={section} actions={headerActions} />
      {isProfilePending ? (
        <RecordPageSkeleton />
      ) : (
    <PageContainer width="default" className="flex w-full flex-col items-stretch gap-8">
      {userQueryIsError ? (
        <div
          className="rounded-md border border-border bg-surface p-4 text-sm shadow-sm"
          role="alert"
        >
          <p className="text-destructive font-medium">
            Failed to load this profile. Please try again.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              void refetchUser();
            }}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          {user && account && (
            <>
              <div className="sj-root">
                <RecordProfileHeader subject={user} viewer={account} tenant={tenant} />
                <RecordMobileSections
                  subject={user}
                  viewer={account}
                  tenant={tenant}
                  section={section}
                  onSelect={setSection}
                />
              </div>
              {account?.id === Number(id) && section !== "settings" && (
                <CompletionBanner
                  userId={Number(id)}
                  roles={(user.roles as string[]) ?? []}
                />
              )}
              {account?.id === Number(id) &&
                (user as accountType & { show_welcome_nav_hint?: boolean })
                  .show_welcome_nav_hint && (
                  <div>
                    <Link
                      href="/shortcuts/school-welcome"
                      className={buttonVariants({ variant: "secondary",
                        size: "sm",
                        className: "gap-2",
                       })}
                    >
                      School welcome
                    </Link>
                  </div>
                )}
              {section !== "settings" ? (
              <UserProfileStats
                userId={id}
                teachingCoursesCount={teachingCoursesCount}
                ongoingSessions={ongoingSessions}
                tenantTimezone={tenant?.timezone}
                isViewingOwnProfile={account?.id === Number(id)}
                profileDisplayName={user.name ?? ""}
                isLoading={profileStatsLoading}
              />
              ) : null}
            </>
          )}

          {section !== "settings" ? null : (
            <>
              {user && account && account.id === Number(id) ? (
                <RecordSettings userId={id} />
              ) : null}
            </>
          )}

          {section !== "settings" && (
            <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              variants={crossfade}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col gap-8"
            >
              {section === "overview" && user && account && (
                <RecordOverview
                  subject={user}
                  viewer={account}
                  tenant={tenant}
                  recordQueryKey={recordQueryKey}
                />
              )}

              {section === "academic" && user && account && (
                <RecordAcademic
                  userId={id}
                  user={user}
                  viewer={account}
                  tenant={tenant}
                  calendarEvents={calendarEvents}
                  calendarLoading={calendarLoading}
                  calendarLoadError={calendarLoadError}
                  onCalendarRetry={() => {
                    void upcomingEventsQuery.refetch();
                    void scheduleEventsQuery.refetch();
                    void queryClient.invalidateQueries({
                      queryKey: ["userAssignments", id],
                    });
                  }}
                  renderCalendarEvent={renderCalendarEvent}
                  viewerTeachingCourseIds={viewerTeachingCourseIds}
                  hasSharedCourses={hasSharedQuery.data ?? false}
                  enrollmentCounts={enrollmentCountsQuery.data}
                  countsLoading={enrollmentCountsQuery.isLoading}
                />
              )}

              {section === "certifications" && user && account && (
                <RecordCertifications
                  subject={user}
                  viewer={account}
                  tenant={tenant}
                  recordQueryKey={recordQueryKey}
                  editConfigFields={editConfigFields}
                />
              )}

              {section === "finance" && user && account && (
                <RecordFinance
                  subject={user}
                  viewer={account}
                  tenant={tenant}
                  userId={id}
                  recordQueryKey={recordQueryKey}
                  showPaymentInfoTab={showPaymentInfoTab}
                  canManagePaymentInfo={canManagePaymentInfo}
                />
              )}

              {section === "records" && user && account && (
                <RecordRecords
                  subject={user}
                  viewer={account}
                  tenant={tenant}
                  recordQueryKey={recordQueryKey}
                  editConfig={editConfig}
                />
              )}

              {section === "points" && user && account && (
                <RecordPoints userId={Number(id)} userName={user.name} />
              )}

              {section === "ai" && user && account && (
                <RecordAi subject={user} viewer={account} userId={Number(id)} />
              )}

              {section === "consultation" && user && account && (
                <RecordConsultation
                  subject={user}
                  viewer={account}
                  tenant={tenant}
                />
              )}

              {section === "access" && user && account && (
                <RecordAccess
                  subject={user}
                  viewer={account}
                  recordQueryKey={recordQueryKey}
                />
              )}
            </motion.div>
            </AnimatePresence>
          )}
        </>
      )}
    </PageContainer>
      )}
    </>
  );
};

export default UserDetailsPage;

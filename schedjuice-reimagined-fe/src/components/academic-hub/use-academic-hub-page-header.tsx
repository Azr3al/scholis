"use client";

import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { canShowAcademicHubCreate } from "@/helpers/academic-hub/can-show-create";
import { shouldShowSecondaryToolbar } from "@/helpers/academic-hub/secondary-toolbar-visible";
import { isStudent } from "@/helpers/authorization";
import { setAcademicHubMyClassesOnly } from "@/lib/academic-hub-my-preference";
import { useHubCourses } from "@/hooks/academic-hub/use-hub-courses";
import { useAcademicHubContext } from "./academic-hub-context";
import { useHubPrograms } from "@/hooks/academic-hub/use-programs";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { UserPlus } from "iconoir-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { AcademicHubSecondaryToolbar } from "./academic-hub-secondary-toolbar";
import { AcademicHubToolbar } from "./academic-hub-toolbar";

export function useAcademicHubPageHeader() {
  const {
    filters,
    queryState,
    queryReady,
    userId,
    selectedProgram,
    setJoinCodeDialogOpen,
  } = useAcademicHubContext();
  const { state, setMy } = filters;
  const { data: programs = [] } = useHubPrograms();
  const { user, isOnlyTeacher } = useUser();
  const { can } = usePermissions();
  const { tenant } = useTenant();

  const handleSetMy = useCallback(
    (value: boolean) => {
      setMy(value);
      if (user?.id) {
        setAcademicHubMyClassesOnly(user.id, value);
      }
    },
    [setMy, user?.id],
  );

  const list = useHubCourses({
    state: queryState ?? state,
    userId,
    program: selectedProgram,
    enabled: queryReady && Boolean(userId),
  });

  const statusCounts = list.data?.statusCounts;
  const canCreate = canShowAcademicHubCreate({
    hasCourseCreatePermission: can("course.create"),
    isOnlyTeacher,
    canTeacherCreateCourse: Boolean(tenant?.can_teacher_create_course),
  });
  const showSingleProgramName =
    (tenant?.program_count ?? programs.length) === 1 && programs[0]?.name;

  const showSecondary = shouldShowSecondaryToolbar({
    program: state.program,
    isOnlyTeacher,
    isStudent: isStudent(user),
  });
  const showJoinClass = isStudent(user);

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <div className="min-w-0">
          <h1 className="truncate font-serif text-lg text-text-primary">
            Academic Hub
          </h1>
          {showSingleProgramName ? (
            <p className="truncate text-xs text-text-muted">
              {programs[0].name}
            </p>
          ) : null}
        </div>
      ),
      actions:
        canCreate || showJoinClass ? (
          <div className="flex items-center gap-2">
            {showJoinClass ? (
              <Button
                size="sm"
                variant={canCreate ? "secondary" : "primary"}
                className="gap-2"
                onClick={() => setJoinCodeDialogOpen(true)}
              >
                <UserPlus width={16} height={16} aria-hidden />
                Join a class
              </Button>
            ) : null}
            {canCreate ? (
              <Link href="/courses/create">
                <Button size="sm">Add classes</Button>
              </Link>
            ) : null}
          </div>
        ) : undefined,
      toolbar: (
        <AcademicHubToolbar
          programs={programs}
          statusCounts={statusCounts}
          isStatusCountsLoading={list.isLoading && !statusCounts}
          onSetMy={handleSetMy}
        />
      ),
      toolbarSecondary: showSecondary ? (
        <AcademicHubSecondaryToolbar programs={programs} />
      ) : undefined,
    }),
    [
      canCreate,
      showJoinClass,
      setJoinCodeDialogOpen,
      showSingleProgramName,
      programs,
      statusCounts,
      list.isLoading,
      handleSetMy,
      showSecondary,
    ],
  );

  usePageHeader(headerConfig);
}

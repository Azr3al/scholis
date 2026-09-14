"use client";

import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { deleteEntity, makePostRequest } from "@/app/client-api/utils";
import { AlertDialog, Button, useToast } from "@/components/primitives";
import {
  lastSelectedIsoDate,
  sessionIdsForWeekdays,
} from "@/helpers/course/session-grouping";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import {
  useCourseAssignmentData,
  type AssignedTeacher,
} from "@/hooks/course/use-course-assignment-data";
import { useTenant } from "@/hooks/useTenant";
import { crossfade, crossfadeInstant } from "@/lib/sj/motion";
import type { courseType } from "@/types/course";

import { AssignedTeacherList } from "./assigned-teacher-list";
import { AssignmentTeacherContext } from "./assignment-teacher-context";
import { CourseRoleStep } from "./course-role-step";
import { SessionSelectionStep } from "./session-selection-step";
import {
  TeacherAssignStepBlock,
  TeacherAssignStepContent,
} from "./teacher-assign-step-motion";
import { TeacherSearchList } from "./teacher-search-list";
import type {
  AssignStep,
  CourseRoleOption,
  SessionMode,
  TeacherCandidate,
} from "./types";
import { roleNeedsSessionSelection } from "./types";

export function TeacherAssignmentPanel({ course }: { course: courseType }) {
  const toast = useToast();
  const { tenant } = useTenant();
  const reducedMotion = useReducedMotion();
  const stepVariants = reducedMotion ? crossfadeInstant : crossfade;
  const courseRolesEnabled = tenant?.is_course_role_enabled !== false;
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  const {
    sessions,
    courseWeekdays,
    roles,
    assignedTeachers,
    assignedUserIds,
    isLoading,
    refetchAll,
  } = useCourseAssignmentData(course.id);

  const [step, setStep] = useState<AssignStep>("pick-teacher");
  const [teacher, setTeacher] = useState<TeacherCandidate | null>(null);
  const [roleOption, setRoleOption] = useState<CourseRoleOption | null>(null);
  const [mode, setMode] = useState<SessionMode>("weekdays");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [autoRemoveEnabled, setAutoRemoveEnabled] = useState(true);
  const [removingUserCourseId, setRemovingUserCourseId] = useState<number | null>(
    null,
  );
  const [confirmEmptySessions, setConfirmEmptySessions] = useState(false);

  useEffect(() => {
    if (step !== "pick-sessions" || roleOption === null) return;
    if (roleOption.isSubstitute) {
      setMode("custom");
      setSelectedIds(new Set());
      setAutoRemoveEnabled(true);
      return;
    }
    setMode("weekdays");
    setWeekdays(courseWeekdays);
    setSelectedIds(new Set(sessionIdsForWeekdays(sessions, courseWeekdays)));
  }, [step, roleOption, courseWeekdays, sessions]);

  const autoRemoveOn = useMemo(() => {
    if (!roleOption?.isSubstitute || !autoRemoveEnabled) return null;
    return lastSelectedIsoDate(sessions, selectedIds);
  }, [roleOption, autoRemoveEnabled, sessions, selectedIds]);

  function resetDraft() {
    setStep("pick-teacher");
    setTeacher(null);
    setRoleOption(null);
    setMode("weekdays");
    setWeekdays([]);
    setSelectedIds(new Set());
    setAutoRemoveEnabled(true);
    setConfirmEmptySessions(false);
  }

  const assign = useMutation({
    mutationFn: () =>
      makePostRequest(`courses/${course.id}/assign-events`, {
        user_id: Number(teacher?.id),
        ...(courseRolesEnabled && roleOption
          ? { assigned_as_role_id: roleOption.id }
          : {}),
        new_events: Array.from(selectedIds).map((id) => ({ id })),
        removed_events: [],
        substitute_auto_remove_on: autoRemoveOn,
      }),
    onSuccess: () => {
      toast.add({ description: `${teacher?.name} was assigned to this course.` });
      resetDraft();
      refetchAll();
    },
    onError: (error) => {
      toast.add({ description: parseSchedjuiceApiError(error) });
    },
  });

  const remove = useMutation({
    mutationFn: (target: AssignedTeacher) =>
      deleteEntity("user-courses", String(target.userCourseId)),
    onSuccess: () => {
      toast.add({ description: "Teacher removed from this course." });
      setRemovingUserCourseId(null);
      refetchAll();
    },
    onError: (error) => {
      setRemovingUserCourseId(null);
      toast.add({ description: parseSchedjuiceApiError(error) });
    },
  });

  const canContinueFromTeacher = teacher !== null;
  const canContinueFromRole = !courseRolesEnabled || roleOption !== null;
  const canAssignFromRole =
    canContinueFromRole &&
    roleOption !== null &&
    !roleNeedsSessionSelection(roleOption) &&
    !assign.isPending;
  const canAssignFromSessions = !assign.isPending;
  const isCustomSessionMode = roleOption?.isSubstitute === true || mode === "custom";

  function goBackFromSessions() {
    setStep(courseRolesEnabled ? "pick-role" : "pick-teacher");
  }

  function requestAssignFromSessions() {
    if (selectedIds.size === 0) {
      setConfirmEmptySessions(true);
      return;
    }
    assign.mutate();
  }

  function handleRoleStepPrimaryAction() {
    if (roleOption !== null && !roleNeedsSessionSelection(roleOption)) {
      assign.mutate();
      return;
    }
    setStep("pick-sessions");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="font-serif text-xl text-text-primary">Assigned teachers</h2>
        <p className="mb-4 mt-1 text-sm text-text-secondary">
          To change a role or sessions, remove the teacher and assign them again.
        </p>
        <AssignedTeacherList
          teachers={assignedTeachers}
          removingUserCourseId={removingUserCourseId}
          onRemove={(target) => {
            setRemovingUserCourseId(target.userCourseId);
            remove.mutate(target);
          }}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-6">
        {step === "pick-teacher" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-xl text-text-primary">Assign a teacher</h2>
            <Button
              type="button"
              disabled={!canContinueFromTeacher}
              onClick={() =>
                setStep(courseRolesEnabled ? "pick-role" : "pick-sessions")
              }
            >
              Continue
            </Button>
          </div>
        ) : (
          <h2 className="font-serif text-xl text-text-primary">Assign a teacher</h2>
        )}

        <div className="min-h-[280px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {step === "pick-teacher" ? (
                <TeacherAssignStepContent>
                  <TeacherAssignStepBlock>
                    <TeacherSearchList
                      courseId={course.id}
                      excludeUserIds={assignedUserIds}
                      selectedTeacherId={teacher ? Number(teacher.id) : null}
                      assignedAsRoleId={roleOption?.id ?? null}
                      skipBusyIndicator={roleOption?.isCollisionEnabled === false}
                      onSelectTeacher={(next) =>
                        setTeacher((prev) =>
                          prev && Number(prev.id) === Number(next.id) ? null : next,
                        )
                      }
                    />
                  </TeacherAssignStepBlock>
                </TeacherAssignStepContent>
              ) : null}

              {step === "pick-role" ? (
                <TeacherAssignStepContent>
                  {teacher ? (
                    <TeacherAssignStepBlock>
                      <AssignmentTeacherContext teacher={teacher} />
                    </TeacherAssignStepBlock>
                  ) : null}
                  <TeacherAssignStepBlock>
                    <CourseRoleStep
                      roles={roles}
                      selectedRoleId={roleOption?.id ?? null}
                      onSelectRole={setRoleOption}
                      isLoading={isLoading}
                    />
                  </TeacherAssignStepBlock>
                  <TeacherAssignStepBlock>
                    <div className="flex justify-between">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setStep("pick-teacher")}
                      >
                        Back
                      </Button>
                      <Button
                        type="button"
                        disabled={
                          roleOption !== null && !roleNeedsSessionSelection(roleOption)
                            ? !canAssignFromRole
                            : !canContinueFromRole
                        }
                        isLoading={
                          roleOption !== null &&
                          !roleNeedsSessionSelection(roleOption) &&
                          assign.isPending
                        }
                        onClick={handleRoleStepPrimaryAction}
                      >
                        {roleOption !== null && !roleNeedsSessionSelection(roleOption)
                          ? "Assign"
                          : "Continue"}
                      </Button>
                    </div>
                  </TeacherAssignStepBlock>
                </TeacherAssignStepContent>
              ) : null}

              {step === "pick-sessions" ? (
                <TeacherAssignStepContent>
                  {teacher ? (
                    <TeacherAssignStepBlock>
                      <AssignmentTeacherContext
                        teacher={teacher}
                        roleName={roleOption?.name}
                      />
                    </TeacherAssignStepBlock>
                  ) : null}
                  <TeacherAssignStepBlock>
                    <SessionSelectionStep
                      course={course}
                      sessions={sessions}
                      courseWeekdays={courseWeekdays}
                        role={
                        roleOption ?? {
                          id: -1,
                          name: "Teacher",
                          seniority: "MAIN_TEACHER",
                          isSubstitute: false,
                          isCollisionEnabled: true,
                        }
                      }
                      mode={mode}
                      onModeChange={setMode}
                      weekdays={weekdays}
                      onWeekdaysChange={setWeekdays}
                      selectedIds={selectedIds}
                      onSelectedIdsChange={setSelectedIds}
                      autoRemoveEnabled={autoRemoveEnabled}
                      onAutoRemoveEnabledChange={setAutoRemoveEnabled}
                      timeFormat={timeFormat}
                      assignAction={
                        isCustomSessionMode
                          ? {
                              onAssign: requestAssignFromSessions,
                              canAssign: canAssignFromSessions,
                              isPending: assign.isPending,
                              onBack: goBackFromSessions,
                            }
                          : undefined
                      }
                    />
                  </TeacherAssignStepBlock>
                  {!isCustomSessionMode ? (
                    <TeacherAssignStepBlock>
                      <div className="flex justify-between">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={goBackFromSessions}
                        >
                          Back
                        </Button>
                        <Button
                          type="button"
                          disabled={!canAssignFromSessions}
                          isLoading={assign.isPending}
                          onClick={requestAssignFromSessions}
                        >
                          Assign
                        </Button>
                      </div>
                    </TeacherAssignStepBlock>
                  ) : null}
                </TeacherAssignStepContent>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <AlertDialog.Root
        open={confirmEmptySessions}
        onOpenChange={setConfirmEmptySessions}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Assign without sessions?</AlertDialog.Title>
            <AlertDialog.Description>
              This teacher will be on the course roster but not assigned to any
              sessions. Are you sure?
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
                Cancel
              </AlertDialog.Close>
              <AlertDialog.Close
                render={
                  <Button
                    type="button"
                    onClick={() => {
                      assign.mutate();
                    }}
                  />
                }
              >
                Assign anyway
              </AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

"use client";

import { Button, Menu } from "@/components/primitives";
import { TypographyH1 } from "@/components/typography/h1";
import { usePermissions } from "@/hooks/usePermissions";
import { queryClient } from "@/lib/query";
import { crossfade, crossfadeInstant } from "@/lib/sj/motion";
import {
  EditPencil,
  Import,
  NavArrowDown as ChevronDown,
  QuestionMark,
} from "iconoir-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import AssignmentForm from "./assignment-form";
import AssignmentList from "./assignment-list";
import { CourseAssessmentsGradingPanel } from "./course-assessments-grading-panel";
import { ImportQuizDialog } from "./import-quiz-dialog";

type CourseAssessmentsHubProps = {
  canCreateAssignment: boolean;
  courseId: number;
};

export function CourseAssessmentsHub({
  canCreateAssignment,
  courseId,
}: CourseAssessmentsHubProps) {
  const { canAny } = usePermissions();
  const canGrade = canAny(["assignment.grade", "grade.manage"]);
  const reducedMotion = useReducedMotion();
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const invalidateAssessments = () => {
    void queryClient.invalidateQueries({
      queryKey: ["courseAssessments", courseId],
    });
  };

  return (
    <>
      <motion.div
        variants={reducedMotion ? crossfadeInstant : crossfade}
        initial="initial"
        animate="animate"
        className="space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TypographyH1>Assessments</TypographyH1>
          {canCreateAssignment ? (
            <Menu.Root>
              <Menu.Trigger
                render={
                  <Button type="button" className="h-9 gap-1.5" variant="primary" />
                }
              >
                Add
                <ChevronDown className="size-4 opacity-80" aria-hidden />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner align="end">
                  <Menu.Popup className="min-w-[14rem]">
                    {!isFormVisible ? (
                      <Menu.Item
                        onClick={() => setIsFormVisible(true)}
                        className="gap-2"
                      >
                        <EditPencil
                          className="size-4 shrink-0 opacity-70"
                          aria-hidden
                        />
                        Create assignment
                      </Menu.Item>
                    ) : null}
                    <Menu.Item
                      render={
                        <Link href={`/quizzes-v3/create?course=${courseId}`} />
                      }
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <QuestionMark
                        className="size-4 shrink-0 opacity-70"
                        aria-hidden
                      />
                      Create quiz
                    </Menu.Item>
                    <Menu.Item
                      onClick={() => setImportOpen(true)}
                      className="gap-2"
                    >
                      <Import className="size-4 shrink-0 opacity-70" aria-hidden />
                      Import quiz
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          ) : null}
        </div>

        {isFormVisible ? (
          <AssignmentForm
            refetch={invalidateAssessments}
            isEdit={false}
            courseId={courseId}
            onCancel={() => setIsFormVisible(false)}
          />
        ) : null}

        {canGrade ? (
          <CourseAssessmentsGradingPanel
            courseId={String(courseId)}
            embedded
          />
        ) : (
          <>
            <p className="text-sm text-text-secondary">Current assessments</p>
            <AssignmentList
              canEditAssignment={canCreateAssignment}
              courseId={courseId}
              listIsCard
            />
          </>
        )}
      </motion.div>

      <ImportQuizDialog
        courseId={courseId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={invalidateAssessments}
      />
    </>
  );
}

export default CourseAssessmentsHub;

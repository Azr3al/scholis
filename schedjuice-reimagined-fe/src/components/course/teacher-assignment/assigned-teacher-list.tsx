"use client";

import { Trash } from "iconoir-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { AlertDialog, Avatar, Button } from "@/components/primitives";
import { canAssignTeacherToEvents } from "@/helpers/authorization";
import type { AssignedTeacher } from "@/hooks/course/use-course-assignment-data";
import { useUser } from "@/hooks/useUser";
import { resolveListItemPresence } from "@/lib/sj/motion";

export type AssignedTeacherListProps = {
  teachers: AssignedTeacher[];
  onRemove: (teacher: AssignedTeacher) => void;
  removingUserCourseId: number | null;
};

export function AssignedTeacherList({
  teachers,
  onRemove,
  removingUserCourseId,
}: AssignedTeacherListProps) {
  const { user } = useUser();
  const reduced = useReducedMotion();
  const rowVariants = resolveListItemPresence(reduced);
  const [pending, setPending] = useState<AssignedTeacher | null>(null);

  if (teachers.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No teachers are assigned to this course yet.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        <AnimatePresence mode="popLayout" initial={false}>
          {teachers.map((teacher) => {
            const canRemove =
              user != null && canAssignTeacherToEvents(user, Number(teacher.user.id));
            return (
              <motion.li
                key={teacher.userCourseId}
                layout={!reduced}
                variants={rowVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex min-h-[52px] items-center gap-3 py-3"
              >
                <Avatar
                  src={teacher.user.profile_image || "/images/default.jpg"}
                  name={teacher.user.name || teacher.user.email || "Teacher"}
                  className="h-8 w-8"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">
                    {teacher.user.name}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {[
                      teacher.roleName,
                      teacher.sessionCount > 0
                        ? `${teacher.sessionCount} ${
                            teacher.sessionCount === 1 ? "session" : "sessions"
                          }`
                        : null,
                      teacher.isSubstitute ? "Substitute" : null,
                      teacher.autoRemoveOn
                        ? `Auto-removes after ${teacher.autoRemoveOn}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="size-8 p-0"
                  aria-label={`Remove ${teacher.user.name} from this course`}
                  disabled={!canRemove}
                  isLoading={removingUserCourseId === teacher.userCourseId}
                  onClick={() => setPending(teacher)}
                >
                  <Trash />
                </Button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <AlertDialog.Root
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Remove teacher from course?</AlertDialog.Title>
            <AlertDialog.Description>
              {pending
                ? pending.sessionCount > 0
                  ? `${pending.user.name} loses all ${pending.sessionCount} assigned sessions on this course. To change their role or sessions, remove them and assign again.`
                  : `${pending.user.name} will be removed from this course. To change their role, remove them and assign again.`
                : ""}
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
                Cancel
              </AlertDialog.Close>
              <AlertDialog.Close
                render={
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => {
                      if (pending) onRemove(pending);
                      setPending(null);
                    }}
                  />
                }
              >
                Remove
              </AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

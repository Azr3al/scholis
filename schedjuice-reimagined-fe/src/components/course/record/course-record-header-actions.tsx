"use client";

import Link from "next/link";
import { EditPencil, MoreHoriz } from "iconoir-react";
import { useQueryClient } from "@tanstack/react-query";
import { buttonVariants } from "@/components/primitives/button";
import { Menu } from "@/components/primitives/menu";
import CourseJoinCode from "@/components/course/join-code-handler";
import { CourseOverflowMenuItems } from "@/components/course/record/course-overflow-menu-items";
import { getDropdownMenuItems } from "@/config/course";
import { PANEL_OVERFLOW_EXCLUDED_HREFS } from "@/config/course-record-nav";
import { canAccessCourseStaffActions, permissionsFor } from "@/helpers/authorization";
import { cn } from "@/lib/utils";
import type { courseType } from "@/types/course";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

function hasOverflowItems(
  user: accountType,
  course: courseType,
  tenant: organizationType | null,
): boolean {
  return getDropdownMenuItems(user, course, tenant).some((group) =>
    group.some((item) => !PANEL_OVERFLOW_EXCLUDED_HREFS.has(item.href.split("?")[0])),
  );
}

export function CourseRecordHeaderActions({
  courseId,
  course,
  user,
  tenant,
}: {
  courseId: string;
  course: courseType;
  user: accountType;
  tenant: organizationType | null;
}) {
  const queryClient = useQueryClient();
  const showJoinCode = canAccessCourseStaffActions(user);
  const showEdit = permissionsFor(user).can("course.update");
  const showOverflow = hasOverflowItems(user, course, tenant);

  const handleJoinCodeChanged = () => {
    void queryClient.invalidateQueries({ queryKey: ["getCourse", courseId] });
  };

  if (!showJoinCode && !showEdit && !showOverflow) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {showJoinCode ? (
        <CourseJoinCode course={course} onChanged={handleJoinCodeChanged} />
      ) : null}
      {showEdit ? (
        <Link
          href={`/courses/${courseId}/edit`}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          <EditPencil width={16} height={16} aria-hidden />
          Edit course
        </Link>
      ) : null}
      {showOverflow ? (
        <Menu.Root>
          <Menu.Trigger
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-text-secondary outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            aria-label="Course actions"
          >
            <span className="hidden sm:inline">Course actions</span>
            <span className="sm:hidden">Actions</span>
            <MoreHoriz width={16} height={16} aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end">
              <Menu.Popup>
                <CourseOverflowMenuItems
                  user={user}
                  course={course}
                  tenant={tenant}
                  courseId={courseId}
                />
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Menu } from "@/components/primitives/menu";
import { getDropdownMenuItems } from "@/config/course";
import { PANEL_OVERFLOW_EXCLUDED_HREFS } from "@/config/course-record-nav";
import type { courseType } from "@/types/course";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

function overflowHref(href: string, courseId: string): string {
  if (href === "checkin-history") {
    return `/courses/${courseId}/checkin-history/-1`;
  }
  return `/courses/${courseId}/${href}`;
}

export function CourseOverflowMenuItems({
  user,
  course,
  tenant,
  courseId,
}: {
  user: accountType;
  course: courseType;
  tenant: organizationType | null;
  courseId: string;
}) {
  const groups = getDropdownMenuItems(user, course, tenant)
    .map((group) =>
      group.filter((item) => {
        const key = item.href.split("?")[0];
        return !PANEL_OVERFLOW_EXCLUDED_HREFS.has(key);
      }),
    )
    .filter((group) => group.length > 0);

  if (!groups.length) {
    return null;
  }

  return (
    <>
      {groups.map((group, groupIndex) => (
        <Fragment key={`course-overflow-${groupIndex}`}>
          {groupIndex > 0 ? <Menu.Separator /> : null}
          {group.map((item) => (
            <Menu.Item
              key={item.href}
              render={<Link href={overflowHref(item.href, courseId)} />}
            >
              {item.title}
            </Menu.Item>
          ))}
        </Fragment>
      ))}
    </>
  );
}

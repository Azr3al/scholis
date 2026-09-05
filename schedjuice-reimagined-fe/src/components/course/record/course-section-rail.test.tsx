import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/sound/click-sound", () => ({
  playClick: vi.fn(),
}));

vi.mock("motion/react", () => {
  const passthrough = (tag: "aside" | "div" | "nav") => {
    function MotionPassthrough({
      children,
      ...rest
    }: {
      children?: ReactNode;
    }) {
      return React.createElement(tag, rest, children);
    }
    MotionPassthrough.displayName = `motion.${tag}`;
    return MotionPassthrough;
  };
  return {
    motion: {
      aside: passthrough("aside"),
      div: passthrough("div"),
      nav: passthrough("nav"),
    },
  };
});

import { CourseSectionRail } from "./course-section-rail";
import { role, type accountType } from "@/types/user";
import type { courseType } from "@/types/course";
import { SubjectStrategy } from "@/types/program";

const COURSE_ID = "discount-test";
const COURSE_TITLE = "Flyers 233 WE (YGN) (9:30 - 1 PM)";
const CHIP_NAME = "RailChipSubject";

const user = {
  id: 1,
  roles: [role.teacher],
  permissions: [],
} as unknown as accountType;

const course = {
  id: COURSE_ID,
  title: COURSE_TITLE,
  code: "FLY-233",
  program: { subject_strategy: SubjectStrategy.required },
  subject: { id: 9, name: CHIP_NAME },
} as unknown as courseType;

describe("CourseSectionRail", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render section nav while course is loading", () => {
    render(
      <CourseSectionRail
        courseId={COURSE_ID}
        course={null}
        user={user}
        tenant={null}
        pathname={`/courses/${COURSE_ID}`}
        isLoading={true}
      />,
    );

    expect(screen.queryByRole("navigation", { name: "Course sections" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
  });

  it("keeps Academic Hub and the title without subject chips", () => {
    render(
      <CourseSectionRail
        courseId={COURSE_ID}
        course={course}
        user={user}
        tenant={null}
        pathname={`/courses/${COURSE_ID}`}
        isLoading={false}
      />,
    );

    const hub = screen.getByRole("link", { name: "Academic Hub" });
    expect(hub.getAttribute("href")).toBe("/courses");
    expect(screen.getByText(COURSE_TITLE)).toBeTruthy();
    expect(screen.queryByText(CHIP_NAME)).toBeNull();
  });
});

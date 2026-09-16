import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { courseType } from "@/types/course";

const COURSE_TITLE = "Flyers Secret Title";
let pathname = "/courses/c1";
let header: { breadcrumb?: ReactNode } = {};

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/components/shell/use-page-header", () => ({
  usePageHeader: (config: { breadcrumb?: ReactNode }) => {
    header = config;
  },
}));

import { useCourseRecordPageHeader } from "./use-course-record-page-header";

function Probe() {
  useCourseRecordPageHeader({
    courseId: "c1",
    course: { title: COURSE_TITLE } as courseType,
  });
  return <>{header.breadcrumb}</>;
}

afterEach(() => {
  cleanup();
  pathname = "/courses/c1";
  header = {};
});

describe("useCourseRecordPageHeader", () => {
  it("shows Academic Hub / Overview without the course title", () => {
    render(<Probe />);

    const hub = screen.getByRole("link", { name: "Academic Hub" });
    expect(hub.getAttribute("href")).toBe("/courses");
    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.queryByText(COURSE_TITLE)).toBeNull();
  });
});

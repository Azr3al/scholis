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

import { AdmissionsSectionRail } from "./admissions-section-rail";

afterEach(() => {
  cleanup();
});

describe("AdmissionsSectionRail", () => {
  it("lists People and Courses on /admissions/courses with Courses current", () => {
    render(<AdmissionsSectionRail pathname="/admissions/courses" />);

    expect(screen.getByRole("link", { name: "People" }).getAttribute("href")).toBe(
      "/admissions",
    );
    const courses = screen.getByRole("link", { name: "Courses" });
    expect(courses.getAttribute("href")).toBe("/admissions/courses");
    expect(courses.getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByRole("link", { name: "People" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});

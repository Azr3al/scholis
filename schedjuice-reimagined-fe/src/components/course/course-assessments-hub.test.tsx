import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";

const canAny = vi.fn();

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canAny }),
}));

vi.mock("motion/react", () => {
  const passthrough = (tag: "div") => {
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
    motion: { div: passthrough("div") },
    useReducedMotion: () => true,
  };
});

vi.mock("./course-assessments-grading-panel", () => ({
  CourseAssessmentsGradingPanel: () => (
    <div data-testid="grading-panel">Grading tables</div>
  ),
}));

vi.mock("./assignment-list", () => ({
  default: () => <div data-testid="assignment-list">Card list</div>,
}));

vi.mock("./assignment-form", () => ({
  default: () => null,
}));

vi.mock("./import-quiz-dialog", () => ({
  ImportQuizDialog: () => null,
}));

import { CourseAssessmentsHub } from "./course-assessments-hub";

describe("CourseAssessmentsHub", () => {
  afterEach(() => {
    cleanup();
    canAny.mockReset();
  });

  it("shows grading tables when user can grade", () => {
    canAny.mockReturnValue(true);

    render(
      <CourseAssessmentsHub courseId={96} canCreateAssignment={false} />,
    );

    expect(screen.getByTestId("grading-panel")).toBeTruthy();
    expect(screen.queryByTestId("assignment-list")).toBeNull();
    expect(screen.queryByText("Current assessments")).toBeNull();
  });

  it("shows card list for users without grading permissions", () => {
    canAny.mockReturnValue(false);

    render(
      <CourseAssessmentsHub courseId={96} canCreateAssignment={false} />,
    );

    expect(screen.getByTestId("assignment-list")).toBeTruthy();
    expect(screen.getByText("Current assessments")).toBeTruthy();
    expect(screen.queryByTestId("grading-panel")).toBeNull();
  });

  it("passes assignment.grade and grade.manage to permission check", () => {
    canAny.mockReturnValue(false);

    render(
      <CourseAssessmentsHub courseId={96} canCreateAssignment={false} />,
    );

    expect(canAny).toHaveBeenCalledWith(["assignment.grade", "grade.manage"]);
  });
});

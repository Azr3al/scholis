import { render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { TeacherCandidate } from "./types";

import { TeacherSearchList } from "./teacher-search-list";

vi.mock("motion/react", () => {
  const passthrough = (tag: "div") => {
    function MotionPassthrough({ children }: { children?: ReactNode }) {
      return React.createElement(tag, null, children);
    }
    MotionPassthrough.displayName = `motion.${tag}`;
    return MotionPassthrough;
  };
  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => children,
    motion: { div: passthrough("div") },
    useReducedMotion: () => false,
  };
});

const candidates: TeacherCandidate[] = [
  {
    id: 1,
    name: "Alice",
    email: "alice@example.com",
    isFree: false,
    busyReason: "substitution_reserve",
  },
  {
    id: 2,
    name: "Bob",
    email: "bob@example.com",
    isFree: false,
    busyReason: "schedule_conflict",
  },
];

vi.mock("@/hooks/course/use-teacher-candidates", () => ({
  useTeacherCandidates: () => ({
    candidates,
    isLoading: false,
    isRefetching: false,
  }),
}));

vi.mock("@/hooks/useUser", () => ({
  useUser: () => ({
    user: { roles: ["teacher"] },
  }),
}));

vi.mock("@/helpers/authorization", () => ({
  canAssignTeacherToEvents: () => true,
}));

describe("TeacherSearchList", () => {
  it("shows substitution reserve vs busy badges from busyReason", () => {
    render(
      <TeacherSearchList
        courseId={1}
        excludeUserIds={[]}
        selectedTeacherId={null}
        onSelectTeacher={() => {}}
      />,
    );

    expect(screen.getByText("Substitution reserve")).toBeTruthy();
    expect(screen.getByText("Busy")).toBeTruthy();
  });
});

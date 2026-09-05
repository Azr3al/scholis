import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => {
  const passthrough = (tag: "div" | "li") => {
    function MotionPassthrough({ children }: { children?: ReactNode }) {
      return React.createElement(tag, null, children);
    }
    MotionPassthrough.displayName = `motion.${tag}`;
    return MotionPassthrough;
  };
  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => children,
    motion: {
      div: passthrough("div"),
      li: passthrough("li"),
    },
    useReducedMotion: () => false,
  };
});

import { toSessionOptions } from "@/helpers/course/session-grouping";

import { SessionSelectionStep } from "./session-selection-step";
import type { CourseRoleOption } from "./types";

const sessions = toSessionOptions(
  [
    { id: 1, date: "2026-08-03T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
    { id: 2, date: "2026-08-05T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
    { id: 3, date: "2026-08-07T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
  ],
  "Asia/Rangoon",
);

const mtRole: CourseRoleOption = {
  id: 1,
  name: "Main Teacher",
  seniority: "MAIN_TEACHER",
  isSubstitute: false,
  isCollisionEnabled: true,
};
const subRole: CourseRoleOption = {
  id: 2,
  name: "Substitute Main Teacher",
  seniority: "MAIN_TEACHER",
  isSubstitute: true,
  isCollisionEnabled: true,
};

const courseFixture = {
  title: "Test Course",
  start_date: new Date("2026-07-01"),
  end_date: new Date("2027-01-01"),
  repeat_every: ["Tue", "Wed"],
  first_event_time_from: "09:00:00",
  first_event_time_to: "11:00:00",
};

afterEach(() => {
  cleanup();
});

function setup(
  overrides: Partial<React.ComponentProps<typeof SessionSelectionStep>> = {},
) {
  const props = {
    course: courseFixture,
    sessions,
    courseWeekdays: [1, 3, 5],
    role: mtRole,
    mode: "weekdays" as const,
    onModeChange: vi.fn(),
    weekdays: [1, 3, 5],
    onWeekdaysChange: vi.fn(),
    selectedIds: new Set([1, 2, 3]),
    onSelectedIdsChange: vi.fn(),
    autoRemoveEnabled: true,
    onAutoRemoveEnabledChange: vi.fn(),
    timeFormat: "24h" as const,
    ...overrides,
  };
  render(<SessionSelectionStep {...props} />);
  return props;
}

describe("SessionSelectionStep", () => {
  it("shows course schedule summary for a non-substitute role", () => {
    setup();
    expect(screen.getByText("Test Course")).toBeTruthy();
    expect(screen.getByText(/Weekly/i)).toBeTruthy();
    expect(screen.getByText(/Tue, Wed/)).toBeTruthy();
    expect(screen.getByRole("group", { name: /course from/i })).toBeTruthy();
  });

  it("deselecting a weekday drops that weekday's sessions", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Wed" }));
    expect(props.onWeekdaysChange).toHaveBeenCalledWith([1, 5]);
    expect(props.onSelectedIdsChange).toHaveBeenCalledWith(new Set([1, 3]));
  });

  it("hides the weekday picker for a substitute role", () => {
    setup({ role: subRole, mode: "custom" });
    expect(screen.queryByRole("button", { name: "Wed" })).toBeNull();
    expect(screen.queryByRole("button", { name: /specific dates/i })).toBeNull();
  });

  it("switches to custom dates from the link button", async () => {
    const props = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /pick specific dates instead/i }),
    );
    expect(props.onModeChange).toHaveBeenCalledWith("custom");
  });

  it("does not offer auto-removal for a non-substitute role", () => {
    setup({ mode: "custom" });
    expect(screen.queryByLabelText(/remove automatically/i)).toBeNull();
  });

  it("labels auto-removal with the session count and last date", () => {
    setup({ role: subRole, mode: "custom", selectedIds: new Set([1, 2]) });
    expect(
      screen.getByLabelText("Remove automatically after 2 sessions (Aug 5, 2026)"),
    ).toBeTruthy();
  });

  it("uses the singular form for one session", () => {
    setup({ role: subRole, mode: "custom", selectedIds: new Set([1]) });
    expect(
      screen.getByLabelText("Remove automatically after 1 session (Aug 3, 2026)"),
    ).toBeTruthy();
  });

  it("hides auto-removal when nothing is selected", () => {
    setup({ role: subRole, mode: "custom", selectedIds: new Set() });
    expect(screen.queryByLabelText(/remove automatically/i)).toBeNull();
  });

  it("renders Assign in custom mode when assignAction is provided", () => {
    setup({
      role: subRole,
      mode: "custom",
      selectedIds: new Set([1]),
      assignAction: {
        onAssign: vi.fn(),
        canAssign: true,
        isPending: false,
        onBack: vi.fn(),
      },
    });
    expect(screen.getByRole("button", { name: /^assign$/i })).toBeTruthy();
  });

  it("places auto-remove and Assign above the session grid in custom mode", () => {
    setup({
      role: subRole,
      mode: "custom",
      selectedIds: new Set([1, 2]),
      assignAction: {
        onAssign: vi.fn(),
        canAssign: true,
        isPending: false,
        onBack: vi.fn(),
      },
    });
    const autoRemove = screen.getByLabelText(
      "Remove automatically after 2 sessions (Aug 5, 2026)",
    );
    const assignButton = screen.getByRole("button", { name: /^assign$/i });
    const sessionCheckbox = screen.getByRole("checkbox", { name: /Mon 3/ });

    expect(
      autoRemove.compareDocumentPosition(sessionCheckbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      assignButton.compareDocumentPosition(sessionCheckbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

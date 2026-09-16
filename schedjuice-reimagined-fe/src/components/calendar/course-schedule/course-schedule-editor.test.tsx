import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { courseType, eventType } from "@/types/course";

const { futureSession, course } = vi.hoisted(() => {
  const courseFixture = {
    id: 1,
    title: "Algebra I",
    status: "active",
    description: "Test course",
    start_date: new Date("2026-09-01"),
    end_date: new Date("2026-12-31"),
    user_courses: [],
    category: 1,
    is_recurring: true,
    repeat_every: ["Monday"],
  } as courseType;

  const sessionFixture = {
    id: 42,
    title: "Algebra I",
    date: "2026-09-15",
    time_from: "09:00:00",
    time_to: "11:00:00",
    has_checkin: false,
    course: courseFixture,
  } as eventType;

  return { futureSession: sessionFixture, course: courseFixture };
});

vi.mock("motion/react", () => {
  const passthrough = (tag: "section" | "div") => {
    function MotionPassthrough({
      children,
      ...props
    }: {
      children?: ReactNode;
      ref?: React.Ref<HTMLElement>;
    }) {
      return React.createElement(tag, props, children);
    }
    MotionPassthrough.displayName = `motion.${tag}`;
    return MotionPassthrough;
  };
  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => children,
    motion: {
      section: passthrough("section"),
      div: passthrough("div"),
    },
    useReducedMotion: () => false,
  };
});

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({
    tenant: {
      timezone: "UTC",
      time_display_format: "24h",
    },
  }),
}));

vi.mock("@/components/primitives/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: vi.fn(() => Promise.resolve({ data: { data: {} } })),
}));

vi.mock("@/components/calendar/calendar-timezone-notice", () => ({
  CalendarTimezoneNotice: () => null,
}));

vi.mock("mm-cal-js", () => ({
  isSabbath: () => 0,
}));

vi.mock("@/components/calendar/grid/month-grid", () => ({
  MonthGrid: ({
    onSessionClick,
  }: {
    onSessionClick?: (session: eventType) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSessionClick?.(futureSession)}
    >
      Open session
    </button>
  ),
}));

import { CourseScheduleEditor } from "./course-schedule-editor";

function renderEditor(initialEvents: eventType[] = [futureSession]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Harness() {
    const [events, setEvents] = useState(initialEvents);
    return (
      <CourseScheduleEditor
        course={course}
        events={events}
        setEvents={setEvents}
      />
    );
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

async function openSessionActions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /open session/i }));
  expect(screen.getByRole("dialog", { name: /algebra i/i })).toBeTruthy();
}

describe("CourseScheduleEditor session actions dialog", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-01T10:00:00.000Z"));
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("closes the actions dialog and opens the edit composer when Edit time is chosen", async () => {
    const user = userEvent.setup();
    renderEditor();
    await openSessionActions(user);

    await user.click(screen.getByRole("button", { name: /edit time/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /algebra i/i }),
      ).toBeNull();
    });
    expect(screen.getByRole("heading", { name: /edit session time/i })).toBeTruthy();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("closes the actions dialog after confirming session delete", async () => {
    const user = userEvent.setup();
    renderEditor();
    await openSessionActions(user);

    await user.click(screen.getByRole("button", { name: /^delete/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("alertdialog", { name: /delete session/i }),
      ).toBeTruthy();
    });

    await user.click(
      screen.getByRole("button", { name: /delete 1 session/i }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /algebra i/i }),
      ).toBeNull();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(screen.getByRole("button", { name: /save schedule/i })).toBeTruthy();
  });
});

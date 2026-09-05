import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import type { accountType } from "@/types/user";

import { TeacherAssignmentPanel } from "./teacher-assignment-panel";
import type { CourseRoleOption } from "./types";

const { makePostRequest, deleteEntity } = vi.hoisted(() => {
  const makePostRequest = vi.fn(() => Promise.resolve({ data: { data: {} } }));
  const deleteEntity = vi.fn(() => Promise.resolve({ data: { data: {} } }));
  return { makePostRequest, deleteEntity };
});

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest,
  deleteEntity,
  searchEntities: vi.fn(),
}));

const sessions = [
  {
    id: 11,
    isoDate: "2026-08-03",
    monthKey: "2026-08",
    dayLabel: "Mon 3",
    weekday: 1,
    timeFrom: "09:00:00",
    timeTo: "11:00:00",
  },
  {
    id: 12,
    isoDate: "2026-08-05",
    monthKey: "2026-08",
    dayLabel: "Wed 5",
    weekday: 3,
    timeFrom: "09:00:00",
    timeTo: "11:00:00",
  },
];

const roles: CourseRoleOption[] = [
  {
    id: 1,
    name: "Main Teacher",
    seniority: "MAIN_TEACHER",
    isSubstitute: false,
    isCollisionEnabled: true,
  },
  {
    id: 2,
    name: "Substitute Main Teacher",
    seniority: "MAIN_TEACHER",
    isSubstitute: true,
    isCollisionEnabled: true,
  },
  {
    id: 3,
    name: "Coordinator",
    seniority: "OTHER",
    isSubstitute: false,
    isCollisionEnabled: false,
  },
];

const courseWeekdays = [1, 3];

vi.mock("@/hooks/course/use-course-assignment-data", () => ({
  useCourseAssignmentData: () => ({
    sessions,
    courseWeekdays,
    roles,
    assignedTeachers: [],
    assignedUserIds: [],
    isLoading: false,
    refetchAll: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({
    tenant: {
      timezone: "Asia/Rangoon",
      is_course_role_enabled: true,
      time_display_format: "24h",
    },
  }),
}));

vi.mock("@/hooks/useUser", () => ({
  useUser: () => ({
    user: {
      id: 1,
      permissions: ["course.manage_members"],
      roles: ["admin"],
    } as accountType,
  }),
}));

vi.mock("@/components/primitives/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

vi.mock("./teacher-search-list", () => ({
  TeacherSearchList: ({
    onSelectTeacher,
  }: {
    onSelectTeacher: (teacher: { id: number; name: string; email: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelectTeacher({ id: 7, name: "Audrey", email: "audrey@x.com" })
      }
    >
      Audrey
    </button>
  ),
}));

vi.mock("./assigned-teacher-list", () => ({
  AssignedTeacherList: () => <p>Assigned teachers stub</p>,
}));

vi.mock("./course-role-step", () => ({
  CourseRoleStep: ({
    roles: roleOptions,
    onSelectRole,
  }: {
    roles: CourseRoleOption[];
    onSelectRole: (role: CourseRoleOption) => void;
  }) => (
    <div>
      {roleOptions.map((role) => (
        <button
          key={role.id}
          type="button"
          role="radio"
          onClick={() => onSelectRole(role)}
        >
          {role.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./session-selection-step", () => ({
  SessionSelectionStep: ({
    selectedIds,
    onSelectedIdsChange,
    autoRemoveEnabled,
    onAutoRemoveEnabledChange,
    assignAction,
  }: {
    selectedIds: Set<number>;
    onSelectedIdsChange: (ids: Set<number>) => void;
    autoRemoveEnabled: boolean;
    onAutoRemoveEnabledChange: (enabled: boolean) => void;
    assignAction?: {
      onAssign: () => void;
      canAssign: boolean;
      isPending: boolean;
      onBack: () => void;
    };
  }) => (
    <div>
      <button
        type="button"
        role="checkbox"
        aria-label="Mon 3"
        aria-checked={selectedIds.has(11)}
        onClick={() => onSelectedIdsChange(new Set([11]))}
      />
      <button
        type="button"
        role="switch"
        aria-checked={autoRemoveEnabled}
        onClick={() => onAutoRemoveEnabledChange(!autoRemoveEnabled)}
      />
      {assignAction ? (
        <>
          <button type="button" onClick={assignAction.onBack}>
            Back
          </button>
          <button
            type="button"
            disabled={!assignAction.canAssign}
            onClick={assignAction.onAssign}
          >
            Assign
          </button>
        </>
      ) : null}
    </div>
  ),
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TeacherAssignmentPanel
        course={{ id: 5, title: "Test", repeat_every: ["Mon", "Wed"] } as never}
      />
    </QueryClientProvider>,
  );
}

async function selectTeacherAndRole(roleName: string) {
  await userEvent.click(screen.getByRole("button", { name: /Audrey/ }));
  await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  await userEvent.click(screen.getByRole("radio", { name: roleName }));
  await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
}

afterEach(() => {
  cleanup();
});

describe("TeacherAssignmentPanel", () => {
  beforeEach(() => {
    makePostRequest.mockClear();
  });

  it("blocks continuing past the role step until a role is chosen", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /Audrey/ }));
    await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByRole("button", { name: /^continue$/i }).disabled).toBe(true);
  });

  it("submits weekday-derived sessions without an auto-removal date", async () => {
    renderPanel();
    await selectTeacherAndRole("Main Teacher");
    await userEvent.click(screen.getByRole("button", { name: /^assign$/i }));
    await waitFor(() => expect(makePostRequest).toHaveBeenCalled());
    const [url, payload] = makePostRequest.mock.calls[0] as [
      string,
      {
        user_id: number;
        assigned_as_role_id: number;
        removed_events: unknown[];
        substitute_auto_remove_on: null;
        new_events: { id: number }[];
      },
    ];
    expect(url).toBe("courses/5/assign-events");
    expect(payload).toMatchObject({
      user_id: 7,
      assigned_as_role_id: 1,
      removed_events: [],
      substitute_auto_remove_on: null,
    });
    expect(payload.new_events).toEqual([{ id: 11 }, { id: 12 }]);
  });

  it("sends the last selected date when a substitute has auto-removal on", async () => {
    renderPanel();
    await selectTeacherAndRole("Substitute Main Teacher");
    await userEvent.click(screen.getByRole("checkbox", { name: /Mon 3/ }));
    await userEvent.click(screen.getByRole("button", { name: /^assign$/i }));
    await waitFor(() => expect(makePostRequest).toHaveBeenCalled());
    const payload = makePostRequest.mock.calls[0]?.[1] as {
      assigned_as_role_id: number;
      substitute_auto_remove_on: string;
    };
    expect(payload).toMatchObject({
      assigned_as_role_id: 2,
      substitute_auto_remove_on: "2026-08-03",
    });
  });

  it("clears the auto-removal date when the switch is turned off", async () => {
    renderPanel();
    await selectTeacherAndRole("Substitute Main Teacher");
    await userEvent.click(screen.getByRole("checkbox", { name: /Mon 3/ }));
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: /^assign$/i }));
    await waitFor(() => expect(makePostRequest).toHaveBeenCalled());
    const payload = makePostRequest.mock.calls[0]?.[1] as {
      substitute_auto_remove_on: null;
    };
    expect(payload.substitute_auto_remove_on).toBeNull();
  });

  it("blocks assigning with no sessions selected", async () => {
    renderPanel();
    await selectTeacherAndRole("Substitute Main Teacher");
    expect(screen.getByRole("button", { name: /^assign$/i }).disabled).toBe(true);
  });

  it("assigns a collision-disabled role from the role step without session selection", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /Audrey/ }));
    await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await userEvent.click(screen.getByRole("radio", { name: "Coordinator" }));
    await userEvent.click(screen.getByRole("button", { name: /^assign$/i }));
    await waitFor(() => expect(makePostRequest).toHaveBeenCalled());
    const [url, payload] = makePostRequest.mock.calls[0] as [
      string,
      {
        user_id: number;
        assigned_as_role_id: number;
        removed_events: unknown[];
        substitute_auto_remove_on: null;
        new_events: { id: number }[];
      },
    ];
    expect(url).toBe("courses/5/assign-events");
    expect(payload).toMatchObject({
      user_id: 7,
      assigned_as_role_id: 3,
      removed_events: [],
      substitute_auto_remove_on: null,
      new_events: [],
    });
    expect(screen.queryByRole("checkbox", { name: /Mon 3/ })).toBeNull();
  });
});

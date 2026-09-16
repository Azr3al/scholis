import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attendanceStatus } from "@/types/attendance";
import { AttendanceStatusControl } from "./attendance-status-control";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

afterEach(() => {
  cleanup();
});

describe("AttendanceStatusControl press feedback", () => {
  it("marks the selected status with aria-pressed", () => {
    render(
      <AttendanceStatusControl
        value={attendanceStatus.late}
        onChange={vi.fn()}
        isMobile={true}
      />,
    );

    const group = screen.getByRole("group", { name: "Attendance status" });
    expect(
      within(group).getByRole("button", { name: "Late" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(
      within(group).getByRole("button", { name: "Present" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
  });

  it("renders absent with leave as a selectable status", () => {
    render(
      <AttendanceStatusControl
        value={attendanceStatus.absentWithLeave}
        onChange={vi.fn()}
        isMobile={true}
      />,
    );

    const group = screen.getByRole("group", { name: "Attendance status" });
    expect(
      within(group).getByRole("button", { name: "Absent with leave" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });
});

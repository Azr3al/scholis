import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentPaymentsMonthNotApplicable } from "./student-payments-month-not-applicable";

describe("StudentPaymentsMonthNotApplicable", () => {
  it("calls onGoToMonth with suggested month when button clicked", async () => {
    const user = userEvent.setup();
    const onGoToMonth = vi.fn();
    render(
      <StudentPaymentsMonthNotApplicable
        selectedMonth={new Date(2026, 6, 1)}
        courseStartDate="2026-10-03"
        courseEndDate="2027-02-28"
        suggestedMonth={{ year: 2026, month: 10 }}
        onGoToMonth={onGoToMonth}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /go to october 2026/i }),
    );
    expect(onGoToMonth).toHaveBeenCalledWith(new Date(2026, 9, 1));
  });
});

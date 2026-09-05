import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  axiosClient: { get: vi.fn(), post: vi.fn() },
}));

const useAdmissionsAttending = vi.fn();

vi.mock("@/hooks/admissions/use-admissions-attending", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/hooks/admissions/use-admissions-attending")
    >();
  return {
    ...actual,
    useAdmissionsAttending: (...args: unknown[]) =>
      useAdmissionsAttending(...args),
  };
});

import { PersonAttendingPanel } from "./person-attending-panel";
import type { AdmissionsLatestPayment } from "@/hooks/admissions/use-admissions-attending";

afterEach(() => {
  cleanup();
  useAdmissionsAttending.mockReset();
});

function pay(
  overrides: Partial<AdmissionsLatestPayment> = {},
): AdmissionsLatestPayment {
  return {
    payment_date: "2026-07-07T00:00:00.000Z",
    amount: "150000.0000",
    receipt_number: null,
    covered_months: [],
    status: "pending_verification",
    created_by: { id: 2, name: "Aye Aye" },
    remarks: null,
    screenshot: null,
    ...overrides,
  };
}

function renderWithClasses(
  classes: Array<{
    course_id: number;
    title: string;
    latest_payment: AdmissionsLatestPayment | null;
  }>,
) {
  useAdmissionsAttending.mockReturnValue({
    data: {
      id: 11,
      name: "Aung",
      email: "a@x",
      phone_number: "09",
      is_active: true,
      classes,
    },
    isLoading: false,
    isError: false,
    error: null,
  });
  return render(
    <PersonAttendingPanel personId={11} onNotFound={() => undefined} />,
  );
}

describe("PersonAttendingPanel payment card", () => {
  it("shows status and uploaded by instead of Automatic", () => {
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay(),
      },
    ]);
    expect(screen.queryByText("Automatic")).toBeNull();
    expect(screen.queryByText("Verified by")).toBeNull();
    expect(screen.getByText("Status").nextElementSibling?.textContent).toBe(
      "pending_verification",
    );
    expect(
      screen.getByText("Uploaded by").nextElementSibling?.textContent,
    ).toBe("Aye Aye");
  });

  it("omits Notes when remarks are empty and shows them when set", () => {
    const { unmount } = renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay({ remarks: null }),
      },
    ]);
    expect(screen.queryByText("Notes")).toBeNull();
    unmount();
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay({ remarks: "Paid in two transfers" }),
      },
    ]);
    expect(screen.getByText("Notes").nextElementSibling?.textContent).toBe(
      "Paid in two transfers",
    );
  });

  it("shows em dash for Uploaded by when created_by is null", () => {
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay({ created_by: null }),
      },
    ]);
    expect(
      screen.getByText("Uploaded by").nextElementSibling?.textContent,
    ).toBe("—");
    expect(screen.queryByText("Automatic")).toBeNull();
  });

  it("shows em dash for Period when covered_months is empty", () => {
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay({ covered_months: [] }),
      },
    ]);
    expect(screen.getByText("Period").nextElementSibling?.textContent).toBe(
      "—",
    );
  });

  it("says No payment when latest_payment is null", () => {
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: null,
      },
    ]);
    expect(screen.getByText("No payment")).toBeTruthy();
    expect(screen.queryByText("No verified payment")).toBeNull();
  });
});

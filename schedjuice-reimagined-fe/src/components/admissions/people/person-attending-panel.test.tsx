import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  axiosClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { timezone: "UTC" } }),
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
import type {
  AdmissionsAttendingClass,
  AdmissionsLatestPayment,
} from "@/hooks/admissions/use-admissions-attending";

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

function cls(
  overrides: Partial<AdmissionsAttendingClass> & { title?: string } = {},
): AdmissionsAttendingClass {
  return {
    course_id: 1,
    title: "FCE Reading and Writing",
    status: "active",
    start_date: "2026-07-28",
    end_date: "2027-03-31",
    weekday_pattern: "Mon Wed",
    first_event_time_from: "16:00:00",
    first_event_time_to: "17:30:00",
    current_unit: 8,
    current_unit_updated_at: "2026-08-03",
    main_teachers: [{ id: 9, name: "Aye Aye", phone_number: "09" }],
    latest_payment: null,
    ...overrides,
  };
}

function renderWithClasses(classes: AdmissionsAttendingClass[]) {
  useAdmissionsAttending.mockReturnValue({
    data: {
      id: 11,
      name: "Aung",
      email: "a@x",
      phone_number: "09",
      is_active: true,
      is_attending: true,
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
    renderWithClasses([cls({ latest_payment: pay() })]);
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
      cls({ latest_payment: pay({ remarks: null }) }),
    ]);
    expect(screen.queryByText("Notes")).toBeNull();
    unmount();
    renderWithClasses([
      cls({ latest_payment: pay({ remarks: "Paid in two transfers" }) }),
    ]);
    expect(screen.getByText("Notes").nextElementSibling?.textContent).toBe(
      "Paid in two transfers",
    );
  });

  it("shows em dash for Uploaded by when created_by is null", () => {
    renderWithClasses([cls({ latest_payment: pay({ created_by: null }) })]);
    expect(
      screen.getByText("Uploaded by").nextElementSibling?.textContent,
    ).toBe("—");
    expect(screen.queryByText("Automatic")).toBeNull();
  });

  it("shows em dash for Period when covered_months is empty", () => {
    renderWithClasses([cls({ latest_payment: pay({ covered_months: [] }) })]);
    expect(screen.getByText("Period").nextElementSibling?.textContent).toBe(
      "—",
    );
  });

  it("says No payment when latest_payment is null", () => {
    renderWithClasses([cls({ latest_payment: null })]);
    expect(screen.getByText("No payment")).toBeTruthy();
    expect(screen.queryByText("No verified payment")).toBeNull();
  });
});

describe("PersonAttendingPanel course facts", () => {
  it("omits Unit when current_unit is null", () => {
    renderWithClasses([
      cls({ current_unit: null, current_unit_updated_at: null }),
    ]);
    expect(screen.queryByText("Unit")).toBeNull();
  });

  it("labels phone as MT's contact and omits it when there is no MT", () => {
    const { unmount } = renderWithClasses([cls()]);
    expect(screen.getByText("MT's contact").nextElementSibling?.textContent).toBe(
      "09",
    );
    unmount();
    renderWithClasses([cls({ main_teachers: [] })]);
    expect(screen.getByText("MT").nextElementSibling?.textContent).toBe("—");
    expect(screen.queryByText("MT's contact")).toBeNull();
  });

  it("omits course Status when active and shows it when paused", () => {
    const { unmount } = renderWithClasses([cls({ status: "active" })]);
    expect(screen.queryByText("paused")).toBeNull();
    unmount();
    renderWithClasses([cls({ status: "paused", latest_payment: null })]);
    expect(screen.getByText("Status").nextElementSibling?.textContent).toBe(
      "paused",
    );
  });

  it("says No classes on record when classes is empty", () => {
    renderWithClasses([]);
    expect(screen.getByText("No classes on record.")).toBeTruthy();
    expect(
      screen.queryByText("Not attending any active or planned classes."),
    ).toBeNull();
  });
});

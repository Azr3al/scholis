import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudentPaymentsDrawer } from "../student-payments-drawer";

vi.mock("@/hooks/finances/use-student-payments-detail", () => ({
  useStudentPaymentsDetail: () => ({
    query: { isLoading: false, isError: false },
    rows: [],
    studentName: null,
    enabled: false,
  }),
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: null }),
}));

vi.mock("@/hooks/useTenantCurrencySymbol", () => ({
  useTenantCurrencySymbol: () => "Ks",
}));

describe("StudentPaymentsDrawer", () => {
  it("shows empty state instead of skeleton when enabled is false", () => {
    render(
      <StudentPaymentsDrawer
        studentId="1"
        courseId=""
        monthDate={new Date()}
        onClose={() => {}}
        onViewScreenshot={() => {}}
      />,
    );
    expect(screen.getByText(/can't load payments/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

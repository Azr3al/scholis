import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TimeSelect from "./time-select";

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: null, isLoading: false, refetchTenant: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe("TimeSelect", () => {
  it("hides AM/PM control when timeDisplayFormat is 24h", () => {
    render(<TimeSelect timeDisplayFormat="24h" />);
    expect(screen.queryByText(/AM\/PM/i)).toBeNull();
  });
});

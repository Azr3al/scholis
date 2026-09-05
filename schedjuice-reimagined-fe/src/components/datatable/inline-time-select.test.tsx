import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InlineTimeSelect from "./inline-time-select";

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: null, isLoading: false, refetchTenant: vi.fn() }),
}));

vi.mock("@/components/primitives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/primitives")>();
  return {
    ...actual,
    useToast: () => ({ add: vi.fn() }),
  };
});

afterEach(() => {
  cleanup();
});

describe("InlineTimeSelect", () => {
  it("does not commit or close until Confirm is pressed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithQuery(
      <InlineTimeSelect
        confirmToClose
        value="05:00"
        timeDisplayFormat="12h"
        aria-label="Checkin time"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /checkin time/i }));

    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("option", { name: "6" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "6" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "00" }));
    await user.click(screen.getByRole("option", { name: "30" }));

    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("06:30");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("commits 12h hour, minute, and period together on Confirm", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithQuery(
      <InlineTimeSelect
        confirmToClose
        value="05:00"
        timeDisplayFormat="12h"
        aria-label="Checkout time"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /checkout time/i }));

    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("option", { name: "7" }));
    await user.click(screen.getByRole("button", { name: "00" }));
    await user.click(screen.getByRole("option", { name: "15" }));
    await user.click(screen.getByRole("button", { name: "AM" }));
    await user.click(screen.getByRole("option", { name: "PM" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("19:15");
  });
});

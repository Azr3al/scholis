import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { updateEntity, invalidateQueries } = vi.hoisted(() => ({
  updateEntity: vi.fn(() => Promise.resolve({ data: { data: {} } })),
  invalidateQueries: vi.fn(),
}));

vi.mock("@/app/client-api/utils", () => ({
  updateEntity,
}));

vi.mock("@/lib/query", () => ({
  queryClient: { invalidateQueries },
}));

import { createPaymentMethodColumns } from "./payment-method-columns";
import type { PaymentMethod } from "@/sdk";

const method: PaymentMethod = {
  id: 7,
  name: "Daw Khin Hlaing (KPAY)",
  payment_bank: "KPAY",
  bank_account_number: "09782421927",
  is_retired: false,
};

afterEach(() => {
  cleanup();
  updateEntity.mockClear();
});

describe("createPaymentMethodColumns retire switch", () => {
  it("PUTs is_retired when the editor toggles Retired", async () => {
    const columns = createPaymentMethodColumns({ canEdit: true });
    const retired = columns.find((column) => column.id === "is_retired");
    expect(retired?.cell).toBeDefined();

    render(<>{retired!.cell!({ row: method, value: false })}</>);
    await userEvent.click(screen.getByRole("switch", { name: "Retired" }));

    await waitFor(() => {
      expect(updateEntity).toHaveBeenCalledWith("payment-methods", 7, {
        is_retired: true,
      });
    });
  });

  it("shows Yes/No for read-only viewers", () => {
    const columns = createPaymentMethodColumns({ canEdit: false });
    const retired = columns.find((column) => column.id === "is_retired");
    expect(retired?.accessor({ ...method, is_retired: true })).toBe("Yes");
    expect(retired?.accessor(method)).toBe("No");
  });
});

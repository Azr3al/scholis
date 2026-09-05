import { describe, expect, it } from "vitest";

import { createPaymentPlanColumns } from "@/app/(internal)/payment-plans/payment-plan-columns";
import { resolveColumnLayout } from "@/components/data-table/column-layout";

describe("createPaymentPlanColumns", () => {
  it("left-aligns editable money columns with tabular figures", () => {
    const columns = createPaymentPlanColumns({
      showLegacyDiscountFields: true,
      currencySymbol: "Ks",
    });

    for (const id of ["price", "per_hour_price"] as const) {
      const col = columns.find((column) => column.id === id);
      expect(col?.sizing).toBeDefined();

      const layout = resolveColumnLayout(col?.sizing);
      expect(layout.thClass).toContain("text-left");
      expect(layout.thClass).not.toContain("text-right");
      expect(layout.tdClass).toBe("tabular-nums");
    }
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceHomepageStatCards } from "./finance-homepage-stat-cards";

describe("FinanceHomepageStatCards labels", () => {
  it("labels the cash-basis card Cash received, not Collected", () => {
    cleanup();
    render(
      <FinanceHomepageStatCards
        summary={{
          collected_amount: "1",
          collected_count: 1,
          unpaid_amount: "1",
          unpaid_count: 1,
          comparison: null,
        }}
        currencySymbol="Ks"
      />,
    );
    expect(screen.getByText("Cash received")).toBeTruthy();
    expect(screen.queryByText("Collected")).toBeNull();
  });
});

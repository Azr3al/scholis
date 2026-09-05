import { describe, expect, it } from "vitest";

import { apiDataToPieChartData, getPieChartConfig } from "./charts";

describe("getPieChartConfig", () => {
  it("maps stable category keys to chart colors and keeps human labels separate", () => {
    const chartData = [
      {
        category: "42",
        label: "ACCA FM - 2026 Oct - 2027 Mar",
        amount: 100,
        count: 5,
      },
    ];

    const config = getPieChartConfig(chartData);

    expect(config["42"]).toEqual({
      label: "ACCA FM - 2026 Oct - 2027 Mar",
      color: "var(--chart-1)",
    });
  });
});

describe("apiDataToPieChartData", () => {
  it("does not set fill from category names with spaces", () => {
    const data = apiDataToPieChartData([
      ["ACCA FM - 2026 Oct - 2027 Mar", 12],
    ]);

    expect(data).toEqual([
      {
        category: "ACCA FM - 2026 Oct - 2027 Mar",
        count: 12,
      },
    ]);
    expect(data[0]).not.toHaveProperty("fill");
  });
});

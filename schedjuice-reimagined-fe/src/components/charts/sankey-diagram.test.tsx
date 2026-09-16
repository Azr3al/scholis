import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SankeyDiagram } from "./sankey-diagram";

const nodes = [
  { key: "collected", label: "Collected", amount: "100" },
  { key: "stuck", label: "Stuck", amount: "40" },
  {
    key: "not_yet_billed",
    label: "Not yet billed",
    amount: "20",
    isEstimated: true,
  },
];
const links = [{ source: "collected", target: "stuck", amount: "40" }];

describe("SankeyDiagram", () => {
  it("renders the empty state when there are no links", () => {
    cleanup();
    render(
      <SankeyDiagram
        nodes={[]}
        links={[]}
        formatAmount={(a) => a}
        nodeColor={() => "red"}
        emptyMessage="No billed fees for this period."
      />,
    );
    expect(screen.getByText("No billed fees for this period.")).toBeTruthy();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("marks estimated nodes with a hatch pattern and accessible name", () => {
    cleanup();
    render(
      <SankeyDiagram
        nodes={nodes}
        links={[
          {
            source: "collected",
            target: "not_yet_billed",
            amount: "20",
            isEstimated: true,
          },
        ]}
        formatAmount={(a) => a}
        nodeColor={(n) =>
          n.key === "stuck" ? "rgb(220, 38, 38)" : "rgb(5, 150, 105)"
        }
      />,
    );
    expect(document.querySelector("pattern#sankey-hatch")).toBeTruthy();
    const estimated = screen.getByLabelText(/not yet billed/i);
    expect(estimated.getAttribute("aria-label")).toMatch(/estimated/i);
  });

  it("does not give collected and stuck the same fill", () => {
    cleanup();
    const fills: Record<string, string> = {
      collected: "rgb(5, 150, 105)",
      stuck: "rgb(220, 38, 38)",
      not_yet_billed: "rgb(120, 113, 108)",
    };
    render(
      <SankeyDiagram
        nodes={nodes}
        links={links}
        formatAmount={(a) => a}
        nodeColor={(n) => fills[n.key]}
      />,
    );
    const collected = document.querySelector('[data-node-key="collected"]');
    const stuck = document.querySelector('[data-node-key="stuck"]');
    expect(collected).toBeTruthy();
    expect(stuck).toBeTruthy();
    expect(collected?.getAttribute("fill")).not.toBe(stuck?.getAttribute("fill"));
  });

  it("keeps early terminals in an earlier column than final outcomes", () => {
    cleanup();
    render(
      <SankeyDiagram
        nodes={[
          { key: "billed", label: "Billed", amount: "100" },
          { key: "net_invoiced", label: "Net invoiced", amount: "80" },
          { key: "discounts_given", label: "Discounts given", amount: "20" },
          { key: "collected", label: "Collected", amount: "80" },
          { key: "retained", label: "Retained", amount: "80" },
        ]}
        links={[
          { source: "billed", target: "discounts_given", amount: "20" },
          { source: "billed", target: "net_invoiced", amount: "80" },
          { source: "net_invoiced", target: "collected", amount: "80" },
          { source: "collected", target: "retained", amount: "80" },
        ]}
        formatAmount={(a) => a}
        nodeColor={() => "black"}
      />,
    );
    const discountX = Number(
      document
        .querySelector('[data-node-key="discounts_given"] rect')
        ?.getAttribute("x"),
    );
    const retainedX = Number(
      document.querySelector('[data-node-key="retained"] rect')?.getAttribute("x"),
    );
    expect(discountX).toBeGreaterThan(0);
    expect(discountX).toBeLessThan(retainedX);
  });

  it("strokes links at the layout width instead of filling a hairline", () => {
    cleanup();
    render(
      <SankeyDiagram
        nodes={nodes}
        links={links}
        formatAmount={(a) => a}
        nodeColor={() => "black"}
      />,
    );
    const linkPath = document.querySelector("svg path:not([fill='url(#sankey-hatch)'])");
    expect(linkPath).toBeTruthy();
    expect(linkPath?.getAttribute("fill")).toBe("none");
    expect(Number(linkPath?.getAttribute("stroke-width"))).toBeGreaterThan(1);
  });

  it("prints amounts on thick links and skips hairlines", () => {
    cleanup();
    render(
      <SankeyDiagram
        nodes={[
          { key: "billed", label: "Billed", amount: "100000" },
          { key: "net_invoiced", label: "Net invoiced", amount: "99900" },
          { key: "discounts_given", label: "Discounts given", amount: "100" },
          { key: "collected", label: "Collected", amount: "99900" },
          { key: "retained", label: "Retained", amount: "99900" },
        ]}
        links={[
          { source: "billed", target: "discounts_given", amount: "100" },
          { source: "billed", target: "net_invoiced", amount: "99900" },
          { source: "net_invoiced", target: "collected", amount: "99900" },
          { source: "collected", target: "retained", amount: "99900" },
        ]}
        formatAmount={(a) => `amt:${a}`}
        nodeColor={() => "black"}
      />,
    );
    expect(screen.getAllByText("amt:99900").length).toBeGreaterThan(0);
    expect(screen.queryByText("amt:100")).toBeNull();
  });
});

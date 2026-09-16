import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";
import { TransactionScreenshotStrategy } from "@/types/organization";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/sound/click-sound", () => ({
  playClick: vi.fn(),
}));

vi.mock("motion/react", () => {
  const passthrough = (tag: "aside" | "div" | "nav") => {
    function MotionPassthrough({
      children,
      ...rest
    }: {
      children?: ReactNode;
    }) {
      return React.createElement(tag, rest, children);
    }
    MotionPassthrough.displayName = `motion.${tag}`;
    return MotionPassthrough;
  };
  return {
    motion: {
      aside: passthrough("aside"),
      div: passthrough("div"),
      nav: passthrough("nav"),
    },
  };
});

import { FinanceSectionRail } from "./finance-section-rail";

const tenant = {
  transaction_screenshot_strategy: TransactionScreenshotStrategy.admin_upload,
  is_payroll_calculation_enabled: true,
  is_microsoft_on: false,
} as organizationType;

const user = {
  roles: [{ permissions: [{ code: "payment.view_all" }] }],
} as unknown as accountType;

afterEach(() => {
  cleanup();
});

describe("FinanceSectionRail", () => {
  it("shows Home on the finance overview, not Overview as back", () => {
    render(
      <FinanceSectionRail
        pathname="/finances"
        user={user}
        tenant={tenant}
        canAny={(codes) => codes.includes("payment.view_all")}
      />,
    );

    const home = screen.getByRole("link", { name: "Home" });
    expect(home.getAttribute("href")).toBe("/");
    expect(screen.getByText("Finance")).toBeTruthy();
  });
});

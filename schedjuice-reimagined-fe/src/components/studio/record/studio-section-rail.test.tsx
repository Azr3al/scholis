import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";

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

import { StudioSectionRail } from "./studio-section-rail";

afterEach(() => {
  cleanup();
});

describe("StudioSectionRail", () => {
  it("shows Home on the studio library, not Documents", () => {
    render(
      <StudioSectionRail
        pathname="/studio"
        canDocuments={true}
        canAwards={true}
      />,
    );

    const home = screen.getByRole("link", { name: "Home" });
    expect(home.getAttribute("href")).toBe("/");
    expect(screen.getByText("Studio")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Documents" })).toBeTruthy();
  });

  it("lists Documents and Award titles on /award-titles when both flags are true", () => {
    render(
      <StudioSectionRail
        pathname="/award-titles"
        canDocuments={true}
        canAwards={true}
      />,
    );
    expect(screen.getByRole("link", { name: "Documents" }).getAttribute("href")).toBe(
      "/studio",
    );
    expect(
      screen.getByRole("link", { name: "Award titles" }).getAttribute("href"),
    ).toBe("/award-titles");
  });

  it("omits Documents when canDocuments is false", () => {
    render(
      <StudioSectionRail
        pathname="/award-titles"
        canDocuments={false}
        canAwards={true}
      />,
    );
    expect(screen.queryByRole("link", { name: "Documents" })).toBeNull();
    expect(screen.getByRole("link", { name: "Award titles" })).toBeTruthy();
  });
});

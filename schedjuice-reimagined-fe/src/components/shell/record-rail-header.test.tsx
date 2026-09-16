import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SCHOOL_HOME } from "@/config/school-home";
import { RecordRailHeader } from "./record-rail-header";

afterEach(() => {
  cleanup();
});

describe("RecordRailHeader", () => {
  it("renders a Home link to / and identity children after it", () => {
    render(
      <RecordRailHeader parent={SCHOOL_HOME}>
        <p>Studio</p>
      </RecordRailHeader>,
    );

    const home = screen.getByRole("link", { name: "Home" });
    expect(home.getAttribute("href")).toBe("/");
    expect(home.compareDocumentPosition(screen.getByText("Studio"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { organizationType } from "@/types/organization";

const ORG_NAME = "North Star Academy";
let header: { breadcrumb?: ReactNode } = {};

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

vi.mock("@/components/shell/use-page-header", () => ({
  usePageHeader: (config: { breadcrumb?: ReactNode }) => {
    header = config;
  },
}));

import { useOrgRecordPageHeader } from "./use-org-record-page-header";

function Probe() {
  useOrgRecordPageHeader({
    org: { name: ORG_NAME } as organizationType,
    mode: "tenant",
    section: "overview",
  });
  return <>{header.breadcrumb}</>;
}

afterEach(() => {
  cleanup();
  header = {};
});

describe("useOrgRecordPageHeader", () => {
  it("shows School settings / Overview without the org name", () => {
    render(<Probe />);

    const parent = screen.getByRole("link", { name: "School settings" });
    expect(parent.getAttribute("href")).toBe("/organizations/profile");
    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.queryByText(ORG_NAME)).toBeNull();
  });
});

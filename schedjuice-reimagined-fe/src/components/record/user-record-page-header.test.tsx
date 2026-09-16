import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { RecordSectionId } from "@/components/record/record-sections";

let section: RecordSectionId = "overview";
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

import { UserRecordPageHeader } from "./user-record-page-header";

function Probe() {
  return <UserRecordPageHeader section={section} />;
}

afterEach(() => {
  cleanup();
  section = "overview";
  header = {};
});

describe("UserRecordPageHeader", () => {
  it("shows Users / Overview without a person name", () => {
    render(<Probe />);
    const crumb = header.breadcrumb;
    cleanup();
    render(<>{crumb}</>);

    const users = screen.getByRole("link", { name: "Users" });
    expect(users.getAttribute("href")).toBe("/users");
    expect(screen.getByText("Overview")).toBeTruthy();
  });
});

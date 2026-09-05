import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InternalAppShell } from "./internal-app-shell";

const mockPathname = vi.fn(() => "/internal/organizations");

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

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/layout/fullscreen-provider", () => ({
  FullscreenProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/shell/internal-sidebar-nav", () => ({
  InternalSidebarNav: () => <nav aria-label="Internal tools">Nav</nav>,
}));

vi.mock("@/components/internal/internal-tenant-picker", () => ({
  InternalTenantPicker: ({ variant }: { variant?: string }) => (
    <div data-testid="tenant-picker" data-variant={variant ?? "default"} />
  ),
}));

vi.mock("@/components/shell/panel-header", () => ({
  PanelHeader: ({
    beforeUtilities,
  }: {
    beforeUtilities?: React.ReactNode;
  }) => <header>{beforeUtilities}</header>,
}));

describe("InternalAppShell", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/internal/organizations");
  });

  afterEach(() => {
    cleanup();
  });

  it("shows header tenant picker on org record paths", () => {
    mockPathname.mockReturnValue("/internal/organizations/9");
    render(
      <InternalAppShell>
        <p>record</p>
      </InternalAppShell>,
    );

    const picker = screen.getByTestId("tenant-picker");
    expect(picker).toBeTruthy();
    expect(picker.getAttribute("data-variant")).toBe("header");
  });

  it("shows header tenant picker on nested org record paths", () => {
    mockPathname.mockReturnValue("/internal/organizations/9/admins/create");
    render(
      <InternalAppShell>
        <p>nested</p>
      </InternalAppShell>,
    );

    expect(screen.getByTestId("tenant-picker")).toBeTruthy();
  });

  it("shows header tenant picker on query tenant-scoped routes", () => {
    mockPathname.mockReturnValue("/internal/billing");
    render(
      <InternalAppShell>
        <p>billing</p>
      </InternalAppShell>,
    );

    expect(screen.getByTestId("tenant-picker")).toBeTruthy();
  });

  it("hides header tenant picker on org list", () => {
    mockPathname.mockReturnValue("/internal/organizations");
    render(
      <InternalAppShell>
        <p>orgs</p>
      </InternalAppShell>,
    );

    expect(screen.queryByTestId("tenant-picker")).toBeNull();
  });

  it("hides header tenant picker on org create", () => {
    mockPathname.mockReturnValue("/internal/organizations/create");
    render(
      <InternalAppShell>
        <p>create</p>
      </InternalAppShell>,
    );

    expect(screen.queryByTestId("tenant-picker")).toBeNull();
  });
});

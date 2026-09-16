import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequireInternalTenant } from "./require-internal-tenant";

const mockUseInternalTenant = vi.fn();

afterEach(() => {
  cleanup();
  mockUseInternalTenant.mockReset();
});

vi.mock("@/hooks/useInternalTenant", () => ({
  useInternalTenant: () => mockUseInternalTenant(),
}));

describe("RequireInternalTenant", () => {
  it("shows empty state when organizationId is null even with truthy tenantId", () => {
    mockUseInternalTenant.mockReturnValue({
      tenantId: "abc",
      organizationId: null,
      setTenantId: vi.fn(),
    });

    render(
      <RequireInternalTenant>
        <div data-testid="scoped-content">Scoped</div>
      </RequireInternalTenant>,
    );

    expect(screen.getByText("Select a tenant")).toBeTruthy();
    expect(
      screen.getByText("Use the tenant control in the header."),
    ).toBeTruthy();
    expect(screen.queryByTestId("scoped-content")).toBeNull();
  });

  it("renders children when organizationId is set", () => {
    mockUseInternalTenant.mockReturnValue({
      tenantId: "42",
      organizationId: 42,
      setTenantId: vi.fn(),
    });

    render(
      <RequireInternalTenant>
        <div data-testid="scoped-content">Scoped</div>
      </RequireInternalTenant>,
    );

    expect(screen.getByTestId("scoped-content")).toBeTruthy();
    expect(screen.queryByText("Select a tenant")).toBeNull();
  });

  it("clears invalid tenantId from the query string", () => {
    const setTenantId = vi.fn();
    mockUseInternalTenant.mockReturnValue({
      tenantId: "abc",
      organizationId: null,
      setTenantId,
    });

    render(
      <RequireInternalTenant>
        <div>Scoped</div>
      </RequireInternalTenant>,
    );

    expect(setTenantId).toHaveBeenCalledWith(null);
  });
});

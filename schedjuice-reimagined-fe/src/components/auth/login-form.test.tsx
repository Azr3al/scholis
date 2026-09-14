import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mockPush = vi.fn();
const mockReplace = vi.fn();

const mockRetryTenant = vi.fn();

const tenantHook = {
  tenant: null as { id?: number; name?: string; domain_url?: string } | null,
  isLoading: true,
  isFetching: true,
  isError: false,
  isTenantMissing: false,
  retryTenant: mockRetryTenant,
  refetchTenant: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt?: string; src?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} src={typeof src === "string" ? src : ""} />
  ),
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => tenantHook,
}));

vi.mock("@/app/client-api/auth", () => ({
  completeMicrosoftRedirectLogin: vi.fn(async () => false),
  exchangeGoogleHandoff: vi.fn(),
  isMicrosoftLoginFailure: () => false,
  login: vi.fn(),
  loginWithTelegram: vi.fn(),
}));

vi.mock("@/components/primitives", async () => {
  const actual = await vi.importActual<typeof import("@/components/primitives")>(
    "@/components/primitives",
  );
  return {
    ...actual,
    useToast: () => ({ add: vi.fn() }),
    ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

import LoginForm from "./login-form";

describe("LoginForm missing tenant", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRetryTenant.mockReset();
    tenantHook.tenant = null;
    tenantHook.isLoading = true;
    tenantHook.isFetching = true;
    tenantHook.isError = false;
    tenantHook.isTenantMissing = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("does not crash or redirect to /notfound while the public tenant query is in flight", () => {
    render(<LoginForm />);

    expect(screen.getByTestId("login-tenant-loading")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("redirects to /notfound only when the backend says the host has no tenant", () => {
    tenantHook.isLoading = false;
    tenantHook.isFetching = false;
    tenantHook.isError = true;
    tenantHook.isTenantMissing = true;

    render(<LoginForm />);

    expect(mockPush).toHaveBeenCalledWith("/notfound?error=tenant");
  });

  it("offers a retry instead of /notfound when the tenant lookup fails transiently", async () => {
    tenantHook.isLoading = false;
    tenantHook.isFetching = false;
    tenantHook.isError = true;
    tenantHook.isTenantMissing = false;

    render(<LoginForm />);

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("login-tenant-error")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(mockRetryTenant).toHaveBeenCalled();
  });
});

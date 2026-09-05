import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCookie = vi.fn();
const setCookie = vi.fn();
const axiosGet = vi.fn();

vi.mock("cookies-next", () => ({
  getCookie: (...args: unknown[]) => getCookie(...args),
  setCookie: (...args: unknown[]) => setCookie(...args),
}));

vi.mock("@/lib/api", () => ({
  axiosClient: {
    get: (...args: unknown[]) => axiosGet(...args),
  },
}));

import {
  revalidateTenantCookieIfNeeded,
  useTenant,
} from "@/hooks/useTenant";

const slimCookieTenant = {
  id: 26,
  name: "Learn with Tr Phillips",
  domain_url: "trphillips.schedjuice.com",
  is_admin: false,
  is_demo: false,
  is_homepage_disabled: false,
  is_library_disabled: true,
  is_microsoft_on: false,
  schema_name: "xtrphillipsschedjuicecom",
};

const msCookieMissingIds = {
  id: 3,
  name: "Teacher Su Intl School",
  domain_url: "suconnect.teachersucenter.com",
  is_admin: true,
  is_demo: false,
  is_homepage_disabled: false,
  is_library_disabled: true,
  is_microsoft_on: true,
  schema_name: "xteachersu",
};

const fullPublicOrg = {
  ...slimCookieTenant,
  is_payroll_calculation_enabled: true,
  currency_symbol: "Ks",
};

const fullMsPublicOrg = {
  ...msCookieMissingIds,
  app_id: "11111111-1111-1111-1111-111111111111",
  authority: "https://login.microsoftonline.com/teachersu.onmicrosoft.com",
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useTenant", () => {
  beforeEach(() => {
    getCookie.mockReset();
    setCookie.mockReset();
    axiosGet.mockReset();
    getCookie.mockReturnValue(JSON.stringify(slimCookieTenant));
    axiosGet.mockResolvedValue({ data: { data: fullPublicOrg } });
  });

  it("fetches organizations/public even when a slim tenant cookie exists", async () => {
    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    expect(result.current.tenant?.id).toBe(26);
    expect(result.current.tenant?.is_payroll_calculation_enabled).toBeFalsy();
    expect(result.current.isFetching).toBe(true);

    await waitFor(() => {
      expect(axiosGet).toHaveBeenCalledWith("organizations/public");
      expect(result.current.tenant?.is_payroll_calculation_enabled).toBe(true);
      expect(result.current.isFetching).toBe(false);
    });
  });

  it("rewrites the tenant cookie with MSAL fields when Microsoft is on but ids are missing", async () => {
    getCookie.mockReturnValue(JSON.stringify(msCookieMissingIds));
    axiosGet.mockResolvedValue({ data: { data: fullMsPublicOrg } });

    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.tenant?.app_id).toBe(fullMsPublicOrg.app_id);
      expect(result.current.tenant?.authority).toBe(fullMsPublicOrg.authority);
    });

    const tenantCookieWrite = setCookie.mock.calls.find(
      (call) => call[0] === "tenant",
    );
    expect(tenantCookieWrite).toBeTruthy();
    const written = JSON.parse(String(tenantCookieWrite![1]));
    expect(written.app_id).toBe(fullMsPublicOrg.app_id);
    expect(written.authority).toBe(fullMsPublicOrg.authority);
    expect(written.is_microsoft_on).toBe(true);
  });
});

describe("revalidateTenantCookieIfNeeded", () => {
  beforeEach(() => {
    getCookie.mockReset();
    setCookie.mockReset();
    axiosGet.mockReset();
  });

  it("skips network when cookie already has MS login fields", async () => {
    getCookie.mockReturnValue(
      JSON.stringify({
        ...msCookieMissingIds,
        app_id: fullMsPublicOrg.app_id,
        authority: fullMsPublicOrg.authority,
      }),
    );

    const result = await revalidateTenantCookieIfNeeded();
    expect(axiosGet).not.toHaveBeenCalled();
    expect(result?.app_id).toBe(fullMsPublicOrg.app_id);
  });

  it("refetches and rewrites when MS fields are missing", async () => {
    getCookie.mockReturnValue(JSON.stringify(msCookieMissingIds));
    axiosGet.mockResolvedValue({ data: { data: fullMsPublicOrg } });

    const result = await revalidateTenantCookieIfNeeded();
    expect(axiosGet).toHaveBeenCalledWith("organizations/public");
    expect(result?.app_id).toBe(fullMsPublicOrg.app_id);
    expect(setCookie).toHaveBeenCalled();
  });
});

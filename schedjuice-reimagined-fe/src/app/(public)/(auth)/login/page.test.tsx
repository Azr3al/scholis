import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { organizationType } from "@/types/organization";

const getTenantOnServer = vi.fn(async () => ({
  tenant: undefined as organizationType | undefined,
}));

vi.mock("@/helpers/tenant", () => ({
  getTenantOnServer: () => getTenantOnServer(),
}));

vi.mock("@/components/auth/login-form", () => ({
  default: ({ tenant }: { tenant?: organizationType }) => (
    <div data-testid="login-form" data-seeded={tenant ? "yes" : "no"} />
  ),
}));

import LoginPage from "./page";

describe("login page SSR tenant", () => {
  beforeEach(() => {
    getTenantOnServer.mockReset().mockResolvedValue({ tenant: undefined });
  });

  afterEach(() => {
    cleanup();
  });

  it("still renders the form when the server-side tenant lookup fails", async () => {
    render(await LoginPage());

    const form = screen.getByTestId("login-form");
    expect(form.getAttribute("data-seeded")).toBe("no");
  });

  it("seeds the form with the server-resolved tenant when it is available", async () => {
    getTenantOnServer.mockResolvedValue({
      tenant: { id: 26, name: "Learn with Tr Phillips" } as organizationType,
    });

    render(await LoginPage());

    expect(screen.getByTestId("login-form").getAttribute("data-seeded")).toBe(
      "yes",
    );
  });
});

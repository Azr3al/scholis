import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { unwrapAuthTokenPayload } from "@/helpers/auth-session";

describe("unwrapAuthTokenPayload", () => {
  it("reads nested data.access", () => {
    expect(
      unwrapAuthTokenPayload({
        isError: false,
        message: "success",
        data: {
          access: "nested-access",
          refresh: "nested-refresh",
          session_id: "session-1",
        },
      }),
    ).toEqual({
      access: "nested-access",
      refresh: "nested-refresh",
      session_id: "session-1",
    });
  });

  it("reads flat access at top level", () => {
    expect(
      unwrapAuthTokenPayload({
        isError: false,
        message: "success",
        access: "flat-access",
        refresh: "flat-refresh",
        session_id: "session-2",
      }),
    ).toEqual({
      access: "flat-access",
      refresh: "flat-refresh",
      session_id: "session-2",
    });
  });

  it("returns null when isError is true", () => {
    expect(unwrapAuthTokenPayload({ isError: true, message: "invalid_refresh" })).toBeNull();
  });
});

describe("redirectToLoginIfNeeded", () => {
  let redirectToLoginIfNeeded: () => void;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_BASE_API_URL = "http://localhost:8000/api/v1";
    ({ redirectToLoginIfNeeded } = await import("@/lib/api"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not navigate when already on /login", () => {
    let href = "/login";
    vi.stubGlobal("window", {
      location: {
        pathname: "/login",
        get href() {
          return href;
        },
        set href(value: string) {
          href = value;
        },
      },
    });

    redirectToLoginIfNeeded();

    expect(href).toBe("/login");
  });

  it("does not navigate when already on /register", () => {
    let href = "/register";
    vi.stubGlobal("window", {
      location: {
        pathname: "/register",
        get href() {
          return href;
        },
        set href(value: string) {
          href = value;
        },
      },
    });

    redirectToLoginIfNeeded();

    expect(href).toBe("/register");
  });

  it("does not navigate when on public booking page", () => {
    let href = "/book-consultation/c_abc12345";
    vi.stubGlobal("window", {
      location: {
        pathname: "/book-consultation/c_abc12345",
        get href() {
          return href;
        },
        set href(value: string) {
          href = value;
        },
      },
    });

    redirectToLoginIfNeeded();

    expect(href).toBe("/book-consultation/c_abc12345");
  });

  it("navigates to /login from protected routes", () => {
    let href = "/home";
    vi.stubGlobal("window", {
      location: {
        pathname: "/home",
        get href() {
          return href;
        },
        set href(value: string) {
          href = value;
        },
      },
    });

    redirectToLoginIfNeeded();

    expect(href).toBe("/login");
  });
});

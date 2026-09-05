import { afterEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";

import {
  capturePageview,
  initPostHog,
  normalizePath,
  shouldTrackPage,
} from "./posthog";

vi.mock("posthog-js", () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    __loaded: false,
  },
}));

type MockPostHog = {
  init: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
  __loaded?: boolean;
};

const mockPostHog = posthog as unknown as MockPostHog;

afterEach(() => {
  mockPostHog.__loaded = false;
  mockPostHog.init.mockReset();
  mockPostHog.capture.mockReset();
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
});

describe("normalizePath", () => {
  it("replaces numeric segments with :id", () => {
    expect(normalizePath("/courses/42/attendance/marking/3")).toBe(
      "/courses/:id/attendance/marking/:id",
    );
  });

  it("replaces uuid segments with :id", () => {
    expect(
      normalizePath("/courses/550e8400-e29b-41d4-a716-446655440000/attendance"),
    ).toBe("/courses/:id/attendance");
  });

});

describe("shouldTrackPage", () => {

  it("excludes internal and auth public routes", () => {
    expect(shouldTrackPage("/internal/cron-jobs")).toBe(false);
    expect(shouldTrackPage("/components/type")).toBe(false);
    expect(shouldTrackPage("/login")).toBe(false);
    expect(shouldTrackPage("/register")).toBe(false);
    expect(shouldTrackPage("/verify/token")).toBe(false);
    expect(shouldTrackPage("/join-course/abc")).toBe(false);
  });
});

describe("initPostHog", () => {
  it("returns null and does not initialize without key and host", () => {
    expect(initPostHog()).toBeNull();
    expect(mockPostHog.init).not.toHaveBeenCalled();
  });

  it("initializes posthog when key and host exist", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";

    expect(initPostHog()).toBe(posthog);
    expect(mockPostHog.init).toHaveBeenCalledTimes(1);
    expect(mockPostHog.init).toHaveBeenCalledWith("phc_test", {
      api_host: "https://us.i.posthog.com",
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: "localStorage+cookie",
    });
  });

  it("returns existing client when already loaded", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
    mockPostHog.__loaded = true;

    expect(initPostHog()).toBe(posthog);
    expect(mockPostHog.init).not.toHaveBeenCalled();
  });
});

describe("capturePageview", () => {
  it("does not capture for excluded routes", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";

    capturePageview("/internal/cron-jobs", { role_bucket: "superadmin" });
    expect(mockPostHog.capture).not.toHaveBeenCalled();
  });

  it("captures normalized pageview for included routes", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";

    capturePageview("/courses/42/attendance", {
      role_bucket: "admin",
      tenant_schema: "acme",
    });

    expect(mockPostHog.capture).toHaveBeenCalledWith("$pageview", {
      normalized_path: "/courses/:id/attendance",
      role_bucket: "admin",
      tenant_schema: "acme",
    });
  });
});

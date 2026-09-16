// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isTelegramWebDeepLink,
  openTelegramDeepLink,
} from "@/lib/linking/open-telegram-deep-link";

describe("isTelegramWebDeepLink", () => {
  it("accepts https t.me links with a start payload", () => {
    expect(
      isTelegramWebDeepLink("https://t.me/schoolbot?start=abc123"),
    ).toBe(true);
  });

  it("rejects http, missing bot, and missing start", () => {
    expect(isTelegramWebDeepLink("http://t.me/schoolbot?start=abc")).toBe(
      false,
    );
    expect(isTelegramWebDeepLink("https://t.me/?start=abc")).toBe(false);
    expect(isTelegramWebDeepLink("https://t.me/schoolbot")).toBe(false);
    expect(isTelegramWebDeepLink("https://example.com/bot?start=abc")).toBe(
      false,
    );
    expect(isTelegramWebDeepLink("not-a-url")).toBe(false);
  });
});

describe("openTelegramDeepLink", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses window.open on desktop handoff", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const hrefSpy = vi.spyOn(window.location, "href", "set");

    openTelegramDeepLink("https://t.me/schoolbot?start=token123");

    expect(openSpy).toHaveBeenCalledWith(
      "https://t.me/schoolbot?start=token123",
      "_blank",
      "noopener,noreferrer",
    );
    expect(hrefSpy).not.toHaveBeenCalled();
  });

  it("uses same-tab navigation when preferAppHandoff is true", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const hrefSpy = vi.spyOn(window.location, "href", "set");

    openTelegramDeepLink("https://t.me/schoolbot?start=token123", {
      preferAppHandoff: true,
    });

    expect(hrefSpy).toHaveBeenCalled();
    expect(window.location.href).toBe("https://t.me/schoolbot?start=token123");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("no-ops for invalid deep links", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const hrefSpy = vi.spyOn(window.location, "href", "set");

    openTelegramDeepLink("https://example.com/not-telegram");

    expect(openSpy).not.toHaveBeenCalled();
    expect(hrefSpy).not.toHaveBeenCalled();
  });
});

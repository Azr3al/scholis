import { describe, expect, it } from "vitest";

import { composeGreeting, greetingFor } from "./compose-greeting";

describe("greetingFor", () => {
  it("reads the hour in the tenant timezone, not the runtime one", () => {
    const lateUtcNight = new Date("2026-05-29T23:00:00Z");
    expect(greetingFor(lateUtcNight, "Asia/Yangon")).toBe("Good morning");
    expect(greetingFor(lateUtcNight, "UTC")).toBe("Good evening");
  });

  it("switches at noon and at 17:00", () => {
    expect(greetingFor(new Date("2026-05-29T11:59:00Z"), "UTC")).toBe(
      "Good morning",
    );
    expect(greetingFor(new Date("2026-05-29T12:00:00Z"), "UTC")).toBe(
      "Good afternoon",
    );
    expect(greetingFor(new Date("2026-05-29T17:00:00Z"), "UTC")).toBe(
      "Good evening",
    );
  });

  it("falls back to local time on an invalid timezone instead of throwing", () => {
    expect(() =>
      greetingFor(new Date("2026-05-29T09:00:00Z"), "Not/AZone"),
    ).not.toThrow();
  });
});

describe("composeGreeting", () => {
  it("drops the comma clause when the profile has no name", () => {
    const morning = new Date("2026-05-29T02:00:00Z");
    expect(composeGreeting("   ", morning, "UTC")).toBe("Good morning");
    expect(composeGreeting(undefined, morning, "UTC")).toBe("Good morning");
  });

  it("uses only the first token so the display line stays short", () => {
    expect(
      composeGreeting("Thiha Zaw Win", new Date("2026-05-29T02:00:00Z"), "UTC"),
    ).toBe("Good morning, Thiha");
  });
});

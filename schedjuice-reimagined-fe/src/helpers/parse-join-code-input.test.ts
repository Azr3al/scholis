import { describe, expect, it } from "vitest";
import { parseJoinCodeFromUserInput } from "./parse-join-code-input";

describe("parseJoinCodeFromUserInput", () => {
  it("returns null for empty or whitespace-only input", () => {
    expect(parseJoinCodeFromUserInput("")).toBeNull();
    expect(parseJoinCodeFromUserInput("   ")).toBeNull();
  });

  it("returns trimmed string as literal code when not a join URL path", () => {
    expect(parseJoinCodeFromUserInput("  ABC123  ")).toBe("ABC123");
    expect(parseJoinCodeFromUserInput("plain-code")).toBe("plain-code");
  });

  it("extracts code from path join/segment with leading slashes", () => {
    expect(parseJoinCodeFromUserInput("/join/HELLO")).toBe("HELLO");
    expect(parseJoinCodeFromUserInput("join/WORLD")).toBe("WORLD");
  });

  it("extracts code from web join-course path", () => {
    expect(parseJoinCodeFromUserInput("/join-course/ABC123")).toBe("ABC123");
    expect(parseJoinCodeFromUserInput("join-course/WORLD")).toBe("WORLD");
    expect(
      parseJoinCodeFromUserInput("https://example.com/join-course/CODE123"),
    ).toBe("CODE123");
  });

  it("decodes percent-encoding in the segment like deep links", () => {
    expect(parseJoinCodeFromUserInput("join%2Ftest")).toBe("join%2Ftest");
    expect(parseJoinCodeFromUserInput("/join/hello%20there")).toBe(
      "hello there",
    );
  });

  it("parses full URLs with join path", () => {
    expect(parseJoinCodeFromUserInput("https://example.com/join/CODE123")).toBe(
      "CODE123",
    );
  });

  it("returns full trimmed string when URL has no join path (per spec)", () => {
    expect(parseJoinCodeFromUserInput("https://example.com/other")).toBe(
      "https://example.com/other",
    );
  });

  it("returns null when join/ has empty segment", () => {
    expect(parseJoinCodeFromUserInput("join/")).toBeNull();
    expect(parseJoinCodeFromUserInput("/join/")).toBeNull();
    expect(parseJoinCodeFromUserInput("https://example.com/join/")).toBeNull();
  });
});

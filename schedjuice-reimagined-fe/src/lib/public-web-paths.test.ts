import { describe, expect, it } from "vitest";
import {
  isPublicApiUrl,
  isPublicWebPath,
  toAbsoluteWebUrl,
} from "@/lib/public-web-paths";

describe("isPublicWebPath", () => {
  it("matches consultation booking routes", () => {
    expect(isPublicWebPath("/book-consultation/c_abc12345")).toBe(true);
    expect(isPublicWebPath("/book-consultation/booking")).toBe(true);
    expect(isPublicWebPath("/book-consultation/cancel")).toBe(true);
  });

  it("does not match internal routes", () => {
    expect(isPublicWebPath("/home")).toBe(false);
    expect(isPublicWebPath("/users/1")).toBe(false);
  });
});

describe("toAbsoluteWebUrl", () => {
  it("prefixes relative paths with origin", () => {
    expect(
      toAbsoluteWebUrl("/book-consultation/c_abc12345", "https://school.example.com"),
    ).toBe("https://school.example.com/book-consultation/c_abc12345");
  });

  it("leaves absolute URLs unchanged", () => {
    expect(
      toAbsoluteWebUrl(
        "https://app.example.com/book-consultation/c_abc12345",
        "https://school.example.com",
      ),
    ).toBe("https://app.example.com/book-consultation/c_abc12345");
  });

  it("returns empty string for empty input", () => {
    expect(toAbsoluteWebUrl("", "https://school.example.com")).toBe("");
  });
});

describe("isPublicApiUrl", () => {
  it("matches consultation public endpoints", () => {
    expect(isPublicApiUrl("consultation/public/c_abc/config")).toBe(true);
    expect(isPublicApiUrl("consultation/public/c_abc/bookings")).toBe(true);
  });
});

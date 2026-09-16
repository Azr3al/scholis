import { describe, expect, it } from "vitest";
import {
  isAllowedImageHost,
  isAllowedImageUrl,
  toAbsoluteImageUrl,
} from "./image-proxy";

describe("isAllowedImageHost", () => {
  it("allows regional DO Spaces path-style host", () => {
    expect(isAllowedImageHost("sgp1.digitaloceanspaces.com")).toBe(true);
  });

  it("rejects unknown hosts", () => {
    expect(isAllowedImageHost("evil.example.com")).toBe(false);
  });
});

describe("isAllowedImageUrl", () => {
  it("rejects non-http protocols", () => {
    expect(isAllowedImageUrl("ftp://schedjuice-dev.sgp1.digitaloceanspaces.com/x")).toBe(
      false,
    );
  });
});

describe("toAbsoluteImageUrl", () => {

  it("passes through absolute URLs", () => {
    expect(
      toAbsoluteImageUrl("https://example.com/logo.png", "http://localhost:3000"),
    ).toBe("https://example.com/logo.png");
  });
});

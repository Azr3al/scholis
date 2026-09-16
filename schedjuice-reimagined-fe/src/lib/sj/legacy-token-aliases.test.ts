// src/lib/sj/legacy-token-aliases.test.ts
import { describe, expect, it } from "vitest";
import {
  LEGACY_TOKEN_ALIASES,
  LEGACY_TOKEN_CLASS_PATTERN,
  isLegacyTokenClass,
} from "./legacy-token-aliases";

describe("LEGACY_TOKEN_ALIASES", () => {
  it("excludes canonical DESIGN.md tokens (identity mappings)", () => {
    expect(LEGACY_TOKEN_ALIASES).not.toHaveProperty("border-border");
    expect(LEGACY_TOKEN_ALIASES).not.toHaveProperty("ring-ring");
    expect(LEGACY_TOKEN_ALIASES).not.toHaveProperty("bg-accent");
    expect(LEGACY_TOKEN_ALIASES).not.toHaveProperty("text-accent-foreground");
  });
});

describe("isLegacyTokenClass", () => {
  it("detects legacy token utilities", () => {
    expect(isLegacyTokenClass("text-muted-foreground")).toBe(true);
    expect(isLegacyTokenClass("bg-surface")).toBe(false);
  });

  it("does not treat canonical DESIGN.md tokens as legacy", () => {
    expect(isLegacyTokenClass("border-border")).toBe(false);
    expect(isLegacyTokenClass("bg-accent")).toBe(false);
    expect(isLegacyTokenClass("text-accent-foreground")).toBe(false);
    expect(isLegacyTokenClass("ring-ring")).toBe(false);
  });
});

describe("LEGACY_TOKEN_CLASS_PATTERN", () => {
  it("matches shadcn legacy classes for the static gate", () => {
    expect(LEGACY_TOKEN_CLASS_PATTERN.test("foo text-muted-foreground bar")).toBe(true);
    expect(LEGACY_TOKEN_CLASS_PATTERN.test("bg-card")).toBe(true);
  });

  it("does not match canonical DESIGN.md token classes", () => {
    expect(LEGACY_TOKEN_CLASS_PATTERN.test("border border-border")).toBe(false);
    expect(LEGACY_TOKEN_CLASS_PATTERN.test("bg-accent")).toBe(false);
    expect(LEGACY_TOKEN_CLASS_PATTERN.test("text-accent-foreground")).toBe(false);
    expect(LEGACY_TOKEN_CLASS_PATTERN.test("focus-visible:ring-ring")).toBe(false);
  });
});

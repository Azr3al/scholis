import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REMEMBERED_IMPORTS_KEY,
  REMEMBERED_IMPORTS_MAX,
  clearRememberedImportFieldDefaults,
  computeHeaderSignature,
  findRememberedImport,
  loadRememberedImports,
  saveRememberedImport,
  type RememberedImport,
} from "./remembered-imports";

function makeEntry(
  signature: string,
  overrides: Partial<RememberedImport> = {},
): RememberedImport {
  return {
    signature,
    role: "student",
    mapping: { 0: "email" },
    fieldDefaults: {},
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("computeHeaderSignature", () => {
  it("normalizes whitespace and case", () => {
    expect(computeHeaderSignature([" Email ", "Full Name"])).toBe(
      computeHeaderSignature(["email", "full name"]),
    );
  });

  it("is order-sensitive", () => {
    const a = computeHeaderSignature(["email", "name"]);
    const b = computeHeaderSignature(["name", "email"]);
    expect(a).not.toBe(b);
  });
});

describe("remembered imports storage", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when no match exists", () => {
    expect(findRememberedImport(["email", "name"])).toBeNull();
  });

  it("finds a saved entry by header signature", () => {
    const headers = ["Email", "Name"];
    saveRememberedImport({
      signature: computeHeaderSignature(headers),
      role: "teacher",
      mapping: { 0: "email", 1: "name" },
      fieldDefaults: { phone_number: "000" },
    });

    const found = findRememberedImport(headers);
    expect(found?.role).toBe("teacher");
    expect(found?.mapping).toEqual({ 0: "email", 1: "name" });
    expect(found?.fieldDefaults).toEqual({ phone_number: "000" });
  });

  it("move-to-front on save and caps at 20 entries", () => {
    for (let i = 0; i < REMEMBERED_IMPORTS_MAX + 5; i++) {
      saveRememberedImport({
        signature: `sig-${i}`,
        role: "student",
        mapping: {},
        fieldDefaults: {},
      });
    }

    const loaded = loadRememberedImports();
    expect(loaded).toHaveLength(REMEMBERED_IMPORTS_MAX);
    expect(loaded[0]?.signature).toBe(`sig-${REMEMBERED_IMPORTS_MAX + 4}`);
    expect(loaded.some((e) => e.signature === "sig-0")).toBe(false);
  });

  it("updates existing signature in place at front", () => {
    storage.set(
      REMEMBERED_IMPORTS_KEY,
      JSON.stringify([
        makeEntry("other", { role: "admin" }),
        makeEntry("target", { role: "student", updatedAt: 1 }),
      ]),
    );

    saveRememberedImport({
      signature: "target",
      role: "teacher",
      mapping: { 0: "email" },
      fieldDefaults: {},
    });

    const loaded = loadRememberedImports();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.signature).toBe("target");
    expect(loaded[0]?.role).toBe("teacher");
    expect(loaded[1]?.signature).toBe("other");
  });

  it("clears saved field defaults without removing mapping or role", () => {
    const headers = ["Email", "Name"];
    saveRememberedImport({
      signature: computeHeaderSignature(headers),
      role: "student",
      mapping: { 0: "email", 1: "name" },
      fieldDefaults: { date_testing: "bad-default" },
    });

    clearRememberedImportFieldDefaults(headers);

    const found = findRememberedImport(headers);
    expect(found?.role).toBe("student");
    expect(found?.mapping).toEqual({ 0: "email", 1: "name" });
    expect(found?.fieldDefaults).toEqual({});
  });
});

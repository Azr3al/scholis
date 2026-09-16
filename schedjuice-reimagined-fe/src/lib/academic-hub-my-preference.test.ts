import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACADEMIC_HUB_MY_CLASSES_ONLY_KEY_PREFIX,
  getAcademicHubMyClassesOnly,
  resolveMyDefault,
  setAcademicHubMyClassesOnly,
} from "./academic-hub-my-preference";

function keyFor(userId: number) {
  return `${ACADEMIC_HUB_MY_CLASSES_ONLY_KEY_PREFIX}${userId}`;
}

describe("resolveMyDefault", () => {
  it("returns false for admin/manager/superadmin even when also teacher", () => {
    expect(resolveMyDefault(true, true)).toBe(false);
  });

  it("returns true for teacher-only users", () => {
    expect(resolveMyDefault(false, true)).toBe(true);
  });

  it("returns false when user has neither role", () => {
    expect(resolveMyDefault(false, false)).toBe(false);
  });
});

describe("academic hub my-classes-only localStorage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("get returns null when key is absent", () => {
    expect(getAcademicHubMyClassesOnly(42)).toBeNull();
  });

  it("set/get round-trips true and false", () => {
    setAcademicHubMyClassesOnly(7, true);
    expect(getAcademicHubMyClassesOnly(7)).toBe(true);
    expect(store.get(keyFor(7))).toBe("true");

    setAcademicHubMyClassesOnly(7, false);
    expect(getAcademicHubMyClassesOnly(7)).toBe(false);
    expect(store.get(keyFor(7))).toBe("false");
  });

  it("scopes keys by user id", () => {
    setAcademicHubMyClassesOnly(1, true);
    setAcademicHubMyClassesOnly(2, false);
    expect(getAcademicHubMyClassesOnly(1)).toBe(true);
    expect(getAcademicHubMyClassesOnly(2)).toBe(false);
  });

  it("returns null for invalid stored values", () => {
    store.set(keyFor(99), "maybe");
    expect(getAcademicHubMyClassesOnly(99)).toBeNull();
  });

  it("returns null when localStorage is unavailable (SSR guard)", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", undefined);
    expect(getAcademicHubMyClassesOnly(1)).toBeNull();
  });
});

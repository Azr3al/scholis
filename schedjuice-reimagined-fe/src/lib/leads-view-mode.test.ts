import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isLeadsViewMode,
  readLeadsViewMode,
  writeLeadsViewMode,
} from "./leads-view-mode";

describe("leads view-mode persistence", () => {
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

  it("validates known modes", () => {
    expect(isLeadsViewMode("board")).toBe(true);
    expect(isLeadsViewMode("table")).toBe(true);
    expect(isLeadsViewMode("grid")).toBe(false);
    expect(isLeadsViewMode(null)).toBe(false);
  });

  it("defaults to board when nothing stored", () => {
    expect(readLeadsViewMode()).toBe("board");
  });

  it("falls back to board on an invalid stored value", () => {
    localStorage.setItem("leads:view-mode", "nonsense");
    expect(readLeadsViewMode()).toBe("board");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  hasSeenFindPageDialog,
  hasSeenFindPageCoachmark,
  markFindPageDialogSeen,
  markFindPageCoachmarkSeen,
  replayFindPageOnboarding,
} from "../find-page-onboarding-storage";

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("find-page-onboarding-storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts unseen", () => {
    expect(hasSeenFindPageDialog()).toBe(false);
    expect(hasSeenFindPageCoachmark()).toBe(false);
  });

  it("marks dialog and coachmark independently", () => {
    markFindPageDialogSeen();
    expect(hasSeenFindPageDialog()).toBe(true);
    expect(hasSeenFindPageCoachmark()).toBe(false);

    markFindPageCoachmarkSeen();
    expect(hasSeenFindPageCoachmark()).toBe(true);
  });

  it("replay clears both keys", () => {
    markFindPageDialogSeen();
    markFindPageCoachmarkSeen();
    replayFindPageOnboarding();
    expect(hasSeenFindPageDialog()).toBe(false);
    expect(hasSeenFindPageCoachmark()).toBe(false);
  });
});

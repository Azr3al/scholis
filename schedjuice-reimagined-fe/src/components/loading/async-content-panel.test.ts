import { describe, expect, it } from "vitest";

import { deriveAsyncPanelState } from "./async-content-panel";

describe("deriveAsyncPanelState", () => {
  const base = {
    enabled: true,
    queryLength: 3,
    minLength: 2,
    isError: false,
    isFetching: false,
    resultCount: 0,
  };

  it("returns idle when disabled", () => {
    expect(deriveAsyncPanelState({ ...base, enabled: false })).toBe("idle");
  });

  it("returns hint when query too short", () => {
    expect(deriveAsyncPanelState({ ...base, queryLength: 1 })).toBe("hint");
  });

  it("returns error when isError", () => {
    expect(deriveAsyncPanelState({ ...base, isError: true })).toBe("error");
  });

  it("returns loading when fetching with no results", () => {
    expect(
      deriveAsyncPanelState({ ...base, isFetching: true, resultCount: 0 }),
    ).toBe("loading");
  });

  it("returns empty when not fetching and zero results", () => {
    expect(deriveAsyncPanelState({ ...base, resultCount: 0 })).toBe("empty");
  });

  it("returns ready when results exist", () => {
    expect(deriveAsyncPanelState({ ...base, resultCount: 2 })).toBe("ready");
  });

  it("returns ready when refetching with stale results", () => {
    expect(
      deriveAsyncPanelState({ ...base, isFetching: true, resultCount: 3 }),
    ).toBe("ready");
  });
});

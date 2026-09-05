import { describe, expect, it } from "vitest";

import {
  RECENT_TRANSACTIONS_MAX_AUTO_PREFETCH,
  shouldFetchNextPage,
} from "./recent-transactions-prefetch";

describe("shouldFetchNextPage", () => {
  const base = {
    isIntersecting: true,
    hasNextPage: true,
    isFetchingNextPage: false,
    hasUserScrolled: false,
    autoPrefetchCount: 0,
    maxAutoPrefetch: RECENT_TRANSACTIONS_MAX_AUTO_PREFETCH,
  };

  it("returns false when sentinel is not intersecting", () => {
    expect(shouldFetchNextPage({ ...base, isIntersecting: false })).toBe(false);
  });

  it("returns false when there is no next page", () => {
    expect(shouldFetchNextPage({ ...base, hasNextPage: false })).toBe(false);
  });

  it("returns false while a page is already fetching", () => {
    expect(shouldFetchNextPage({ ...base, isFetchingNextPage: true })).toBe(
      false,
    );
  });

  it("allows auto-prefetch up to maxAutoPrefetch without user scroll", () => {
    expect(shouldFetchNextPage({ ...base, autoPrefetchCount: 0 })).toBe(true);
    expect(shouldFetchNextPage({ ...base, autoPrefetchCount: 1 })).toBe(true);
    expect(
      shouldFetchNextPage({
        ...base,
        autoPrefetchCount: RECENT_TRANSACTIONS_MAX_AUTO_PREFETCH,
      }),
    ).toBe(false);
  });

  it("allows fetch after user has scrolled regardless of auto-prefetch count", () => {
    expect(
      shouldFetchNextPage({
        ...base,
        hasUserScrolled: true,
        autoPrefetchCount: RECENT_TRANSACTIONS_MAX_AUTO_PREFETCH,
      }),
    ).toBe(true);
  });
});

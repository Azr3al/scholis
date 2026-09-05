import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";

import { userPaymentsKeys } from "@/sdk/keys/user-payments";
import { invalidateUserPaymentsCaches } from "./invalidate-user-payments-caches";

function createMockQueryClient() {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  return {
    invalidateQueries,
  } as unknown as QueryClient & {
    invalidateQueries: ReturnType<typeof vi.fn>;
  };
}

describe("invalidateUserPaymentsCaches", () => {
  it("invalidates SDK user-payments and unscoped grid key", async () => {
    const queryClient = createMockQueryClient();

    await invalidateUserPaymentsCaches(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: userPaymentsKeys.all,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["searchuser-payments"],
    });
    for (const [arg] of queryClient.invalidateQueries.mock.calls) {
      expect(arg?.queryKey?.[0]).not.toBe("searchuser-courses");
    }
  });

  it("scopes the grid key when tableUid is provided", async () => {
    const queryClient = createMockQueryClient();

    await invalidateUserPaymentsCaches(queryClient, { tableUid: "sp-grid" });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: userPaymentsKeys.all,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["searchuser-payments", "sp-grid"],
    });
  });
});

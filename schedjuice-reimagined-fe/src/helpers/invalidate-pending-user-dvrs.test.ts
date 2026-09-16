import { describe, expect, it, vi } from "vitest";

import { invalidatePendingUserDvrs } from "./invalidate-pending-user-dvrs";

describe("invalidatePendingUserDvrs", () => {
  it("invalidates the pending-user-dvrs query for the user", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries };

    await invalidatePendingUserDvrs(queryClient as never, 7);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["pending-user-dvrs", 7],
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import { softRefetchStudentPaymentsReport } from "./soft-refetch-student-payments-report";

function mockQueryClient() {
  return {
    refetchQueries: vi.fn().mockResolvedValue(undefined),
  };
}

describe("softRefetchStudentPaymentsReport", () => {

  it("refetches unscoped searchuser-payments when tableUid omitted", async () => {
    const queryClient = mockQueryClient();
    await softRefetchStudentPaymentsReport(queryClient as any);
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["searchuser-payments"],
    });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["user-payments"],
    });
  });
});

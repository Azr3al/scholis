import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateCourseSummaryCaches } from "@/lib/course-cache";

function createMockQueryClient() {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  return {
    invalidateQueries,
  } as unknown as QueryClient & {
    invalidateQueries: ReturnType<typeof vi.fn>;
  };
}

describe("invalidateCourseSummaryCaches", () => {
  it("invalidates list-style course caches", async () => {
    const queryClient = createMockQueryClient();

    await invalidateCourseSummaryCaches(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["academic-hub-list"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["academic-hub-aggregate"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["course-search"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["chatCourses"],
    });
  });

  it("invalidates course detail caches when courseId is provided", async () => {
    const queryClient = createMockQueryClient();

    await invalidateCourseSummaryCaches(queryClient, 42);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(6);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["getCourse", "42"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["getCourse", 42],
    });
  });
});

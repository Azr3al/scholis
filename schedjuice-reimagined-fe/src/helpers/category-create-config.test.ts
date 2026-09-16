import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: vi.fn(),
  searchEntities: vi.fn(),
}));

import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import { createOrResolveCategoryByName } from "./category-create-config";

describe("createOrResolveCategoryByName", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
    vi.mocked(searchEntities).mockReset();
  });

  it("rejects empty name", async () => {
    await expect(createOrResolveCategoryByName("   ")).rejects.toThrow(
      /Category name is required/i,
    );
    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it("returns created id on success", async () => {
    vi.mocked(makePostRequest).mockResolvedValueOnce({
      data: { data: { id: 42 } },
    } as never);

    await expect(createOrResolveCategoryByName("ACCA")).resolves.toBe(42);
    expect(makePostRequest).toHaveBeenCalledWith("categories", { name: "ACCA" });
  });

  it("resolves existing id when duplicate name error is returned", async () => {
    vi.mocked(makePostRequest).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: {
          isError: true,
          details: { name: ["category with this name already exists."] },
        },
      },
    });
    vi.mocked(searchEntities).mockResolvedValueOnce({
      data: { data: [{ id: 7, name: "ACCA" }] },
    } as never);

    await expect(createOrResolveCategoryByName("ACCA")).resolves.toBe(7);
    expect(searchEntities).toHaveBeenCalled();
  });

  it("rethrows non-duplicate errors", async () => {
    const err = {
      isAxiosError: true,
      response: {
        data: {
          isError: true,
          details: "permission denied",
        },
      },
    };
    vi.mocked(makePostRequest).mockRejectedValueOnce(err);

    await expect(createOrResolveCategoryByName("ACCA")).rejects.toBe(err);
    expect(searchEntities).not.toHaveBeenCalled();
  });
});

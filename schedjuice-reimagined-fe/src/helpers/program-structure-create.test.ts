import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: vi.fn(),
  searchEntities: vi.fn(),
}));

import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import {
  createProgramLevelWithDefaultSection,
  createProgramSection,
  saveProgramLevelSubjects,
} from "./program-structure-create";

describe("createProgramLevelWithDefaultSection", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
  });

  it("posts level then default section A", async () => {
    vi.mocked(makePostRequest)
      .mockResolvedValueOnce({ data: { data: { id: 10, name: "Year 8" } } } as never)
      .mockResolvedValueOnce({ data: { data: { id: 20, name: "A" } } } as never);

    const result = await createProgramLevelWithDefaultSection("5", "Year 8", 2);

    expect(makePostRequest).toHaveBeenNthCalledWith(1, "program-levels", {
      program: 5,
      name: "Year 8",
      sort_order: 2,
    });
    expect(makePostRequest).toHaveBeenNthCalledWith(2, "program-level-sections", {
      level: 10,
      name: "A",
      sort_order: 0,
    });
    expect(result).toEqual({
      levelId: 10,
      levelName: "Year 8",
      sectionId: 20,
      sectionName: "A",
    });
  });

  it("throws when level response has no id", async () => {
    vi.mocked(makePostRequest).mockResolvedValueOnce({ data: { data: {} } } as never);

    await expect(
      createProgramLevelWithDefaultSection("5", "Year 8"),
    ).rejects.toThrow(/no id/i);
  });
});

describe("createProgramSection", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
  });

  it("posts a section for the given level", async () => {
    vi.mocked(makePostRequest).mockResolvedValueOnce({
      data: { data: { id: 30, name: "B" } },
    } as never);

    const result = await createProgramSection(10, "B", 1);

    expect(makePostRequest).toHaveBeenCalledWith("program-level-sections", {
      level: 10,
      name: "B",
      sort_order: 1,
    });
    expect(result).toEqual({ sectionId: 30, sectionName: "B" });
  });
});

describe("saveProgramLevelSubjects", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
    vi.mocked(searchEntities).mockReset();
  });

  it("no-ops when level already has program-level-subjects", async () => {
    vi.mocked(searchEntities).mockResolvedValueOnce({
      data: { data: [{ id: 1, level: 10, subject: 100 }] },
    } as never);

    await saveProgramLevelSubjects(10, [100, 101]);

    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it("posts program-level-subjects when level has none", async () => {
    vi.mocked(searchEntities).mockResolvedValueOnce({ data: { data: [] } } as never);
    vi.mocked(makePostRequest).mockResolvedValue({ data: { data: { id: 1 } } } as never);

    await saveProgramLevelSubjects(10, [100, 101]);

    expect(makePostRequest).toHaveBeenNthCalledWith(1, "program-level-subjects", {
      level: 10,
      subject: 100,
      sort_order: 0,
    });
    expect(makePostRequest).toHaveBeenNthCalledWith(2, "program-level-subjects", {
      level: 10,
      subject: 101,
      sort_order: 1,
    });
  });
});

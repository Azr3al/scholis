import { describe, expect, it, vi } from "vitest";
import { buildPreviewSignature } from "@/components/scheduling/create-flow-context";
import {
  buildDefaultLevelSectionOverrides,
  ensureProgramSectionsForIntake,
  sectionNameExists,
  toLevelSectionNames,
  validateLevelSectionsForSubjects,
} from "./intake-sections";

describe("intake section helpers", () => {
  it("builds default section overrides from program sections", () => {
    expect(
      buildDefaultLevelSectionOverrides({
        1: [
          { id: 10, name: "A", levelId: 1 },
          { id: 11, name: "B", levelId: 1 },
        ],
      }),
    ).toEqual({
      1: [
        { name: "A", sectionId: 10 },
        { name: "B", sectionId: 11 },
      ],
    });
  });

  it("serializes section overrides for API defaults", () => {
    expect(
      toLevelSectionNames({
        1: [{ name: "A", sectionId: 10 }, { name: "D" }],
        2: [{ name: "A", sectionId: 20 }],
      }),
    ).toEqual({
      "1": ["A", "D"],
      "2": ["A"],
    });
  });

  it("detects duplicate section names case-insensitively", () => {
    expect(sectionNameExists([{ name: "A" }], "a")).toBe(true);
    expect(sectionNameExists([{ name: "A" }], "B")).toBe(false);
  });

  it("requires sections when a level has subjects", () => {
    expect(
      validateLevelSectionsForSubjects(
        [{ id: 1 }],
        { 1: [100] },
        { 1: [] },
      ),
    ).toMatch(/at least one section/i);
    expect(
      validateLevelSectionsForSubjects(
        [{ id: 1 }],
        { 1: [100] },
        { 1: [{ name: "A" }] },
      ),
    ).toBeNull();
  });

  it("creates program sections for intake selections missing sectionId", async () => {
    const createSection = vi.fn(async (levelId: number, name: string, sortOrder: number) => ({
      id: 99,
      name,
    }));

    const result = await ensureProgramSectionsForIntake(
      { 1: [{ name: "D" }] },
      { 1: [{ id: 10, name: "A", levelId: 1 }] },
      createSection,
    );

    expect(createSection).toHaveBeenCalledWith(1, "D", 1);
    expect(result).toEqual({ 1: [{ name: "D", sectionId: 99 }] });
  });

  it("links existing program section by name without POST", async () => {
    const createSection = vi.fn();

    const result = await ensureProgramSectionsForIntake(
      { 1: [{ name: "a" }] },
      { 1: [{ id: 10, name: "A", levelId: 1 }] },
      createSection,
    );

    expect(createSection).not.toHaveBeenCalled();
    expect(result).toEqual({ 1: [{ name: "A", sectionId: 10 }] });
  });

  it("dedupes case-insensitively when persisting new sections", async () => {
    const createSection = vi.fn();

    const result = await ensureProgramSectionsForIntake(
      { 1: [{ name: "b" }] },
      { 1: [{ id: 11, name: "B", levelId: 1 }] },
      createSection,
    );

    expect(createSection).not.toHaveBeenCalled();
    expect(result).toEqual({ 1: [{ name: "B", sectionId: 11 }] });
  });
});

describe("buildPreviewSignature with sections", () => {
  it("changes when section overrides change", () => {
    const base = buildPreviewSignature(
      2,
      "Term 1",
      "2026-05-01",
      "2026-10-30",
      { 1: [10] },
      { 1: [{ name: "A", sectionId: 5 }] },
    );
    const updated = buildPreviewSignature(
      2,
      "Term 1",
      "2026-05-01",
      "2026-10-30",
      { 1: [10] },
      { 1: [{ name: "A" }, { name: "B" }] },
    );
    expect(base).not.toBe(updated);
  });
});

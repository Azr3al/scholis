import { describe, expect, it } from "vitest";
import {
  buildPreviewSignature,
  omitIntakePreviewFields,
  shouldResetCreateFlowState,
  shouldSkipPreviewFetch,
} from "./create-flow-context";

describe("buildPreviewSignature", () => {
  it("changes when intake name changes", () => {
    const base = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30");
    const renamed = buildPreviewSignature(2, "Term 2", "2026-05-01", "2026-10-30");
    expect(base).not.toBe(renamed);
  });

  it("changes when dates change", () => {
    const base = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30");
    const newDates = buildPreviewSignature(2, "Term 1", "2026-06-01", "2026-10-30");
    expect(base).not.toBe(newDates);
  });

  it("changes when level subjects change", () => {
    const base = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30", {
      1: [10, 20],
    });
    const updated = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30", {
      1: [10, 30],
    });
    expect(base).not.toBe(updated);
  });

  it("is stable for equivalent level subject ordering", () => {
    const a = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30", {
      2: [30, 10],
      1: [20, 10],
    });
    const b = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30", {
      1: [10, 20],
      2: [10, 30],
    });
    expect(a).toBe(b);
  });

  it("changes when extra courses change", () => {
    const base = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30");
    const withExtra = buildPreviewSignature(
      2,
      "Term 1",
      "2026-05-01",
      "2026-10-30",
      undefined,
      undefined,
      [{ key: "extra:1", subject_id: 10 }],
    );
    expect(base).not.toBe(withExtra);
  });
});

describe("shouldSkipPreviewFetch", () => {
  it("skips when signature matches and rows exist", () => {
    const signature = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30");
    expect(
      shouldSkipPreviewFetch(
        { previewSignature: signature, previewRows: [{ key: "a", title: "Course" }] as never },
        signature,
        1,
      ),
    ).toBe(true);
  });

  it("does not skip when signature mismatches", () => {
    const stored = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30");
    const current = buildPreviewSignature(2, "Term 2", "2026-05-01", "2026-10-30");
    expect(
      shouldSkipPreviewFetch(
        { previewSignature: stored, previewRows: [{ key: "a", title: "Course" }] as never },
        current,
        1,
      ),
    ).toBe(false);
  });

  it("does not skip when preview rows are empty", () => {
    const signature = buildPreviewSignature(2, "Term 1", "2026-05-01", "2026-10-30");
    expect(
      shouldSkipPreviewFetch({ previewSignature: signature }, signature, 0),
    ).toBe(false);
  });
});

describe("omitIntakePreviewFields", () => {
  it("removes preview cache fields but keeps intake draft fields", () => {
    const result = omitIntakePreviewFields({
      programId: 2,
      intakeName: "Term 1",
      startDate: "2026-05-01",
      intakeId: 99,
      previewRows: [{ key: "a", title: "Old" }] as never,
      titleEdits: { a: "Edited" },
      previewSignature: "sig",
    });
    expect(result).toEqual({
      programId: 2,
      intakeName: "Term 1",
      startDate: "2026-05-01",
    });
  });
});

describe("shouldResetCreateFlowState", () => {
  it("resets on manual route even when program matches", () => {
    expect(
      shouldResetCreateFlowState({ programId: 2, intakeName: "Term 1" }, 2, true),
    ).toBe(true);
  });

  it("resets when persisted program differs from URL program", () => {
    expect(
      shouldResetCreateFlowState(
        { programId: 1, previewRows: [{ key: "a", title: "Old" }] as never },
        2,
        false,
      ),
    ).toBe(true);
  });

  it("keeps state for same program on intake steps", () => {
    expect(
      shouldResetCreateFlowState(
        { programId: 2, intakeName: "Term 1", startDate: "2026-05-01" },
        2,
        false,
      ),
    ).toBe(false);
  });

  it("keeps state when URL has no programId (program picker)", () => {
    expect(
      shouldResetCreateFlowState({ programId: 2, intakeName: "Term 1" }, undefined, false),
    ).toBe(false);
  });

  it("keeps empty state on first visit", () => {
    expect(shouldResetCreateFlowState({}, 2, false)).toBe(false);
  });

  it("does not reset when persisted state has no programId yet", () => {
    expect(
      shouldResetCreateFlowState({ intakeName: "Draft only" }, 2, false),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  readMirror,
  shouldRestoreFromMirror,
  writeMirror,
} from "./quiz-autosave-mirror";

describe("shouldRestoreFromMirror", () => {
  it("returns false when mirror is null", () => {
    expect(shouldRestoreFromMirror(null, 1)).toBe(false);
  });
  it("returns false when attempt_id mismatches", () => {
    expect(
      shouldRestoreFromMirror(
        {
          attempt_id: 2,
          answers: {},
          marked_review: {},
          written_at: 100,
          server_synced_at: 50,
        },
        1,
      ),
    ).toBe(false);
  });
  it("returns true when written_at > server_synced_at", () => {
    const m = {
      attempt_id: 1,
      answers: {},
      marked_review: {},
      written_at: 100,
      server_synced_at: 50,
    };
    expect(shouldRestoreFromMirror(m, 1)).toBe(true);
  });
  it("returns false when written_at <= server_synced_at", () => {
    const m = {
      attempt_id: 1,
      answers: {},
      marked_review: {},
      written_at: 50,
      server_synced_at: 100,
    };
    expect(shouldRestoreFromMirror(m, 1)).toBe(false);
  });
  it("treats null server_synced_at as 0", () => {
    const m = {
      attempt_id: 1,
      answers: {},
      marked_review: {},
      written_at: 1,
      server_synced_at: null,
    };
    expect(shouldRestoreFromMirror(m, 1)).toBe(true);
  });
});

describe("readMirror / writeMirror", () => {
});

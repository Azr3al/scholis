import { describe, expect, it } from "vitest";

import {
  buildMarkSheetRematchResolution,
  clearResolvingFromResolution,
  createRematchRequestGuard,
  extractMatchErrorMessage,
  seedManualMatchResolution,
  seedMarkSheetRematchResolving,
} from "@/components/mark-sheets/mark-sheet-import-wizard";

describe("mark-sheet-import-wizard rematch helpers", () => {
  it("createRematchRequestGuard ignores stale responses", () => {
    const guard = createRematchRequestGuard();
    const first = guard.nextRequestId();
    const second = guard.nextRequestId();

    expect(guard.shouldApply(first)).toBe(false);
    expect(guard.shouldApply(second)).toBe(true);
  });

  it("buildMarkSheetRematchResolution rebuilds all rows from match results", () => {
    const rows = [
      ["Hla Hla", "hlahla@hlahla.com"],
      ["Su Su", "susu@su.com"],
    ];
    const rowIds = ["row-0", "row-1"];
    const matchResults = {
      name: {
        "Hla Hla": {
          kind: "exact" as const,
          user: { id: 1, name: "Hla Hla", email: "hlahla@hlahla.com" },
        },
        "Su Su": { kind: "none" as const },
      },
    };

    const resolution = buildMarkSheetRematchResolution(
      rows,
      rowIds,
      { name: 0 },
      matchResults,
    );

    expect(resolution.get("row-0:name")?.status).toBe("confirmed");
    expect(resolution.get("row-1:name")?.status).toBe("new");
  });

  it("seedMarkSheetRematchResolving spreads resolving to mapped identifier fields", () => {
    const resolution = seedMarkSheetRematchResolving(["row-0"], {
      name: 0,
      email: 1,
    });
    expect(resolution.get("row-0:email")?.status).toBe("resolving");
    expect(resolution.get("row-0:name")?.status).toBe("resolving");
  });

  it("seedManualMatchResolution seeds new status for manual matching", () => {
    const resolution = seedManualMatchResolution(["row-0", "row-1"], { name: 0 });
    expect(resolution.get("row-0:name")?.status).toBe("new");
    expect(resolution.get("row-1:name")?.status).toBe("new");
  });

  it("clearResolvingFromResolution preserves confirmed rows and clears resolving", () => {
    const snapshot = new Map([
      ["row-0:name", { status: "confirmed" as const, entityRef: { id: 1, label: "A" } }],
      ["row-1:name", { status: "resolving" as const }],
    ]);

    const next = clearResolvingFromResolution(snapshot, ["row-0", "row-1"], { name: 0 });

    expect(next.get("row-0:name")?.status).toBe("confirmed");
    expect(next.get("row-1:name")?.status).toBe("new");
  });

  it("clearResolvingFromResolution does not wipe confirmed matches like empty match results", () => {
    const rows = [["Hla Hla"], ["Su Su"]];
    const rowIds = ["row-0", "row-1"];
    const snapshot = buildMarkSheetRematchResolution(rows, rowIds, { name: 0 }, {
      name: {
        "Hla Hla": {
          kind: "exact" as const,
          user: { id: 1, name: "Hla Hla", email: "a@a.com" },
        },
        "Su Su": { kind: "none" as const },
      },
    });
    expect(snapshot.get("row-0:name")?.status).toBe("confirmed");

    const restored = clearResolvingFromResolution(snapshot, rowIds, { name: 0 });

    expect(restored.get("row-0:name")?.status).toBe("confirmed");
    expect(restored.get("row-1:name")?.status).toBe("new");
  });

  it("extractMatchErrorMessage reads axios response message", () => {
    expect(
      extractMatchErrorMessage({
        response: { data: { message: "Course not found." } },
      }),
    ).toBe("Course not found.");
    expect(extractMatchErrorMessage(new Error("Network Error"))).toBe("Network Error");
  });
});

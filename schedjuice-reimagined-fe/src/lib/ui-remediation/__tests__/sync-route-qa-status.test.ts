import { describe, it, expect } from "vitest";
import type {
  RouteManifestFile,
  RouteQaEvidence,
} from "../route-manifest-schema";
import {
  aggregateRouteQaStatus,
  mergeVariantQaFromPrior,
  resolveVariantQaFromEvidence,
  resolveVariantQaWithoutEvidence,
  syncManifestQaStatus,
} from "../sync-route-qa-status";

const baseEvidence = {
  routePattern: "/finances/student-payments",
  fixtureUrl: "/finances/student-payments",
  cohortId: "R15-QA7",
  variantId: "shared-shell" as const,
  persona: "admin",
  viewport: { width: 1280, height: 800 },
  theme: "light" as const,
  verifiedAt: "2026-07-12T12:00:00.000Z",
  verifiedSha: "a".repeat(40),
  checks: {},
  screenshots: [],
  notes: "",
};

describe("resolveVariantQaWithoutEvidence", () => {
  it("stays blocked when blockerReason is set", () => {
    expect(
      resolveVariantQaWithoutEvidence({
        blockerReason: "No concrete fixture URL configured for /courses/:id",
      }),
    ).toEqual({ qaStatus: "blocked" });
  });

  it("is pending when evidence is missing and there is no blocker", () => {
    expect(resolveVariantQaWithoutEvidence({})).toEqual({
      qaStatus: "pending",
    });
  });
});

describe("resolveVariantQaFromEvidence", () => {
  it("maps fail evidence to fail", () => {
    expect(
      resolveVariantQaFromEvidence({
        ...baseEvidence,
        result: "fail",
        defect: {
          reproduction: ["open page"],
          expected: "table renders",
          actual: "blank",
          suspectedOwnerWave: "R12",
          blocksCohortOnly: true,
        },
      }),
    ).toEqual({ qaStatus: "fail" });
  });

  it("maps blocked evidence with blockerReason", () => {
    expect(
      resolveVariantQaFromEvidence({
        ...baseEvidence,
        result: "blocked",
        blockerReason: "Seeded course 96 unavailable",
      }),
    ).toEqual({
      qaStatus: "blocked",
      blockerReason: "Seeded course 96 unavailable",
    });
  });
});

describe("aggregateRouteQaStatus", () => {

  it("aggregates to fail when any variant fails", () => {
    expect(
      aggregateRouteQaStatus([
        { qaStatus: "pass" },
        { qaStatus: "fail" },
        { qaStatus: "blocked", blockerReason: "fixture" },
      ]),
    ).toEqual({ qaStatus: "fail" });
  });

  it("prefers fail over blocked at route level", () => {
    expect(
      aggregateRouteQaStatus([
        { qaStatus: "blocked", blockerReason: "missing fixture" },
        { qaStatus: "fail" },
      ]),
    ).toEqual({ qaStatus: "fail" });
  });

  it("aggregates to blocked when variants are blocked and none fail", () => {
    expect(
      aggregateRouteQaStatus([
        { qaStatus: "blocked", blockerReason: "reason a" },
        { qaStatus: "blocked", blockerReason: "reason b" },
      ]),
    ).toEqual({ qaStatus: "blocked", blockerReason: "reason a; reason b" });
  });

  it("aggregates to pending when any variant is pending", () => {
    expect(
      aggregateRouteQaStatus([
        { qaStatus: "pass" },
        { qaStatus: "pending" },
      ]),
    ).toEqual({ qaStatus: "pending" });
  });
});

describe("mergeVariantQaFromPrior", () => {
  it("preserves pass from prior over fresh pending", () => {
    expect(
      mergeVariantQaFromPrior(
        { qaStatus: "pass" },
        { qaStatus: "pending" },
      ),
    ).toEqual({ qaStatus: "pass" });
  });

  it("drops fixture blocker when a fixture is now configured", () => {
    expect(
      mergeVariantQaFromPrior(
        {
          qaStatus: "blocked",
          blockerReason:
            "No concrete fixture URL configured for /courses/:id/student-payments",
        },
        { qaStatus: "pending" },
      ),
    ).toEqual({ qaStatus: "pending" });
  });
});

describe("syncManifestQaStatus", () => {
  const makeManifest = (): RouteManifestFile => ({
    version: 1 as const,
    generatedAt: "2026-07-12T12:00:00.000Z",
    baseSha: "abc1234",
    entries: [
      {
        routePattern: "/finances/student-payments",
        pagePath: "src/app/(internal)/finances/student-payments/page.tsx",
        fixtureUrl: "/finances/student-payments",
        routeFamily: "student-payments" as const,
        personas: ["admin"],
        requiredPermissions: [],
        fixtureSetup: "seed",
        primaryTheme: "light" as const,
        primaryViewport: { width: 1280, height: 800 },
        mobileLayoutDiffers: false,
        darkLayoutDiffers: false,
        sharedPrimitives: ["PageContainer"],
        contractsExercised: ["page-layout"],
        riskTier: "high" as const,
        riskRationale: "test",
        coverageMode: "manual" as const,
        implementationStatus: "pending" as const,
        qaStatus: "pending" as const,
        defectRefs: [],
        verificationVariants: [
          {
            id: "shared-shell" as const,
            implementationPlan: "plan.md",
            implementationOwner: "R12",
            qaOwner: "R15-QA7",
            qaStatus: "pending" as const,
            evidencePath: "docs/evidence/shared-shell/",
          },
          {
            id: "resource-table" as const,
            implementationPlan: "plan.md",
            implementationOwner: "R12",
            qaOwner: "R15-QA8",
            qaStatus: "pending" as const,
            evidencePath: "docs/evidence/resource-table/",
          },
        ],
      },
    ],
  });

  it("syncs route-level status from variant evidence", () => {
    const manifest = makeManifest();
    const evidenceByPath: Record<string, RouteQaEvidence> = {
      "docs/evidence/shared-shell/": {
        ...baseEvidence,
        result: "pass",
      },
      "docs/evidence/resource-table/": {
        ...baseEvidence,
        cohortId: "R15-QA8",
        variantId: "resource-table",
        result: "blocked",
        blockerReason: "Table empty in seed",
      },
    };

    syncManifestQaStatus(manifest, (evidencePath) => evidenceByPath[evidencePath]);

    expect(manifest.entries[0].verificationVariants[0].qaStatus).toBe("pass");
    expect(manifest.entries[0].verificationVariants[1].qaStatus).toBe("blocked");
    expect(manifest.entries[0].qaStatus).toBe("blocked");
    expect(manifest.entries[0].blockerReason).toBe("Table empty in seed");
  });

  it("leaves blocked variants without evidence when blockerReason is set", () => {
    const manifest = makeManifest();
    manifest.entries[0].verificationVariants[0].blockerReason =
      "No concrete fixture URL configured";
    manifest.entries[0].verificationVariants[1].blockerReason =
      "No concrete fixture URL configured";

    syncManifestQaStatus(manifest, () => null);

    expect(manifest.entries[0].verificationVariants[0].qaStatus).toBe("blocked");
    expect(manifest.entries[0].verificationVariants[1].qaStatus).toBe("blocked");
    expect(manifest.entries[0].qaStatus).toBe("blocked");
  });
});

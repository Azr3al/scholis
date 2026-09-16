import { describe, it, expect } from "vitest";
import {
  RouteManifestEntrySchema,
  RouteManifestFileSchema,
  RouteQaEvidenceSchema,
  RouteFixtureOverridesSchema,
} from "../route-manifest-schema";

describe("RouteManifestEntrySchema", () => {
  const validEntry = {
    routePattern: "/users/:id",
    pagePath: "src/app/(internal)/users/[id]/page.tsx",
    fixtureUrl: "/users/42",
    routeFamily: "administration-crud",
    personas: ["admin", "teacher"],
    requiredPermissions: ["user.view"],
    fixtureSetup: "seed user id 42 with admin role",
    primaryTheme: "light",
    primaryViewport: { width: 1280, height: 800 },
    mobileLayoutDiffers: false,
    darkLayoutDiffers: false,
    sharedPrimitives: ["PageContainer", "ResourceTable"],
    contractsExercised: ["page-layout", "table"],
    riskTier: "medium",
    riskRationale: "Admin CRUD detail with overlays",
    coverageMode: "manual",
    verificationVariants: [
      {
        id: "default",
        implementationPlan:
          "2026-07-12-ui-remediation-r8-administration-crud.md",
        implementationOwner: "R8",
        qaOwner: "R15-QA3",
        qaStatus: "pending",
        evidencePath:
          "docs/ui-remediation/qa-evidence/r15-qa3-default/users-id/default/",
      },
    ],
    implementationStatus: "complete",
    qaStatus: "pending",
    defectRefs: [],
  };

  it("rejects dynamic routes without fixtureUrl", () => {
    const bad = { ...validEntry, routePattern: "/courses/:id", fixtureUrl: "" };
    expect(RouteManifestEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects dynamic routes whose fixtureUrl still contains parameters", () => {
    const bad = {
      ...validEntry,
      routePattern: "/courses/:id",
      fixtureUrl: "/courses/:id",
    };
    expect(RouteManifestEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("accepts a missing dynamic fixture only as an explicit blocker", () => {
    const blocked = {
      ...validEntry,
      routePattern: "/courses/:id",
      fixtureUrl: null,
      qaStatus: "blocked",
      blockerReason: "No seeded course fixture is available",
      verificationVariants: validEntry.verificationVariants.map((variant) => ({
        ...variant,
        qaStatus: "blocked",
        blockerReason: "No seeded course fixture is available",
      })),
    };
    expect(RouteManifestEntrySchema.safeParse(blocked).success).toBe(true);
  });

  it("rejects invalid route family", () => {
    const bad = { ...validEntry, routeFamily: "unknown-family" };
    expect(RouteManifestEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate variant ids on one route", () => {
    const duplicate = validEntry.verificationVariants[0];
    const bad = {
      ...validEntry,
      verificationVariants: [duplicate, { ...duplicate }],
    };
    expect(RouteManifestEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an incomplete student-payment variant set", () => {
    const bad = {
      ...validEntry,
      routePattern: "/finances/student-payments",
      pagePath: "src/app/(internal)/finances/student-payments/page.tsx",
      routeFamily: "student-payments",
      verificationVariants: [validEntry.verificationVariants[0]],
    };
    expect(RouteManifestEntrySchema.safeParse(bad).success).toBe(false);
  });
});

describe("RouteQaEvidenceSchema", () => {

  it("rejects failed evidence without a complete defect report", () => {
    expect(
      RouteQaEvidenceSchema.safeParse({
        routePattern: "/finances/student-payments",
        fixtureUrl: "/finances/student-payments",
        cohortId: "R15-QA8",
        variantId: "resource-table",
        persona: "admin",
        viewport: { width: 1280, height: 800 },
        theme: "light",
        verifiedAt: "2026-07-12T14:30:00Z",
        verifiedSha: "05ac447b05ac447b05ac447b05ac447b05ac447b",
        result: "fail",
        checks: {},
        screenshots: ["failure.png"],
        notes: "",
      }).success,
    ).toBe(false);
  });
});

describe("RouteFixtureOverridesSchema", () => {

  it("rejects non-path fixture URLs", () => {
    expect(
      RouteFixtureOverridesSchema.safeParse({
        "/courses/:id/student-payments": "seeded-course-17",
      }).success,
    ).toBe(false);
  });
});

describe("RouteManifestFileSchema", () => {
  it("rejects duplicate routePattern values", () => {
    const entry = RouteManifestEntrySchema.parse({
      routePattern: "/home",
      pagePath: "src/app/(internal)/home/page.tsx",
      fixtureUrl: "/home",
      routeFamily: "home-dashboard-analytics",
      personas: ["admin"],
      requiredPermissions: [],
      fixtureSetup: "default home dashboard seed",
      primaryTheme: "light",
      primaryViewport: { width: 1280, height: 800 },
      mobileLayoutDiffers: false,
      darkLayoutDiffers: false,
      sharedPrimitives: ["PageContainer"],
      contractsExercised: ["page-layout"],
      riskTier: "low",
      riskRationale: "Dashboard read surface",
      coverageMode: "representative",
      verificationVariants: [
        {
          id: "default",
          implementationPlan:
            "2026-07-12-ui-remediation-r7-home-dashboards-reporting.md",
          implementationOwner: "R7",
          qaOwner: "R15-QA2",
          qaStatus: "pending",
          evidencePath:
            "docs/ui-remediation/qa-evidence/r15-qa2-default/home/default/",
        },
      ],
      implementationStatus: "complete",
      qaStatus: "pending",
      defectRefs: [],
    });
    const file = {
      version: 1,
      generatedAt: "2026-07-12T00:00:00Z",
      baseSha: "05ac447b",
      entries: [
        entry,
        { ...entry, pagePath: "src/app/(internal)/home-alias/page.tsx" },
      ],
    };
    expect(RouteManifestFileSchema.safeParse(file).success).toBe(false);
  });

  it("rejects duplicate pagePath values", () => {
    const entry = RouteManifestEntrySchema.parse({
      routePattern: "/home",
      pagePath: "src/app/(internal)/home/page.tsx",
      fixtureUrl: "/home",
      routeFamily: "home-dashboard-analytics",
      personas: ["admin"],
      requiredPermissions: [],
      fixtureSetup: "default home dashboard seed",
      primaryTheme: "light",
      primaryViewport: { width: 1280, height: 800 },
      mobileLayoutDiffers: false,
      darkLayoutDiffers: false,
      sharedPrimitives: ["PageContainer"],
      contractsExercised: ["page-layout"],
      riskTier: "low",
      riskRationale: "Dashboard read surface",
      coverageMode: "representative",
      verificationVariants: [
        {
          id: "default",
          implementationPlan:
            "2026-07-12-ui-remediation-r7-home-dashboards-reporting.md",
          implementationOwner: "R7",
          qaOwner: "R15-QA2",
          qaStatus: "pending",
          evidencePath:
            "docs/ui-remediation/qa-evidence/r15-qa2-default/home/default/",
        },
      ],
      implementationStatus: "complete",
      qaStatus: "pending",
      defectRefs: [],
    });
    const file = {
      version: 1,
      generatedAt: "2026-07-12T00:00:00Z",
      baseSha: "05ac447b",
      entries: [entry, { ...entry, routePattern: "/home-alias" }],
    };
    expect(RouteManifestFileSchema.safeParse(file).success).toBe(false);
  });
});

# R15 — Independent Manual Route QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the route-manifest control plane (generator, classifier, schema validation) and execute exhaustive independent manual QA for every product route by route family, producing evidence-backed pass/fail records without automating every route.

**Architecture:** A static generator scans `src/app/**/page.tsx` and emits exactly one manifest entry per real product page. Each entry has a route family, an automation coverage mode (`automated`, `representative`, or `manual`), and one or more verification variants; the real student-payment routes carry `shared-shell`, `resource-table`, and `glide` variants rather than synthetic page paths. Ten independent QA cohorts manually verify route families or variants while every cohort runs the complete R0 browser gate as `npm run test:browser`; QA subagents verify only and never patch failures.

**Tech Stack:** TypeScript, Vitest, Node `fs`/`path` for generation, JSON manifest on disk, Playwright full-suite browser gate.

**Spec:** [`../specs/2026-07-12-ui-migration-remediation-program-design.md`](../specs/2026-07-12-ui-migration-remediation-program-design.md)  
**Orchestration:** [`2026-07-12-ui-migration-remediation-orchestration.md`](2026-07-12-ui-migration-remediation-orchestration.md)  
**Planning baseline SHA:** `05ac447b` on `dev`  
**Dependencies:** R0 browser harness merged; R6–R14 route repairs merged before QA execution (generator may land earlier)

**Forbidden files:** `src/app/**` product routes, `src/components/**` primitives, `DESIGN.md` — R15 does not repair UI  
**Owned files:** `src/lib/ui-remediation/route-manifest-*.ts`, `src/lib/ui-remediation/__tests__/route-manifest-*.test.ts`, `scripts/ui-remediation/generate-route-manifest.ts`, `docs/ui-remediation/route-manifest.json`, `docs/ui-remediation/route-manifest-exclusions.json`, `docs/ui-remediation/route-fixtures.json`, `docs/ui-remediation/qa-evidence/**`

---

## Route family → QA cohort map

| Cohort ID | Manifest selector | Implementation owner | QA owner tag |
| --- | --- | --- | --- |
| R15-QA1 | global-shell-auth-public | R6 | `qa-cohort-1-global` |
| R15-QA2 | home-dashboard-analytics | R7 | `qa-cohort-2-dashboard` |
| R15-QA3 | administration-crud | R8 | `qa-cohort-3-admin` |
| R15-QA4 | courses-attendance-scheduling | R9 | `qa-cohort-4-courses` |
| R15-QA5 | quizzes-docs-content-services | R10 | `qa-cohort-5-content` |
| R15-QA6 | finance-operations | R11 | `qa-cohort-6-finance` |
| R15-QA7 | any route with variant `shared-shell` | R12 | `qa-cohort-7-sp-shell` |
| R15-QA8 | any route with variant `resource-table` | R12 | `qa-cohort-8-sp-table` |
| R15-QA9 | any route with variant `glide` | R13 | `qa-cohort-9-sp-glide` |
| R15-QA10 | payment-upload-verification | R14 | `qa-cohort-10-upload` |

---

## Inventory rules (exact)

### Included routes

- Every file matching `src/app/**/page.tsx` under product route groups `(internal)`, `(public)`, `(quiz-v3)`, `(docs)`, plus root `src/app/page.tsx`.
- Dynamic segments remain as patterns: `/users/[id]/page.tsx` → route pattern `/users/:id`.
- Static routes use their route pattern as the initial fixture URL. Dynamic routes use `fixtureOverrides`; when no concrete seeded URL is configured, the generator writes `fixtureUrl: null` and marks the route plus every required variant `blocked` with an exact reason. R15 may inventory that blocker, but R16 cannot close until a concrete URL replaces it and all variants pass.
- The three shared student-payment pages are inventoried from their real files only:
  - `src/app/(internal)/finances/student-payments/page.tsx` → `/finances/student-payments`
  - `src/app/(internal)/finances/student-payments/transaction-lookup/page.tsx` → `/finances/student-payments/transaction-lookup`
  - `src/app/(internal)/courses/[id]/student-payments/page.tsx` → `/courses/:id/student-payments`
- ResourceTable and Glide are UI variants selected on the real routes above; the inventory never creates mode-specific route entries or page files.

### Excluded routes (documented in `route-manifest-exclusions.json`)

| Pattern | Reason |
| --- | --- |
| `src/app/(design)/**` | Design system sandbox — not product |
| `src/app/debug/**` | Debug surfaces — require `debug.access`, out of product QA scope |
| `src/app/artifacts/**` | Build artifacts / internal tooling |
| `src/app/api/**` | Not a page route |

### Automation coverage mode assignment

| Condition | Coverage mode |
| --- | --- |
| Covered by an R0 `e2e/smoke/*.spec.ts` geometry/interaction smoke for the same route pattern, or listed in the generator `automatedSmokePatterns` set | `automated` |
| `riskTier` is `high` | `automated` |
| First route in each route family by sorted `routePattern` | `representative` (automated browser + manual composition check) |
| All other inventoried routes | `manual` |

### Verification variant assignment

| Real route | Required variants |
| --- | --- |
| `/finances/student-payments` | `shared-shell`, `resource-table`, `glide` |
| `/finances/student-payments/transaction-lookup` | `shared-shell`, `resource-table`, `glide` |
| `/courses/:id/student-payments` | `shared-shell`, `resource-table`, `glide` |
| `/finances/recent-transactions` | `default`, `glide` (`variant="recent-transactions"` in the product component) |
| Every other real route | `default` |

The variant list does not create additional manifest route entries. It creates independent QA evidence obligations nested under the one entry for the real page.

### Risk tier rules

| Tier | Criteria |
| --- | --- |
| `high` | Finance, student-payments, payment upload, auth, global overlays, editable ResourceTable with payments |
| `medium` | Administration CRUD with overlays, course record body, quiz attempt flows |
| `low` | Static list pages, read-only detail, shortcuts with simple tables |

### Role fixture policy

| Persona | Fixture account env var | Permissions focus |
| --- | --- | --- |
| `admin` | `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | `*.view_all`, `*.manage_all` |
| `teacher` | `E2E_TEACHER_EMAIL` / `E2E_TEACHER_PASSWORD` | `course.view`, `attendance.mark` |
| `student` | `E2E_STUDENT_EMAIL` / `E2E_STUDENT_PASSWORD` | `course.view` (enrolled), `quiz.take` |
| `principal` | `E2E_PRINCIPAL_EMAIL` / `E2E_PRINCIPAL_PASSWORD` | `analytics.view`, `user.view` |

Role requirements per route:

- Read `src/config/route-permissions.ts` `ruleForPath` for `anyOf` permissions.
- If `public: true` → personas `["anonymous"]`.
- If `authedOnly: true` → personas `["admin", "teacher", "student"]` (layout does not change by permission).
- If `anyOf` present → personas must include at least one account holding each materially different permission set listed in the plan's cohort appendix.
- Finance and student-payments routes: always include `admin` and at least one restricted role lacking `payment.view_all`.

### Evidence format

Each verified route variant writes `docs/ui-remediation/qa-evidence/{cohort}/{routeSlug}/{variantId}/evidence.json`:

```json
{
  "routePattern": "/finances/student-payments",
  "fixtureUrl": "/finances/student-payments?courseId=fixture-course-1",
  "cohortId": "R15-QA8",
  "variantId": "resource-table",
  "persona": "admin",
  "viewport": { "width": 1280, "height": 800 },
  "theme": "light",
  "verifiedAt": "2026-07-12T14:30:00Z",
  "verifiedSha": "05ac447b05ac447b05ac447b05ac447b05ac447b",
  "result": "pass",
  "checks": {
    "noHorizontalOverflow": true,
    "pageTitlePresent": true,
    "overlayClickable": true,
    "tableScrollBeforeCrush": true,
    "tokenCoherent": true
  },
  "screenshots": ["light-1280.png"],
  "notes": ""
}
```

Manual defects set `"result": "fail"` and add a `"defect"` object with `reproduction`, `expected`, `actual`, `suspectedOwnerWave`, and `blocksCohortOnly`. Route-level `qaStatus` is derived from all required variants: `fail` if any variant fails, `blocked` if none fail and any variant is blocked, `pass` only when every variant passes, otherwise `pending`.

---

### Task 1: Route manifest schema

**Files:**
- Create: `src/lib/ui-remediation/route-manifest-schema.ts`
- Test: `src/lib/ui-remediation/__tests__/route-manifest-schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

```typescript
import { describe, it, expect } from "vitest";
import {
  RouteManifestEntrySchema,
  RouteManifestFileSchema,
  RouteFamilySchema,
  CoverageModeSchema,
  VerificationVariantIdSchema,
  RouteQaEvidenceSchema,
  RouteFixtureOverridesSchema,
  RiskTierSchema,
  QaStatusSchema,
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

  it("accepts a valid manifest entry", () => {
    expect(RouteManifestEntrySchema.safeParse(validEntry).success).toBe(true);
  });

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

  it("accepts one real student-payment route with three variants", () => {
    const result = RouteManifestEntrySchema.safeParse({
      ...validEntry,
      routePattern: "/finances/student-payments",
      pagePath: "src/app/(internal)/finances/student-payments/page.tsx",
      fixtureUrl: "/finances/student-payments?date=2026-07-01",
      routeFamily: "student-payments",
      coverageMode: "automated",
      verificationVariants: [
        {
          id: "shared-shell",
          implementationPlan:
            "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
          implementationOwner: "R12",
          qaOwner: "R15-QA7",
          qaStatus: "pending",
          evidencePath:
            "docs/ui-remediation/qa-evidence/r15-qa7-shared-shell/finances-student-payments/shared-shell/",
        },
        {
          id: "resource-table",
          implementationPlan:
            "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
          implementationOwner: "R12",
          qaOwner: "R15-QA8",
          qaStatus: "pending",
          evidencePath:
            "docs/ui-remediation/qa-evidence/r15-qa8-resource-table/finances-student-payments/resource-table/",
        },
        {
          id: "glide",
          implementationPlan:
            "2026-07-12-ui-remediation-r13-student-payments-glide.md",
          implementationOwner: "R13",
          qaOwner: "R15-QA9",
          qaStatus: "pending",
          evidencePath:
            "docs/ui-remediation/qa-evidence/r15-qa9-glide/finances-student-payments/glide/",
        },
      ],
    });
    expect(result.success).toBe(true);
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
  it("accepts complete passing variant evidence", () => {
    expect(
      RouteQaEvidenceSchema.safeParse({
        routePattern: "/finances/student-payments",
        fixtureUrl: "/finances/student-payments?courseId=fixture-course-1",
        cohortId: "R15-QA8",
        variantId: "resource-table",
        persona: "admin",
        viewport: { width: 1280, height: 800 },
        theme: "light",
        verifiedAt: "2026-07-12T14:30:00Z",
        verifiedSha: "05ac447b05ac447b05ac447b05ac447b05ac447b",
        result: "pass",
        checks: {
          noHorizontalOverflow: true,
          pageTitlePresent: true,
          overlayClickable: true,
          tableScrollBeforeCrush: true,
          tokenCoherent: true,
        },
        screenshots: ["light-1280.png"],
        notes: "",
      }).success,
    ).toBe(true);
  });

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
  it("accepts concrete route-pattern to fixture-URL mappings", () => {
    expect(
      RouteFixtureOverridesSchema.safeParse({
        "/courses/:id/student-payments":
          "/courses/seeded-course-17/student-payments",
      }).success,
    ).toBe(true);
  });

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

describe("enum schemas", () => {
  it("parses all route families", () => {
    const families = [
      "global-shell-auth-public",
      "home-dashboard-analytics",
      "administration-crud",
      "courses-attendance-scheduling",
      "quizzes-docs-content-services",
      "finance-operations",
      "student-payments",
      "payment-upload-verification",
    ];
    for (const family of families) {
      expect(RouteFamilySchema.safeParse(family).success).toBe(true);
    }
  });

  it("parses coverage modes and verification variants", () => {
    expect(CoverageModeSchema.safeParse("automated").success).toBe(true);
    expect(CoverageModeSchema.safeParse("representative").success).toBe(true);
    expect(CoverageModeSchema.safeParse("manual").success).toBe(true);
    expect(VerificationVariantIdSchema.safeParse("shared-shell").success).toBe(
      true,
    );
    expect(VerificationVariantIdSchema.safeParse("resource-table").success).toBe(
      true,
    );
    expect(VerificationVariantIdSchema.safeParse("glide").success).toBe(true);
  });

  it("parses risk tiers and qa status", () => {
    expect(RiskTierSchema.safeParse("high").success).toBe(true);
    expect(QaStatusSchema.safeParse("pending").success).toBe(true);
    expect(QaStatusSchema.safeParse("blocked").success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/ui-remediation/__tests__/route-manifest-schema.test.ts -v`  
Expected: FAIL — cannot find module `../route-manifest-schema`

- [ ] **Step 3: Write minimal schema implementation**

```typescript
import { z } from "zod";

export const RouteFamilySchema = z.enum([
  "global-shell-auth-public",
  "home-dashboard-analytics",
  "administration-crud",
  "courses-attendance-scheduling",
  "quizzes-docs-content-services",
  "finance-operations",
  "student-payments",
  "payment-upload-verification",
]);

export const CoverageModeSchema = z.enum([
  "automated",
  "representative",
  "manual",
]);

export const VerificationVariantIdSchema = z.enum([
  "default",
  "shared-shell",
  "resource-table",
  "glide",
]);

export const RiskTierSchema = z.enum(["high", "medium", "low"]);

export const ImplementationStatusSchema = z.enum([
  "pending",
  "in_progress",
  "complete",
]);

export const QaStatusSchema = z.enum([
  "pending",
  "pass",
  "fail",
  "blocked",
]);

export const ViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const VerificationVariantSchema = z.object({
  id: VerificationVariantIdSchema,
  implementationPlan: z.string().min(1),
  implementationOwner: z.string().min(1),
  qaOwner: z.string().min(1),
  qaStatus: QaStatusSchema,
  evidencePath: z.string().min(1),
  blockerReason: z.string().min(1).optional(),
});

export const RouteQaDefectSchema = z.object({
  reproduction: z.array(z.string().min(1)).min(1),
  expected: z.string().min(1),
  actual: z.string().min(1),
  suspectedOwnerWave: z.string().min(1),
  blocksCohortOnly: z.boolean(),
});

export const RouteQaEvidenceSchema = z
  .object({
    routePattern: z.string().min(1),
    fixtureUrl: z.string().min(1).nullable(),
    cohortId: z.string().regex(/^R15-QA([1-9]|10)$/),
    variantId: VerificationVariantIdSchema,
    persona: z.string().min(1),
    viewport: ViewportSchema,
    theme: z.enum(["light", "dark"]),
    verifiedAt: z.string().datetime(),
    verifiedSha: z.string().regex(/^[0-9a-f]{40}$/),
    result: z.enum(["pass", "fail", "blocked"]),
    checks: z.record(z.boolean()),
    screenshots: z.array(z.string().min(1)),
    notes: z.string(),
    defect: RouteQaDefectSchema.optional(),
    blockerReason: z.string().min(1).optional(),
  })
  .superRefine((evidence, ctx) => {
    if (evidence.result === "fail" && !evidence.defect) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed evidence requires a complete defect report",
        path: ["defect"],
      });
    }
    if (evidence.result === "blocked" && !evidence.blockerReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Blocked evidence requires blockerReason",
        path: ["blockerReason"],
      });
    }
  });

export const RouteManifestEntrySchema = z
  .object({
    routePattern: z.string().min(1),
    pagePath: z.string().min(1),
    fixtureUrl: z.string().min(1).nullable(),
    routeFamily: RouteFamilySchema,
    personas: z.array(z.string()).min(1),
    requiredPermissions: z.array(z.string()),
    fixtureSetup: z.string().min(1),
    primaryTheme: z.enum(["light", "dark"]),
    primaryViewport: ViewportSchema,
    mobileLayoutDiffers: z.boolean(),
    darkLayoutDiffers: z.boolean(),
    alternateRoleLayoutDiffers: z.boolean().optional(),
    sharedPrimitives: z.array(z.string()),
    contractsExercised: z.array(z.string()),
    riskTier: RiskTierSchema,
    riskRationale: z.string().min(1),
    coverageMode: CoverageModeSchema,
    verificationVariants: z.array(VerificationVariantSchema).min(1),
    implementationStatus: ImplementationStatusSchema,
    qaStatus: QaStatusSchema,
    defectRefs: z.array(z.string()),
    blockerReason: z.string().optional(),
  })
  .superRefine((entry, ctx) => {
    const isDynamic = entry.routePattern.includes(":");
    const unresolvedFixture =
      typeof entry.fixtureUrl === "string" &&
      entry.fixtureUrl
        .split(/[/?&=]/)
        .some((segment) => segment.startsWith(":"));
    if (isDynamic && unresolvedFixture) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dynamic fixtureUrl cannot contain route parameters",
        path: ["fixtureUrl"],
      });
    }
    if (isDynamic && entry.fixtureUrl === null) {
      const variantsBlocked = entry.verificationVariants.every(
        (variant) =>
          variant.qaStatus === "blocked" &&
          typeof variant.blockerReason === "string",
      );
      if (
        entry.qaStatus !== "blocked" ||
        typeof entry.blockerReason !== "string" ||
        !variantsBlocked
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A dynamic route without fixtureUrl must be blocked at route and variant level",
          path: ["fixtureUrl"],
        });
      }
    }
    if (!isDynamic && entry.fixtureUrl === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Static routes require fixtureUrl",
        path: ["fixtureUrl"],
      });
    }
    const variantIds = entry.verificationVariants.map((variant) => variant.id);
    if (new Set(variantIds).size !== variantIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate verification variant on ${entry.routePattern}`,
        path: ["verificationVariants"],
      });
    }
    const requiredByRoute: Record<string, string[]> = {
      "/finances/student-payments": [
        "shared-shell",
        "resource-table",
        "glide",
      ],
      "/finances/student-payments/transaction-lookup": [
        "shared-shell",
        "resource-table",
        "glide",
      ],
      "/courses/:id/student-payments": [
        "shared-shell",
        "resource-table",
        "glide",
      ],
      "/finances/recent-transactions": ["default", "glide"],
    };
    const required = requiredByRoute[entry.routePattern];
    if (
      required &&
      JSON.stringify([...variantIds].sort()) !==
        JSON.stringify([...required].sort())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Incorrect verification variants for ${entry.routePattern}`,
        path: ["verificationVariants"],
      });
    }
  });

export const RouteManifestFileSchema = z
  .object({
    version: z.literal(1),
    generatedAt: z.string().datetime(),
    baseSha: z.string().min(7),
    entries: z.array(RouteManifestEntrySchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seenPatterns = new Set<string>();
    const seenPages = new Set<string>();
    for (const entry of file.entries) {
      if (seenPatterns.has(entry.routePattern)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate routePattern: ${entry.routePattern}`,
        });
        return;
      }
      seenPatterns.add(entry.routePattern);
      if (seenPages.has(entry.pagePath)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate pagePath: ${entry.pagePath}`,
        });
        return;
      }
      seenPages.add(entry.pagePath);
    }
  });

export type RouteFamily = z.infer<typeof RouteFamilySchema>;
export type CoverageMode = z.infer<typeof CoverageModeSchema>;
export type VerificationVariantId = z.infer<
  typeof VerificationVariantIdSchema
>;
export type VerificationVariant = z.infer<typeof VerificationVariantSchema>;
export type RouteQaEvidence = z.infer<typeof RouteQaEvidenceSchema>;
export type RiskTier = z.infer<typeof RiskTierSchema>;
export type RouteManifestEntry = z.infer<typeof RouteManifestEntrySchema>;
export type RouteManifestFile = z.infer<typeof RouteManifestFileSchema>;

export const RouteManifestExclusionsSchema = z.object({
  excludedPagePaths: z.array(z.string()),
  excludedReasons: z.record(z.string(), z.string()),
});

export const RouteFixtureOverridesSchema = z.record(
  z.string().startsWith("/"),
  z.string().startsWith("/"),
);

export type RouteManifestExclusions = z.infer<
  typeof RouteManifestExclusionsSchema
>;
export type RouteFixtureOverrides = z.infer<
  typeof RouteFixtureOverridesSchema
>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/ui-remediation/__tests__/route-manifest-schema.test.ts -v`  
Expected: PASS — the schema test file exits 0 with zero failed tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui-remediation/route-manifest-schema.ts src/lib/ui-remediation/__tests__/route-manifest-schema.test.ts
git commit -m "feat(ui-remediation): add route manifest zod schema"
```

---

### Task 2: Route manifest classifier

**Files:**
- Create: `src/lib/ui-remediation/route-manifest-classifier.ts`
- Test: `src/lib/ui-remediation/__tests__/route-manifest-classifier.test.ts`

- [ ] **Step 1: Write the failing classifier test**

```typescript
import { describe, it, expect } from "vitest";
import {
  classifyRouteFamily,
  classifyRiskTier,
  classifyCoverageMode,
  classifyVerificationVariants,
  toRoutePattern,
} from "../route-manifest-classifier";
import type { RouteFamily } from "../route-manifest-schema";

describe("toRoutePattern", () => {
  it("converts app path to route pattern", () => {
    expect(
      toRoutePattern("src/app/(internal)/users/[id]/edit/page.tsx"),
    ).toBe("/users/:id/edit");
  });

  it("converts public auth path", () => {
    expect(
      toRoutePattern("src/app/(public)/(auth)/login/page.tsx"),
    ).toBe("/login");
  });

  it("converts the root page to slash", () => {
    expect(toRoutePattern("src/app/page.tsx")).toBe("/");
  });
});

describe("classifyRouteFamily", () => {
  it("classifies login as global-shell-auth-public", () => {
    expect(
      classifyRouteFamily("src/app/(public)/(auth)/login/page.tsx"),
    ).toBe("global-shell-auth-public");
  });

  it("classifies management dashboard as home-dashboard-analytics", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/management/dashboard/page.tsx",
      ),
    ).toBe("home-dashboard-analytics");
  });

  it("classifies campuses list as administration-crud", () => {
    expect(
      classifyRouteFamily("src/app/(internal)/campuses/page.tsx"),
    ).toBe("administration-crud");
  });

  it("classifies course edit as courses-attendance-scheduling", () => {
    expect(
      classifyRouteFamily("src/app/(internal)/courses/[id]/edit/page.tsx"),
    ).toBe("courses-attendance-scheduling");
  });

  it("classifies quizzes-v3 as quizzes-docs-content-services", () => {
    expect(
      classifyRouteFamily("src/app/(internal)/quizzes-v3/page.tsx"),
    ).toBe("quizzes-docs-content-services");
  });

  it("classifies help docs as quizzes-docs-content-services", () => {
    expect(
      classifyRouteFamily("src/app/(docs)/help/[slug]/page.tsx"),
    ).toBe("quizzes-docs-content-services");
  });

  it("classifies finances payroll as finance-operations", () => {
    expect(
      classifyRouteFamily("src/app/(internal)/finances/payroll/page.tsx"),
    ).toBe("finance-operations");
  });

  it("classifies student-payments index as student-payments", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/finances/student-payments/page.tsx",
      ),
    ).toBe("student-payments");
  });

  it("classifies transaction lookup as student-payments", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/finances/student-payments/transaction-lookup/page.tsx",
      ),
    ).toBe("student-payments");
  });

  it("classifies course student payments as student-payments", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/courses/[id]/student-payments/page.tsx",
      ),
    ).toBe("student-payments");
  });

  it("classifies upload as payment-upload-verification", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/finances/student-payments/upload/page.tsx",
      ),
    ).toBe("payment-upload-verification");
  });
});

describe("classifyRiskTier", () => {
  it("marks student-payments upload as high", () => {
    expect(
      classifyRiskTier(
        "payment-upload-verification",
        "/finances/student-payments/upload",
      ),
    ).toBe("high");
  });

  it("marks library as low", () => {
    expect(
      classifyRiskTier(
        "quizzes-docs-content-services",
        "/library",
      ),
    ).toBe("low");
  });
});

describe("classifyVerificationVariants", () => {
  it.each([
    "/finances/student-payments",
    "/finances/student-payments/transaction-lookup",
    "/courses/:id/student-payments",
  ])("assigns shell, ResourceTable, and Glide to %s", (routePattern) => {
    expect(
      classifyVerificationVariants(routePattern).map((variant) => variant.id),
    ).toEqual(["shared-shell", "resource-table", "glide"]);
  });

  it("assigns default and Glide to recent transactions", () => {
    expect(
      classifyVerificationVariants("/finances/recent-transactions").map(
        (variant) => variant.id,
      ),
    ).toEqual(["default", "glide"]);
  });

  it("assigns default to ordinary routes", () => {
    expect(
      classifyVerificationVariants("/campuses").map((variant) => variant.id),
    ).toEqual(["default"]);
  });
});

describe("classifyCoverageMode", () => {
  it("marks the first low-risk route per family as representative", () => {
    const routes: Array<{
      routePattern: string;
      routeFamily: RouteFamily;
    }> = [
      {
        routePattern: "/campuses",
        routeFamily: "administration-crud",
      },
      {
        routePattern: "/library",
        routeFamily: "quizzes-docs-content-services",
      },
    ];
    const modes = routes.map((r) =>
      classifyCoverageMode(r, routes, new Set()),
    );
    expect(modes.every((m) => m === "representative")).toBe(true);
  });

  it("marks automated smoke-covered routes as automated", () => {
    const route = {
      routePattern: "/finances/student-payments",
      routeFamily: "student-payments" as RouteFamily,
    };
    const allRoutes = [route];
    const automatedSmokePatterns = new Set(["/finances/student-payments"]);
    expect(classifyCoverageMode(route, allRoutes, automatedSmokePatterns)).toBe(
      "automated",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/ui-remediation/__tests__/route-manifest-classifier.test.ts -v`  
Expected: FAIL — cannot find module `../route-manifest-classifier`

- [ ] **Step 3: Write classifier implementation**

```typescript
import type {
  CoverageMode,
  RouteFamily,
  RiskTier,
  VerificationVariantId,
} from "./route-manifest-schema";

export type VerificationVariantPlan = {
  id: VerificationVariantId;
  implementationPlan: string;
  implementationOwner: string;
  qaOwner: string;
};

const FAMILY_IMPLEMENTATION_MAP: Record<
  RouteFamily,
  { owner: string; plan: string; qaOwner: string }
> = {
  "global-shell-auth-public": {
    owner: "R6",
    plan: "2026-07-12-ui-remediation-r6-global-auth-public.md",
    qaOwner: "R15-QA1",
  },
  "home-dashboard-analytics": {
    owner: "R7",
    plan: "2026-07-12-ui-remediation-r7-home-dashboards-reporting.md",
    qaOwner: "R15-QA2",
  },
  "administration-crud": {
    owner: "R8",
    plan: "2026-07-12-ui-remediation-r8-administration-crud.md",
    qaOwner: "R15-QA3",
  },
  "courses-attendance-scheduling": {
    owner: "R9",
    plan: "2026-07-12-ui-remediation-r9-courses-attendance-scheduling.md",
    qaOwner: "R15-QA4",
  },
  "quizzes-docs-content-services": {
    owner: "R10",
    plan: "2026-07-12-ui-remediation-r10-content-quizzes-services.md",
    qaOwner: "R15-QA5",
  },
  "finance-operations": {
    owner: "R11",
    plan: "2026-07-12-ui-remediation-r11-finance-operations.md",
    qaOwner: "R15-QA6",
  },
  "student-payments": {
    owner: "R12",
    plan: "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
    qaOwner: "R15-QA7",
  },
  "payment-upload-verification": {
    owner: "R14",
    plan: "2026-07-12-ui-remediation-r14-payment-upload-verification.md",
    qaOwner: "R15-QA10",
  },
};

export function toRoutePattern(pagePath: string): string {
  const normalized = pagePath
    .replace(/^src\/app\//, "")
    .replace(/(^|\/)page\.tsx$/, "")
    .replace(/^\([^)]+\)\//g, "")
    .replace(/\([^)]+\)\//g, "");
  const segments = normalized.split("/").filter(Boolean);
  const patternSegments = segments.map((seg) =>
    seg.startsWith("[") && seg.endsWith("]") ? `:${seg.slice(1, -1)}` : seg,
  );
  return patternSegments.length === 0 ? "/" : "/" + patternSegments.join("/");
}

export function classifyRouteFamily(pagePath: string): RouteFamily {
  const pattern = toRoutePattern(pagePath);

  if (
    pagePath.includes("/(public)/") ||
    pagePath === "src/app/page.tsx" ||
    pattern === "/search" ||
    pattern === "/notifications" ||
    pattern.startsWith("/login") ||
    pattern.startsWith("/register") ||
    pattern.startsWith("/forgot-password") ||
    pattern.startsWith("/reset-password")
  ) {
    return "global-shell-auth-public";
  }

  if (
    pattern.startsWith("/management/") ||
    pattern.startsWith("/shortcuts/") ||
    pattern === "/home" ||
    pattern.includes("analytics") ||
    pattern.includes("dashboard")
  ) {
    return "home-dashboard-analytics";
  }

  if (pattern.startsWith("/finances/student-payments/upload") ||
      pattern.startsWith("/finances/student-payments/verification-upload") ||
      pattern.startsWith("/finances/student-payments/coverage-review")) {
    return "payment-upload-verification";
  }

  if (
    pattern === "/finances/student-payments" ||
    pattern === "/finances/student-payments/transaction-lookup" ||
    pattern === "/courses/:id/student-payments"
  ) {
    return "student-payments";
  }

  if (pattern.startsWith("/finances/")) {
    return "finance-operations";
  }

  if (
    pattern.startsWith("/courses/") ||
    pattern.startsWith("/attendance/") ||
    pattern.includes("/marking") ||
    pattern.startsWith("/calendar")
  ) {
    return "courses-attendance-scheduling";
  }

  if (
    pattern.startsWith("/quizzes") ||
    pattern.startsWith("/take/") ||
    pattern.startsWith("/library") ||
    pattern.startsWith("/news") ||
    pattern.startsWith("/announcements") ||
    pattern.startsWith("/certificates") ||
    pattern.startsWith("/services/") ||
    pattern.startsWith("/forms") ||
    pattern.startsWith("/help") ||
    pattern.startsWith("/platform/docs")
  ) {
    return "quizzes-docs-content-services";
  }

  return "administration-crud";
}

export function classifyRiskTier(
  routeFamily: RouteFamily,
  routePattern: string,
): RiskTier {
  if (
    routeFamily === "payment-upload-verification" ||
    routeFamily === "student-payments" ||
    routeFamily === "finance-operations" ||
    routeFamily === "global-shell-auth-public"
  ) {
    return "high";
  }

  if (
    routeFamily === "courses-attendance-scheduling" ||
    routePattern.includes("/edit") ||
    routePattern.includes("/create")
  ) {
    return "medium";
  }

  return "low";
}

export function classifyCoverageMode(
  route: { routePattern: string; routeFamily: RouteFamily },
  allRoutes: Array<{ routePattern: string; routeFamily: RouteFamily }>,
  automatedSmokePatterns: Set<string>,
): CoverageMode {
  if (automatedSmokePatterns.has(route.routePattern)) {
    return "automated";
  }

  if (
    classifyRiskTier(route.routeFamily, route.routePattern) === "high"
  ) {
    return "automated";
  }

  const familyRoutes = allRoutes
    .filter((r) => r.routeFamily === route.routeFamily)
    .map((r) => r.routePattern)
    .sort();
  if (familyRoutes[0] === route.routePattern) {
    return "representative";
  }

  return "manual";
}

export function getImplementationMeta(family: RouteFamily) {
  return FAMILY_IMPLEMENTATION_MAP[family];
}

const RESOURCE_TABLE_VARIANT: VerificationVariantPlan = {
  id: "resource-table",
  implementationPlan:
    "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
  implementationOwner: "R12",
  qaOwner: "R15-QA8",
};

const GLIDE_VARIANT: VerificationVariantPlan = {
  id: "glide",
  implementationPlan: "2026-07-12-ui-remediation-r13-student-payments-glide.md",
  implementationOwner: "R13",
  qaOwner: "R15-QA9",
};

export function classifyVerificationVariants(
  routePattern: string,
  classifiedFamily?: RouteFamily,
): VerificationVariantPlan[] {
  const studentPaymentRoutes = new Set([
    "/finances/student-payments",
    "/finances/student-payments/transaction-lookup",
    "/courses/:id/student-payments",
  ]);

  if (studentPaymentRoutes.has(routePattern)) {
    return [
      {
        id: "shared-shell",
        implementationPlan:
          "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
        implementationOwner: "R12",
        qaOwner: "R15-QA7",
      },
      RESOURCE_TABLE_VARIANT,
      GLIDE_VARIANT,
    ];
  }

  if (routePattern === "/finances/recent-transactions") {
    return [
      {
        id: "default",
        implementationPlan:
          "2026-07-12-ui-remediation-r11-finance-operations.md",
        implementationOwner: "R11",
        qaOwner: "R15-QA6",
      },
      GLIDE_VARIANT,
    ];
  }

  const family = classifiedFamily ?? classifyRouteFamily(routePattern);
  const meta = getImplementationMeta(family);
  return [
    {
      id: "default",
      implementationPlan: meta.plan,
      implementationOwner: meta.owner,
      qaOwner: meta.qaOwner,
    },
  ];
}

export function slugifyRoutePattern(routePattern: string): string {
  return routePattern.replace(/^\//, "").replace(/[:/]/g, "-") || "root";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/ui-remediation/__tests__/route-manifest-classifier.test.ts -v`  
Expected: PASS — the classifier test file exits 0 with zero failed tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui-remediation/route-manifest-classifier.ts src/lib/ui-remediation/__tests__/route-manifest-classifier.test.ts
git commit -m "feat(ui-remediation): add route family classifier"
```

---

### Task 3: Route manifest generator

**Files:**
- Create: `src/lib/ui-remediation/route-manifest-generator.ts`
- Create: `scripts/ui-remediation/generate-route-manifest.ts`
- Create: `docs/ui-remediation/route-manifest-exclusions.json`
- Create: `docs/ui-remediation/route-fixtures.json`
- Test: `src/lib/ui-remediation/__tests__/route-manifest-generator.test.ts`

- [ ] **Step 1: Write exclusions file**

Create `docs/ui-remediation/route-manifest-exclusions.json`:

```json
{
  "excludedPagePaths": [
    "src/app/(design)/components/page.tsx",
    "src/app/(design)/components/color/page.tsx",
    "src/app/(design)/components/type/page.tsx",
    "src/app/(design)/components/bilingual/page.tsx"
  ],
  "excludedReasons": {
    "src/app/(design)/components/page.tsx": "Design system sandbox",
    "src/app/(design)/components/color/page.tsx": "Design system sandbox",
    "src/app/(design)/components/type/page.tsx": "Design system sandbox",
    "src/app/(design)/components/bilingual/page.tsx": "Design system sandbox",
    "src/app/debug": "Debug surfaces — prefix exclusion",
    "src/app/artifacts": "Internal artifacts — prefix exclusion",
    "src/app/api": "API routes — prefix exclusion"
  }
}
```

- [ ] **Step 2: Write the initial route fixture registry**

Create `docs/ui-remediation/route-fixtures.json`:

```json
{}
```

An empty registry is valid for inventory generation: dynamic entries become explicit blockers. Before a blocked route's QA cohort starts, the fixture owner adds a real mapping such as a route pattern key and a concrete URL observed in the seeded test tenant; synthetic IDs are forbidden.

- [ ] **Step 3: Write the failing generator test**

```typescript
import { describe, it, expect } from "vitest";
import { generateRouteManifest } from "../route-manifest-generator";
import { RouteManifestFileSchema } from "../route-manifest-schema";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

describe("generateRouteManifest", () => {
  it("returns a valid manifest with unique route patterns", () => {
    const manifest = generateRouteManifest({
      repoRoot: REPO_ROOT,
      baseSha: "05ac447b",
      automatedSmokePatterns: new Set(["/finances/student-payments"]),
      fixtureOverrides: {
        "/users/:id": "/users/42",
        "/courses/:id": "/courses/fixture-course-1",
      },
    });
    const parsed = RouteManifestFileSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
    expect(manifest.entries.length).toBeGreaterThan(50);
  });

  it("excludes design routes", () => {
    const manifest = generateRouteManifest({
      repoRoot: REPO_ROOT,
      baseSha: "05ac447b",
      automatedSmokePatterns: new Set(),
      fixtureOverrides: {},
    });
    const patterns = manifest.entries.map((e) => e.pagePath);
    expect(patterns.some((p) => p.includes("/(design)/"))).toBe(false);
  });

  it("assigns every route exactly one route family", () => {
    const manifest = generateRouteManifest({
      repoRoot: REPO_ROOT,
      baseSha: "05ac447b",
      automatedSmokePatterns: new Set(),
      fixtureOverrides: {},
    });
    for (const entry of manifest.entries) {
      expect(entry.routeFamily.length).toBeGreaterThan(0);
      expect(entry.verificationVariants.length).toBeGreaterThan(0);
    }
  });

  it("keeps real student-payment pages unique and assigns mode variants", () => {
    const manifest = generateRouteManifest({
      repoRoot: REPO_ROOT,
      baseSha: "05ac447b",
      automatedSmokePatterns: new Set(),
      fixtureOverrides: {
        "/courses/:id/student-payments":
          "/courses/fixture-course-1/student-payments",
      },
    });
    const expected = new Map([
      [
        "/finances/student-payments",
        "src/app/(internal)/finances/student-payments/page.tsx",
      ],
      [
        "/finances/student-payments/transaction-lookup",
        "src/app/(internal)/finances/student-payments/transaction-lookup/page.tsx",
      ],
      [
        "/courses/:id/student-payments",
        "src/app/(internal)/courses/[id]/student-payments/page.tsx",
      ],
    ]);

    for (const [routePattern, pagePath] of expected) {
      const matches = manifest.entries.filter(
        (entry) => entry.routePattern === routePattern,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].pagePath).toBe(pagePath);
      expect(
        matches[0].verificationVariants.map((variant) => variant.id),
      ).toEqual(["shared-shell", "resource-table", "glide"]);
    }

  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/ui-remediation/__tests__/route-manifest-generator.test.ts -v`  
Expected: FAIL — cannot find module `../route-manifest-generator`

- [ ] **Step 5: Write generator implementation**

```typescript
import fs from "node:fs";
import path from "node:path";
import { ruleForPath } from "@/config/route-permissions";
import {
  RouteManifestFileSchema,
  RouteManifestExclusionsSchema,
  type RouteManifestEntry,
  type RouteManifestFile,
} from "./route-manifest-schema";
import {
  classifyRouteFamily,
  classifyRiskTier,
  classifyCoverageMode,
  classifyVerificationVariants,
  slugifyRoutePattern,
  toRoutePattern,
} from "./route-manifest-classifier";

export type GenerateOptions = {
  repoRoot: string;
  baseSha: string;
  automatedSmokePatterns: Set<string>;
  fixtureOverrides: Record<string, string>;
};

function walkPageFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkPageFiles(full, results);
    } else if (entry.name === "page.tsx") {
      results.push(full);
    }
  }
  return results;
}

function isExcluded(
  pagePath: string,
  exclusions: string[],
  repoRoot: string,
): boolean {
  const rel = path.relative(repoRoot, pagePath).replace(/\\/g, "/");
  for (const excl of exclusions) {
    if (rel === excl || rel.startsWith(excl.replace(/\/page\.tsx$/, ""))) {
      return true;
    }
  }
  if (rel.includes("/debug/") || rel.includes("/artifacts/") || rel.includes("/api/")) {
    return true;
  }
  return false;
}

function defaultFixtureUrl(routePattern: string): string | null {
  return routePattern.includes(":") ? null : routePattern;
}

function resolvePersonas(
  routePattern: string,
  pagePath: string,
): string[] {
  const rule = ruleForPath(routePattern);
  if (pagePath.includes("/(public)/") || rule?.public) return ["anonymous"];
  if (rule?.authedOnly) return ["admin", "teacher", "student"];
  if (routePattern.startsWith("/finances")) return ["admin", "teacher"];
  if (routePattern.startsWith("/take/")) return ["student"];
  return ["admin", "teacher"];
}

function resolvePermissions(routePattern: string): string[] {
  const rule = ruleForPath(routePattern);
  return rule?.anyOf ?? [];
}

function buildEntry(
  pagePath: string,
  options: GenerateOptions,
): RouteManifestEntry {
  const relPagePath = path.relative(options.repoRoot, pagePath).replace(/\\/g, "/");
  const routePattern = toRoutePattern(relPagePath);
  const routeFamily = classifyRouteFamily(relPagePath);
  const fixtureUrl =
    options.fixtureOverrides[routePattern] ?? defaultFixtureUrl(routePattern);
  const fixtureBlocker =
    fixtureUrl === null
      ? `No concrete fixture URL configured for ${routePattern}`
      : undefined;
  const routeSlug = slugifyRoutePattern(routePattern);
  const verificationVariants = classifyVerificationVariants(
    routePattern,
    routeFamily,
  ).map((variant) => ({
      ...variant,
      qaStatus: fixtureBlocker ? ("blocked" as const) : ("pending" as const),
      evidencePath:
        `docs/ui-remediation/qa-evidence/${variant.qaOwner.toLowerCase()}-${variant.id}/` +
        `${routeSlug}/${variant.id}/`,
      ...(fixtureBlocker ? { blockerReason: fixtureBlocker } : {}),
    }),
  );
  const variantIds = new Set(
    verificationVariants.map((variant) => variant.id),
  );
  const sharedPrimitives = ["PageContainer"];
  const contractsExercised = ["page-layout"];
  if (variantIds.has("shared-shell")) {
    sharedPrimitives.push("StudentPaymentsReportShell");
    contractsExercised.push("student-payments-shell");
  }
  if (variantIds.has("resource-table")) {
    sharedPrimitives.push("ResourceTable");
    contractsExercised.push("table");
  }
  if (variantIds.has("glide")) {
    sharedPrimitives.push("StudentPaymentsGrid");
    contractsExercised.push("glide-grid");
  }

  return {
    routePattern,
    pagePath: relPagePath,
    fixtureUrl,
    routeFamily,
    personas: resolvePersonas(routePattern, relPagePath),
    requiredPermissions: resolvePermissions(routePattern),
    fixtureSetup:
      fixtureUrl === null
        ? `Configure fixtureOverrides["${routePattern}"] with a seeded, permission-valid URL`
        : `Navigate to ${fixtureUrl} with seeded tenant data`,
    primaryTheme: "light",
    primaryViewport: { width: 1280, height: 800 },
    mobileLayoutDiffers: routeFamily === "student-payments",
    darkLayoutDiffers: false,
    sharedPrimitives,
    contractsExercised,
    riskTier: classifyRiskTier(routeFamily, routePattern),
    riskRationale: `Classified from family ${routeFamily} and pattern ${routePattern}`,
    coverageMode: "manual",
    verificationVariants,
    implementationStatus: "pending",
    qaStatus: fixtureBlocker ? "blocked" : "pending",
    defectRefs: [],
    ...(fixtureBlocker ? { blockerReason: fixtureBlocker } : {}),
  };
}

export function generateRouteManifest(options: GenerateOptions): RouteManifestFile {
  const exclusionsPath = path.join(
    options.repoRoot,
    "docs/ui-remediation/route-manifest-exclusions.json",
  );
  const exclusionsRaw = JSON.parse(fs.readFileSync(exclusionsPath, "utf8"));
  const exclusions = RouteManifestExclusionsSchema.parse(exclusionsRaw);

  const appDir = path.join(options.repoRoot, "src/app");
  const pageFiles = walkPageFiles(appDir).filter(
    (p) => !isExcluded(p, exclusions.excludedPagePaths, options.repoRoot),
  );

  const preliminary = pageFiles.map((pagePath) => {
    const rel = path.relative(options.repoRoot, pagePath).replace(/\\/g, "/");
    const routePattern = toRoutePattern(rel);
    const routeFamily = classifyRouteFamily(rel);
    return { routePattern, routeFamily };
  });

  const entries = pageFiles.map((pagePath) => {
    const entry = buildEntry(pagePath, options);
    entry.coverageMode = classifyCoverageMode(
      { routePattern: entry.routePattern, routeFamily: entry.routeFamily },
      preliminary,
      options.automatedSmokePatterns,
    );
    return entry;
  });

  const manifest: RouteManifestFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseSha: options.baseSha,
    entries: entries.sort((a, b) => a.routePattern.localeCompare(b.routePattern)),
  };

  return RouteManifestFileSchema.parse(manifest);
}

export function writeRouteManifest(
  options: GenerateOptions,
  outputPath?: string,
): RouteManifestFile {
  const manifest = generateRouteManifest(options);
  const out =
    outputPath ??
    path.join(options.repoRoot, "docs/ui-remediation/route-manifest.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
```

- [ ] **Step 6: Write CLI script**

Create `scripts/ui-remediation/generate-route-manifest.ts`:

```typescript
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeRouteManifest } from "../../src/lib/ui-remediation/route-manifest-generator";
import { RouteFixtureOverridesSchema } from "../../src/lib/ui-remediation/route-manifest-schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const baseSha = process.env.MANIFEST_BASE_SHA ?? execSync("git rev-parse HEAD", {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();

const automatedSmokePatterns = new Set<string>([
  "/finances/student-payments",
  "/finances/student-payments/transaction-lookup",
  "/courses/:id/student-payments",
  "/finances/student-payments/upload",
  "/login",
]);

const fixtureOverrides = RouteFixtureOverridesSchema.parse(
  JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "docs/ui-remediation/route-fixtures.json"),
      "utf8",
    ),
  ),
);

const manifest = writeRouteManifest({
  repoRoot,
  baseSha,
  automatedSmokePatterns,
  fixtureOverrides,
});

const blockedRoutes = manifest.entries.filter(
  (entry) => entry.qaStatus === "blocked",
).length;
console.log(
  `Wrote ${manifest.entries.length} routes (${blockedRoutes} blocked fixtures) to docs/ui-remediation/route-manifest.json`,
);
```

- [ ] **Step 7: Add package.json script**

Modify `package.json` scripts section to add:

```json
"generate:route-manifest": "npx tsx scripts/ui-remediation/generate-route-manifest.ts"
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/ui-remediation/__tests__/route-manifest-generator.test.ts -v`  
Expected: PASS — the generator test file exits 0 with zero failed tests.

- [ ] **Step 9: Generate manifest**

Run: `cd schedjuice-reimagined-fe && npm run generate:route-manifest`  
Expected: stdout starts with `Wrote ` and ends with ` to docs/ui-remediation/route-manifest.json`; the route count is greater than 200. A nonzero blocked-fixture count is an actionable R15 inventory result, and every blocked dynamic route must receive a concrete `fixtureOverrides` entry before its QA cohort starts.

- [ ] **Step 10: Commit**

```bash
git add src/lib/ui-remediation/route-manifest-generator.ts scripts/ui-remediation/generate-route-manifest.ts docs/ui-remediation/route-manifest-exclusions.json docs/ui-remediation/route-fixtures.json docs/ui-remediation/route-manifest.json src/lib/ui-remediation/__tests__/route-manifest-generator.test.ts package.json
git commit -m "feat(ui-remediation): add route manifest generator"
```

---

### Task 4: Manual QA cohort execution (R15-QA1–R15-QA10)

**Files:**
- Create: `docs/ui-remediation/qa-evidence/README.md`
- Create: per-cohort evidence directories under `docs/ui-remediation/qa-evidence/`
- Create: `scripts/ui-remediation/sync-route-qa-status.ts`

- [ ] **Step 1: Write QA evidence README**

Create `docs/ui-remediation/qa-evidence/README.md`:

```markdown
# R15 QA Evidence Store

Each route variant verified by an independent QA subagent writes evidence JSON here.
QA agents do not patch product code.

Directory layout:
`{cohort-id}-{variant-id}/{route-slug}/{variant-id}/evidence.json`

Required fields: see R15 plan Evidence format section.
```

- [ ] **Step 2: Run drift check before QA**

```bash
cd schedjuice-reimagined-fe
git fetch origin
INTEGRATED_SHA=$(git rev-parse origin/dev)
echo "QA target SHA: $INTEGRATED_SHA"
git diff --name-only 05ac447b..$INTEGRATED_SHA -- docs/ui-remediation/route-manifest.json
MANIFEST_BASE_SHA="$INTEGRATED_SHA" npm run generate:route-manifest
INTEGRATED_SHA="$INTEGRATED_SHA" node -e '
const manifest = require("./docs/ui-remediation/route-manifest.json");
if (manifest.baseSha !== process.env.INTEGRATED_SHA) {
  throw new Error(`Manifest SHA ${manifest.baseSha} does not match ${process.env.INTEGRATED_SHA}`);
}
'
```

Expected: the manifest is regenerated from the integrated source tree, `baseSha` exactly equals `INTEGRATED_SHA`, and every new or removed `page.tsx` is reflected before QA starts.

- [ ] **Step 3: Dispatch R15-QA1 — global-shell-auth-public**

Filter manifest: `routeFamily === "global-shell-auth-public"`

Manual checks per route:
1. Page loads without horizontal document overflow at 1280x800 and 390x844.
2. Auth routes render correct light/dark token contrast under `.sj-root`.
3. Global find, notifications, and shell overlays: dropdowns clickable, not clipped.
4. Login/forgot-password/reset-password: form controls use contextual width, not crushed `max-w-xl`.

Run the complete browser gate:
`npm run test:browser`

Expected: exit 0 with every configured browser test passing. Skipped tests, focused tests, grep filters, project filters, and route-specific subsets are not acceptable.

Write one schema-valid `evidence.json` for the selected `default` variant of every route. Task 4 Step 13 synchronizes variant and route status from those files.

- [ ] **Step 4: Dispatch R15-QA2 — home-dashboard-analytics**

Filter manifest: `routeFamily === "home-dashboard-analytics"`

Manual checks: page title serif scale, dashboard card hierarchy, chart/table overflow, sticky headers inside containers.

Run: `npm run test:browser`  
Expected: exit 0 with zero failed or skipped browser tests.

- [ ] **Step 5: Dispatch R15-QA3 — administration-crud**

Filter manifest: `routeFamily === "administration-crud"`

Manual checks: list/detail/create/edit consistency, ResourceTable horizontal scroll before column crush, overlay selects in row actions.

Run: `npm run test:browser`  
Expected: exit 0 with zero failed or skipped browser tests.

- [ ] **Step 6: Dispatch R15-QA4 — courses-attendance-scheduling**

Filter manifest: `routeFamily === "courses-attendance-scheduling"`

Manual checks: course record shell composition, attendance marking alignment, editable cells preserve save feedback space.

Run: `npm run test:browser`  
Expected: exit 0 with zero failed or skipped browser tests.

- [ ] **Step 7: Dispatch R15-QA5 — quizzes-docs-content-services**

Filter manifest: `routeFamily === "quizzes-docs-content-services"`

Manual checks: quiz take flow focus containment, rich text editor overlays, library attachment previews.

Run: `npm run test:browser`  
Expected: exit 0 with zero failed or skipped browser tests.

- [ ] **Step 8: Dispatch R15-QA6 — finance-operations**

Filter manifest: `routeFamily === "finance-operations"`

Manual checks: payroll tables, rate editors, cash-flow charts — numeric column alignment, no pointer-event interception.

Roles: admin required; teacher only where permissions allow.

Run: `npm run test:browser`  
Expected: exit 0 with zero failed or skipped browser tests.

- [ ] **Step 9: Dispatch R15-QA7 — student-payments shared shell**

Filter manifest entries where `verificationVariants.some((variant) => variant.id === "shared-shell")`. The selected real routes are `/finances/student-payments`, `/finances/student-payments/transaction-lookup`, and `/courses/:id/student-payments`.

Manual checks: shared filters, toolbar wrapping, month selector, view mode toggle, screenshot preview pane collapse.

Roles: admin and teacher without `payment.view_all`.

Run: `npm run test:browser`  
Expected: exit 0 with zero failed or skipped browser tests.

- [ ] **Step 10: Dispatch R15-QA8 — ResourceTable mode**

Filter manifest entries where `verificationVariants.some((variant) => variant.id === "resource-table")`. For each selected real route, click the button named `Revert to original` when it is present, then require a button named `Try the new look` before beginning ResourceTable checks. Do not navigate to a synthetic path.

Manual checks: inline edit optimistic save, column minimum widths, payment status select overlay geometry.

Run: `npm run test:browser`  
Expected: exit 0 with zero failed or skipped browser tests.

- [ ] **Step 11: Dispatch R15-QA9 — Glide mode**

Filter manifest entries where `verificationVariants.some((variant) => variant.id === "glide")`. For each selected real route, click the button named `Try the new look` when it is present, then require a button named `Revert to original` before beginning Glide checks. For `/finances/recent-transactions`, this verifies the component's `variant="recent-transactions"` presentation. Do not navigate to a synthetic path.

Manual checks: Glide scroll container, hover preview performance, click-to-preview, no stale flash on save.

Run: `npm run test:browser`  
Expected: exit 0 with zero failed or skipped browser tests.

- [ ] **Step 12: Dispatch R15-QA10 — payment-upload-verification**

Filter manifest: `routeFamily === "payment-upload-verification"`

Manual checks: multipart upload flow, OCR preview, verification-upload coverage review, and upload-related overlays. Transaction lookup belongs to the real student-payments entry and is exercised by R15-QA7–R15-QA9.

Roles: admin with `payment.record` and `payment.view_all`.

Run: `npm run test:browser`  
Expected: exit 0 with zero failed or skipped browser tests.

- [ ] **Step 13: Write route and variant QA status synchronizer**

Create `scripts/ui-remediation/sync-route-qa-status.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import {
  RouteManifestFileSchema,
  RouteQaEvidenceSchema,
} from "../../src/lib/ui-remediation/route-manifest-schema";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const manifestPath = path.join(
  repoRoot,
  "docs/ui-remediation/route-manifest.json",
);
const manifest = RouteManifestFileSchema.parse(
  JSON.parse(fs.readFileSync(manifestPath, "utf8")),
);

for (const entry of manifest.entries) {
  for (const variant of entry.verificationVariants) {
    const evidenceFile = path.join(
      repoRoot,
      variant.evidencePath,
      "evidence.json",
    );
    if (!fs.existsSync(evidenceFile)) {
      variant.qaStatus = "pending";
      continue;
    }
    const evidence = RouteQaEvidenceSchema.parse(
      JSON.parse(fs.readFileSync(evidenceFile, "utf8")),
    );
    if (evidence.result === "pass") {
      variant.qaStatus = "pass";
      delete variant.blockerReason;
    } else if (evidence.result === "fail") {
      variant.qaStatus = "fail";
      delete variant.blockerReason;
    } else if (
      evidence.result === "blocked" &&
      typeof evidence.blockerReason === "string" &&
      evidence.blockerReason.length > 0
    ) {
      variant.qaStatus = "blocked";
      variant.blockerReason = evidence.blockerReason;
    } else {
      throw new Error(
        `Invalid evidence result for ${entry.routePattern} ${variant.id}`,
      );
    }
  }

  const statuses = entry.verificationVariants.map(
    (variant) => variant.qaStatus,
  );
  if (statuses.includes("fail")) {
    entry.qaStatus = "fail";
    delete entry.blockerReason;
  } else if (statuses.includes("blocked")) {
    entry.qaStatus = "blocked";
    entry.blockerReason = entry.verificationVariants
      .map((variant) => variant.blockerReason)
      .filter((reason): reason is string => typeof reason === "string")
      .join("; ");
  } else if (statuses.includes("pending")) {
    entry.qaStatus = "pending";
    delete entry.blockerReason;
  } else {
    entry.qaStatus = "pass";
    delete entry.blockerReason;
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Synchronized ${manifest.entries.length} route entries`);
```

- [ ] **Step 14: Run the synchronizer**

Run: `cd schedjuice-reimagined-fe && npx tsx scripts/ui-remediation/sync-route-qa-status.ts`  
Expected: exit 0 and `Synchronized ` followed by the manifest route count. Zero route entries and zero verification variants remain `qaStatus: "pending"`.

- [ ] **Step 15: Commit QA evidence**

```bash
git add docs/ui-remediation/qa-evidence/ docs/ui-remediation/route-manifest.json scripts/ui-remediation/sync-route-qa-status.ts
git commit -m "test(ui-remediation): R15 independent route QA evidence"
```

---

## Stop conditions

| Condition | Action |
| --- | --- |
| QA subagent patches product code | Reject evidence; re-run with verify-only prompt |
| Dynamic route lacks fixture URL | Set `qaStatus: blocked`, `blockerReason` with missing seed; report to orchestrator |
| Shared-contract defect on 3+ routes in cohort | Stop cohort; route failure to R1–R5 owner per orchestration F1 |
| `generate:route-manifest` produces duplicate patterns | Fix classifier before QA |
| R6–R14 not merged | Do not start QA execution; generator Task 1–3 may proceed |
| `npm run test:browser` reports a failed, skipped, or focused test | Stop the cohort; route failure to R0 or the owning route wave; do not accept partial browser coverage |
| A mode cohort requires navigation to a mode-specific synthetic path | Stop and correct the QA selector to use the route entry's `verificationVariants` |

---

## Verification commands (R15 complete)

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/ui-remediation/__tests__/route-manifest-schema.test.ts -v
npm run test:unit -- src/lib/ui-remediation/__tests__/route-manifest-classifier.test.ts -v
npm run test:unit -- src/lib/ui-remediation/__tests__/route-manifest-generator.test.ts -v
npm run generate:route-manifest
npm run test:browser
```

Expected: all unit tests pass, the manifest writes with unique `routePattern` and `pagePath` values, the three real student-payment pages each appear once with the required variants, and the complete browser suite passes with zero failed or skipped tests.

---

## Self-review

**Spec coverage:** §7 route manifest, §9.2–9.3 verification modes, §10.2 independent QA, §10.3 failure reports — all addressed.

**Placeholder scan:** No omitted-code markers or unresolved angle-bracket placeholders remain. Every `...` token in code is legitimate JavaScript/TypeScript object spread or rest syntax.

**Type consistency:** `coverageMode` describes automation depth, `verificationVariants` describes UI modes, the classifier emits the same variant identifiers accepted by the schema, and R15-QA7–R15-QA9 filter variants rather than route families.

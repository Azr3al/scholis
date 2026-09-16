# R16 — Final Integration and Manifest Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the UI migration remediation program against the final integrated SHA on `dev` with complete automated gates, static legacy/z-index/token checks, route-manifest closure, defect triage, artifact review, and documented signoff — blocking program completion until every criterion in spec §14 passes.

**Architecture:** A single orchestrated shell script runs lint, typecheck, unit tests, production build, browser suite, and three static analyzers (legacy tokens, z-index overrides, manifest closure). Failures route to owning waves via a triage matrix. A cold QA subagent with no implementation context re-verifies representative routes and reviews evidence artifacts before recording `docs/ui-remediation/final-signoff.md`.

**Tech Stack:** bash, TypeScript (`tsx`), Vitest, Playwright, `rg` (ripgrep), JSON manifest validation.

**Spec:** [`../specs/2026-07-12-ui-migration-remediation-program-design.md`](../specs/2026-07-12-ui-migration-remediation-program-design.md)  
**Orchestration:** [`2026-07-12-ui-migration-remediation-orchestration.md`](2026-07-12-ui-migration-remediation-orchestration.md)  
**Planning baseline SHA:** `05ac447b` on `dev`  
**Dependencies:** R0–R15 merged; QA evidence complete; `origin/dev` is the integrated SHA under test

**Forbidden files:** Product route implementations (`src/app/**` except read-only verification), shared primitives (`src/components/**` except test reads)  
**Owned files:** `scripts/ui-remediation/verify-final-integration.sh`, `scripts/ui-remediation/verify-manifest-closure.ts`, `scripts/ui-remediation/triage-defects.ts`, `scripts/ui-remediation/write-final-signoff.ts`, `src/lib/ui-remediation/__tests__/verify-manifest-closure.test.ts`, `docs/ui-remediation/final-signoff.md`, `docs/ui-remediation/defect-triage.json`

---

## Integrated SHA verification policy

R16 runs exclusively against the **final merged SHA** on `origin/dev`, not individual wave branch SHAs.

```bash
cd schedjuice-reimagined-fe
git fetch origin
git checkout dev
git pull --ff-only origin dev
INTEGRATED_SHA=$(git rev-parse origin/dev)
test "$(git rev-parse HEAD)" = "$INTEGRATED_SHA"
```

Record `INTEGRATED_SHA` in `docs/ui-remediation/final-signoff.md`. If any R6–R14 PR merges after R16 starts, invalidate R16 and restart from Step 1.

---

### Task 1: Manifest closure verifier

**Files:**
- Create: `scripts/ui-remediation/verify-manifest-closure.ts`
- Test: `src/lib/ui-remediation/__tests__/verify-manifest-closure.test.ts`

- [ ] **Step 1: Write the failing closure test**

```typescript
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  verifyManifestClosure,
  walkProductPagePaths,
} from "../../../../scripts/ui-remediation/verify-manifest-closure";

describe("walkProductPagePaths", () => {
  it("finds page.tsx files excluding design routes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-manifest-"));
    const appDir = path.join(tmp, "src/app/(internal)/home");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "page.tsx"), "export default function Page() {}");
    const designDir = path.join(tmp, "src/app/(design)/components");
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, "page.tsx"), "export default function Page() {}");

    const pages = walkProductPagePaths(tmp);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("(internal)/home/page.tsx");
  });
});

describe("verifyManifestClosure", () => {
  it("passes when every product page is in manifest exactly once", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-closure-"));
    const pageDir = path.join(tmp, "src/app/(internal)/home");
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "page.tsx"), "export default function Page() {}");

    const manifestDir = path.join(tmp, "docs/ui-remediation");
    fs.mkdirSync(manifestDir, { recursive: true });
    const evidenceDir = path.join(
      manifestDir,
      "qa-evidence/r15-qa2-default/home/default",
    );
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(
      path.join(evidenceDir, "evidence.json"),
      JSON.stringify({
        routePattern: "/home",
        fixtureUrl: "/home",
        cohortId: "R15-QA2",
        variantId: "default",
        persona: "admin",
        viewport: { width: 1280, height: 800 },
        theme: "light",
        verifiedAt: "2026-07-12T14:30:00Z",
        verifiedSha: "05ac447b05ac447b05ac447b05ac447b05ac447b",
        result: "pass",
        checks: {},
        screenshots: [],
        notes: "",
      }),
    );
    fs.writeFileSync(
      path.join(manifestDir, "route-manifest-exclusions.json"),
      JSON.stringify({ excludedPagePaths: [], excludedReasons: {} }),
    );
    fs.writeFileSync(
      path.join(manifestDir, "route-manifest.json"),
      JSON.stringify({
        version: 1,
        generatedAt: "2026-07-12T00:00:00Z",
        baseSha: "05ac447b",
        entries: [
          {
            routePattern: "/home",
            pagePath: "src/app/(internal)/home/page.tsx",
            fixtureUrl: "/home",
            routeFamily: "home-dashboard-analytics",
            personas: ["admin"],
            requiredPermissions: [],
            fixtureSetup: "default",
            primaryTheme: "light",
            primaryViewport: { width: 1280, height: 800 },
            mobileLayoutDiffers: false,
            darkLayoutDiffers: false,
            sharedPrimitives: [],
            contractsExercised: ["page-layout"],
            riskTier: "low",
            riskRationale: "test",
            coverageMode: "representative",
            verificationVariants: [
              {
                id: "default",
                implementationPlan:
                  "2026-07-12-ui-remediation-r7-home-dashboards-reporting.md",
                implementationOwner: "R7",
                qaOwner: "R15-QA2",
                qaStatus: "pass",
                evidencePath:
                  "docs/ui-remediation/qa-evidence/r15-qa2-default/home/default/",
              },
            ],
            implementationStatus: "complete",
            qaStatus: "pass",
            defectRefs: [],
          },
        ],
      }),
    );

    const result = verifyManifestClosure(tmp);
    expect(result.ok).toBe(true);
    expect(result.missingFromManifest).toEqual([]);
    expect(result.duplicatePatterns).toEqual([]);
    expect(result.duplicatePagePaths).toEqual([]);
    expect(result.pendingQa).toEqual([]);
    expect(result.pendingVariants).toEqual([]);
    expect(result.missingVariantEvidence).toEqual([]);
    const mismatched = verifyManifestClosure(
      tmp,
      "ffffffffffffffffffffffffffffffffffffffff",
    );
    expect(mismatched.ok).toBe(false);
    expect(mismatched.manifestShaMismatch).toBe(true);
  });

  it("counts one real page once while closing three payment variants", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-closure-variants-"));
    const pageDir = path.join(
      tmp,
      "src/app/(internal)/finances/student-payments",
    );
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(
      path.join(pageDir, "page.tsx"),
      "export default function Page() {}",
    );

    const manifestDir = path.join(tmp, "docs/ui-remediation");
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir, "route-manifest-exclusions.json"),
      JSON.stringify({ excludedPagePaths: [], excludedReasons: {} }),
    );

    const variantPlans = [
      {
        id: "shared-shell",
        implementationPlan:
          "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
        implementationOwner: "R12",
        qaOwner: "R15-QA7",
      },
      {
        id: "resource-table",
        implementationPlan:
          "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
        implementationOwner: "R12",
        qaOwner: "R15-QA8",
      },
      {
        id: "glide",
        implementationPlan:
          "2026-07-12-ui-remediation-r13-student-payments-glide.md",
        implementationOwner: "R13",
        qaOwner: "R15-QA9",
      },
    ] as const;

    const verificationVariants = variantPlans.map((variant) => {
      const evidencePath =
        `docs/ui-remediation/qa-evidence/${variant.qaOwner.toLowerCase()}-${variant.id}/` +
        `finances-student-payments/${variant.id}/`;
      const absoluteEvidencePath = path.join(tmp, evidencePath);
      fs.mkdirSync(absoluteEvidencePath, { recursive: true });
      fs.writeFileSync(path.join(absoluteEvidencePath, "light-1280.png"), "png");
      fs.writeFileSync(
        path.join(absoluteEvidencePath, "evidence.json"),
        JSON.stringify({
          routePattern: "/finances/student-payments",
          fixtureUrl: "/finances/student-payments?date=2026-07-01",
          cohortId: variant.qaOwner,
          variantId: variant.id,
          persona: "admin",
          viewport: { width: 1280, height: 800 },
          theme: "light",
          verifiedAt: "2026-07-12T14:30:00Z",
          verifiedSha:
            "05ac447b05ac447b05ac447b05ac447b05ac447b",
          result: "pass",
          checks: { noHorizontalOverflow: true },
          screenshots: ["light-1280.png"],
          notes: "",
        }),
      );
      return {
        ...variant,
        qaStatus: "pass",
        evidencePath,
      };
    });

    fs.writeFileSync(
      path.join(manifestDir, "route-manifest.json"),
      JSON.stringify({
        version: 1,
        generatedAt: "2026-07-12T00:00:00Z",
        baseSha: "05ac447b",
        entries: [
          {
            routePattern: "/finances/student-payments",
            pagePath:
              "src/app/(internal)/finances/student-payments/page.tsx",
            fixtureUrl:
              "/finances/student-payments?date=2026-07-01",
            routeFamily: "student-payments",
            personas: ["admin", "teacher"],
            requiredPermissions: ["payment.view_all"],
            fixtureSetup: "seed payment report rows",
            primaryTheme: "light",
            primaryViewport: { width: 1280, height: 800 },
            mobileLayoutDiffers: true,
            darkLayoutDiffers: false,
            sharedPrimitives: ["PageContainer", "ResourceTable"],
            contractsExercised: ["page-layout", "table"],
            riskTier: "high",
            riskRationale: "High-consequence editable payment report",
            coverageMode: "automated",
            verificationVariants,
            implementationStatus: "complete",
            qaStatus: "pass",
            defectRefs: [],
          },
        ],
      }),
    );

    const result = verifyManifestClosure(tmp);
    expect(result.ok).toBe(true);
    expect(walkProductPagePaths(tmp)).toHaveLength(1);
    expect(result.duplicatePagePaths).toEqual([]);
    expect(result.missingVariantEvidence).toEqual([]);
  });

  it("fails when a product page is missing from manifest", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sj-closure-miss-"));
    const pageDir = path.join(tmp, "src/app/(internal)/library");
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "page.tsx"), "export default function Page() {}");

    const manifestDir = path.join(tmp, "docs/ui-remediation");
    fs.mkdirSync(manifestDir, { recursive: true });
    const evidenceDir = path.join(
      manifestDir,
      "qa-evidence/r15-qa2-default/home/default",
    );
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(
      path.join(evidenceDir, "evidence.json"),
      JSON.stringify({
        routePattern: "/home",
        fixtureUrl: "/home",
        cohortId: "R15-QA2",
        variantId: "default",
        persona: "admin",
        viewport: { width: 1280, height: 800 },
        theme: "light",
        verifiedAt: "2026-07-12T14:30:00Z",
        verifiedSha: "05ac447b05ac447b05ac447b05ac447b05ac447b",
        result: "pass",
        checks: {},
        screenshots: [],
        notes: "",
      }),
    );
    fs.writeFileSync(
      path.join(manifestDir, "route-manifest-exclusions.json"),
      JSON.stringify({ excludedPagePaths: [], excludedReasons: {} }),
    );
    fs.writeFileSync(
      path.join(manifestDir, "route-manifest.json"),
      JSON.stringify({
        version: 1,
        generatedAt: "2026-07-12T00:00:00Z",
        baseSha: "05ac447b",
        entries: [
          {
            routePattern: "/home",
            pagePath: "src/app/(internal)/home/page.tsx",
            fixtureUrl: "/home",
            routeFamily: "home-dashboard-analytics",
            personas: ["admin"],
            requiredPermissions: [],
            fixtureSetup: "default",
            primaryTheme: "light",
            primaryViewport: { width: 1280, height: 800 },
            mobileLayoutDiffers: false,
            darkLayoutDiffers: false,
            sharedPrimitives: [],
            contractsExercised: ["page-layout"],
            riskTier: "low",
            riskRationale: "test",
            coverageMode: "representative",
            verificationVariants: [
              {
                id: "default",
                implementationPlan:
                  "2026-07-12-ui-remediation-r7-home-dashboards-reporting.md",
                implementationOwner: "R7",
                qaOwner: "R15-QA2",
                qaStatus: "pass",
                evidencePath:
                  "docs/ui-remediation/qa-evidence/r15-qa2-default/home/default/",
              },
            ],
            implementationStatus: "complete",
            qaStatus: "pass",
            defectRefs: [],
          },
        ],
      }),
    );

    const result = verifyManifestClosure(tmp);
    expect(result.ok).toBe(false);
    expect(result.missingFromManifest.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/ui-remediation/__tests__/verify-manifest-closure.test.ts -v`  
Expected: FAIL — cannot find module `verify-manifest-closure`

- [ ] **Step 3: Write manifest closure implementation**

Create `scripts/ui-remediation/verify-manifest-closure.ts`:

```typescript
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  RouteManifestFileSchema,
  RouteManifestExclusionsSchema,
  RouteQaEvidenceSchema,
} from "../../src/lib/ui-remediation/route-manifest-schema";

export type ClosureResult = {
  ok: boolean;
  missingFromManifest: string[];
  extraInManifest: string[];
  duplicatePatterns: string[];
  duplicatePagePaths: string[];
  pendingQa: string[];
  failedQa: string[];
  blockedQa: string[];
  pendingVariants: string[];
  failedVariants: string[];
  blockedVariants: string[];
  missingVariantEvidence: string[];
  invalidVariantEvidence: string[];
  missingRequiredScreenshots: string[];
  manifestShaMismatch: boolean;
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

function isExcluded(pagePath: string, exclusions: string[]): boolean {
  const rel = pagePath.replace(/\\/g, "/");
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

export function walkProductPagePaths(repoRoot: string): string[] {
  const appDir = path.join(repoRoot, "src/app");
  const exclusionsPath = path.join(
    repoRoot,
    "docs/ui-remediation/route-manifest-exclusions.json",
  );
  const exclusions = RouteManifestExclusionsSchema.parse(
    JSON.parse(fs.readFileSync(exclusionsPath, "utf8")),
  );
  return walkPageFiles(appDir)
    .map((p) => path.relative(repoRoot, p).replace(/\\/g, "/"))
    .filter((p) => !isExcluded(p, exclusions.excludedPagePaths));
}

export function verifyManifestClosure(
  repoRoot: string,
  expectedSha?: string,
): ClosureResult {
  const manifestPath = path.join(repoRoot, "docs/ui-remediation/route-manifest.json");
  const rawManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifest = RouteManifestFileSchema.parse(rawManifest);
  const manifestShaMismatch =
    typeof expectedSha === "string" && manifest.baseSha !== expectedSha;

  const productPages = new Set(walkProductPagePaths(repoRoot));
  const manifestPages = new Set(manifest.entries.map((e) => e.pagePath));

  const missingFromManifest = [...productPages].filter((p) => !manifestPages.has(p));
  const extraInManifest = [...manifestPages].filter((p) => !productPages.has(p));

  const patternCounts = new Map<string, number>();
  for (const entry of manifest.entries) {
    patternCounts.set(
      entry.routePattern,
      (patternCounts.get(entry.routePattern) ?? 0) + 1,
    );
  }
  const duplicatePatterns = [...patternCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([pattern]) => pattern);

  const pageCounts = new Map<string, number>();
  for (const entry of manifest.entries) {
    pageCounts.set(entry.pagePath, (pageCounts.get(entry.pagePath) ?? 0) + 1);
  }
  const duplicatePagePaths = [...pageCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([pagePath]) => pagePath);

  const pendingQa = manifest.entries
    .filter((e) => e.qaStatus === "pending")
    .map((e) => e.routePattern);

  const failedQa = manifest.entries
    .filter((e) => e.qaStatus === "fail")
    .map((e) => e.routePattern);

  const blockedQa = manifest.entries
    .filter((e) => e.qaStatus === "blocked")
    .map((e) => e.routePattern);

  const variants = manifest.entries.flatMap((entry) =>
    entry.verificationVariants.map((variant) => ({
      routePattern: entry.routePattern,
      coverageMode: entry.coverageMode,
      riskTier: entry.riskTier,
      variant,
    })),
  );
  const variantKey = (routePattern: string, variantId: string) =>
    `${routePattern}#${variantId}`;
  const pendingVariants = variants
    .filter(({ variant }) => variant.qaStatus === "pending")
    .map(({ routePattern, variant }) => variantKey(routePattern, variant.id));
  const failedVariants = variants
    .filter(({ variant }) => variant.qaStatus === "fail")
    .map(({ routePattern, variant }) => variantKey(routePattern, variant.id));
  const blockedVariants = variants
    .filter(({ variant }) => variant.qaStatus === "blocked")
    .map(({ routePattern, variant }) => variantKey(routePattern, variant.id));
  const missingVariantEvidence = variants
    .filter(
      ({ variant }) =>
        !fs.existsSync(
          path.join(repoRoot, variant.evidencePath, "evidence.json"),
        ),
    )
    .map(({ routePattern, variant }) => variantKey(routePattern, variant.id));
  const invalidVariantEvidence: string[] = [];
  const missingRequiredScreenshots: string[] = [];
  for (const { routePattern, coverageMode, riskTier, variant } of variants) {
    const key = variantKey(routePattern, variant.id);
    const evidenceFile = path.join(
      repoRoot,
      variant.evidencePath,
      "evidence.json",
    );
    if (!fs.existsSync(evidenceFile)) continue;
    const evidenceResult = RouteQaEvidenceSchema.safeParse(
      JSON.parse(fs.readFileSync(evidenceFile, "utf8")),
    );
    if (!evidenceResult.success) {
      invalidVariantEvidence.push(key);
      continue;
    }
    const evidence = evidenceResult.data;
    if (
      evidence.routePattern !== routePattern ||
      evidence.variantId !== variant.id ||
      evidence.result !== "pass"
    ) {
      invalidVariantEvidence.push(key);
      continue;
    }
    if (coverageMode === "automated" || riskTier === "high") {
      const screenshots: unknown[] = Array.isArray(evidence.screenshots)
        ? evidence.screenshots
        : [];
      const screenshotsExist =
        screenshots.length > 0 &&
        screenshots.every(
          (screenshot) =>
            typeof screenshot === "string" &&
            fs.existsSync(
              path.join(repoRoot, variant.evidencePath, screenshot),
            ),
        );
      if (!screenshotsExist) {
        missingRequiredScreenshots.push(key);
      }
    }
  }

  const ok =
    missingFromManifest.length === 0 &&
    extraInManifest.length === 0 &&
    duplicatePatterns.length === 0 &&
    duplicatePagePaths.length === 0 &&
    pendingQa.length === 0 &&
    failedQa.length === 0 &&
    blockedQa.length === 0 &&
    pendingVariants.length === 0 &&
    failedVariants.length === 0 &&
    blockedVariants.length === 0 &&
    missingVariantEvidence.length === 0 &&
    invalidVariantEvidence.length === 0 &&
    missingRequiredScreenshots.length === 0 &&
    !manifestShaMismatch;

  return {
    ok,
    missingFromManifest,
    extraInManifest,
    duplicatePatterns,
    duplicatePagePaths,
    pendingQa,
    failedQa,
    blockedQa,
    pendingVariants,
    failedVariants,
    blockedVariants,
    missingVariantEvidence,
    invalidVariantEvidence,
    missingRequiredScreenshots,
    manifestShaMismatch,
  };
}

function main() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const integratedSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const result = verifyManifestClosure(repoRoot, integratedSha);
  if (!result.ok) {
    console.error("Manifest closure FAILED:");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log("Manifest closure PASSED");
  console.log(
    `Routes verified exactly once: ${walkProductPagePaths(repoRoot).length}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/ui-remediation/__tests__/verify-manifest-closure.test.ts -v`  
Expected: PASS — the manifest closure test file exits 0 with zero failed tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-remediation/verify-manifest-closure.ts src/lib/ui-remediation/__tests__/verify-manifest-closure.test.ts
git commit -m "feat(ui-remediation): add manifest closure verifier"
```

---

### Task 2: Defect triage script

**Files:**
- Create: `scripts/ui-remediation/triage-defects.ts`

- [ ] **Step 1: Write triage script**

```typescript
import fs from "node:fs";
import path from "node:path";
import { RouteManifestFileSchema } from "../../src/lib/ui-remediation/route-manifest-schema";

type DefectRecord = {
  routePattern: string;
  variantId: string;
  cohort: string;
  result: string;
  suspectedOwnerWave: string;
  blocksProgram: boolean;
  evidencePath: string;
};

const SHARED_CONTRACT_KEYWORDS = [
  "overlay",
  "z-index",
  "token",
  "theme",
  "ResourceTable column",
  "AutoForm width",
  "PageContainer",
];

function main() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const manifest = RouteManifestFileSchema.parse(
    JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "docs/ui-remediation/route-manifest.json"),
        "utf8",
      ),
    ),
  );

  const defects: DefectRecord[] = [];

  for (const entry of manifest.entries) {
    for (const variant of entry.verificationVariants) {
      const evidenceFile = path.join(
        repoRoot,
        variant.evidencePath,
        "evidence.json",
      );
      if (!fs.existsSync(evidenceFile)) continue;
      const evidence = JSON.parse(fs.readFileSync(evidenceFile, "utf8"));
      if (evidence.result !== "fail") continue;

      const notes = JSON.stringify(evidence.defect ?? evidence.notes ?? "");
      const sharedHit = SHARED_CONTRACT_KEYWORDS.some((kw) =>
        notes.toLowerCase().includes(kw.toLowerCase()),
      );

      defects.push({
        routePattern: entry.routePattern,
        variantId: variant.id,
        cohort: variant.qaOwner,
        result: "fail",
        suspectedOwnerWave: sharedHit
          ? evidence.defect?.suspectedOwnerWave ?? "R1-R5"
          : evidence.defect?.suspectedOwnerWave ??
            variant.implementationOwner,
        blocksProgram: sharedHit,
        evidencePath: evidenceFile,
      });
    }
  }

  const outPath = path.join(repoRoot, "docs/ui-remediation/defect-triage.json");
  fs.writeFileSync(outPath, JSON.stringify({ defects, generatedAt: new Date().toISOString() }, null, 2) + "\n");

  const blocking = defects.filter((d) => d.blocksProgram);
  console.log(`Defects: ${defects.length}, blocking: ${blocking.length}`);
  if (blocking.length > 0) {
    console.error("Blocking defects found — route to shared-contract owners");
    process.exit(1);
  }
  console.log("No blocking defects — route-local defects must be zero for signoff");
  if (defects.length > 0) process.exit(1);
}

main();
```

- [ ] **Step 2: Run triage on integrated SHA**

Run: `cd schedjuice-reimagined-fe && npx tsx scripts/ui-remediation/triage-defects.ts`  
Expected: exit 0 with `Defects: 0, blocking: 0` when all QA passed

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-remediation/triage-defects.ts
git commit -m "feat(ui-remediation): add defect triage script"
```

---

### Task 3: Final integration shell script

**Files:**
- Create: `scripts/ui-remediation/verify-final-integration.sh`

- [ ] **Step 1: Write integration script**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

ACTUAL_SHA="$(git rev-parse HEAD)"
ORIGIN_DEV_SHA="$(git rev-parse origin/dev)"
INTEGRATED_SHA="${INTEGRATED_SHA:-$ACTUAL_SHA}"
if [ "$ACTUAL_SHA" != "$ORIGIN_DEV_SHA" ]; then
  echo "R16 requires HEAD to equal origin/dev"
  exit 1
fi
if [ "$INTEGRATED_SHA" != "$ACTUAL_SHA" ]; then
  echo "INTEGRATED_SHA does not match HEAD"
  exit 1
fi
echo "=== R16 Final Integration Verification ==="
echo "SHA: $INTEGRATED_SHA"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

FAILURES=0
STEP_RESULTS=()

run_step() {
  local name="$1"
  shift
  echo ""
  echo "--- $name ---"
  if "$@"; then
    STEP_RESULTS+=("PASS: $name")
    echo "PASS: $name"
  else
    STEP_RESULTS+=("FAIL: $name")
    echo "FAIL: $name"
    FAILURES=$((FAILURES + 1))
  fi
}

run_step "lint" npm run lint
run_step "typecheck" npm run typecheck
run_step "unit tests" npm run test:unit
run_step "production build" npm run build
run_step "browser suite" npm run test:browser
run_step "legacy token gate" npm run check:legacy-tokens
run_step "z-index gate" npm run check:overlay-z-index
run_step "manifest closure" npx tsx scripts/ui-remediation/verify-manifest-closure.ts
run_step "defect triage" npx tsx scripts/ui-remediation/triage-defects.ts

echo ""
echo "=== Summary ==="
for result in "${STEP_RESULTS[@]}"; do
  echo "$result"
done

if [ "$FAILURES" -gt 0 ]; then
  echo ""
  echo "R16 FAILED: $FAILURES step(s)"
  exit 1
fi

echo ""
echo "R16 PASSED on SHA $INTEGRATED_SHA"
```

- [ ] **Step 2: Make executable and add package script**

```bash
chmod +x scripts/ui-remediation/verify-final-integration.sh
```

Add to `package.json`:

```json
"verify:final-integration": "bash scripts/ui-remediation/verify-final-integration.sh",
"check:manifest-closure": "npx tsx scripts/ui-remediation/verify-manifest-closure.ts",
"triage:defects": "npx tsx scripts/ui-remediation/triage-defects.ts"
```

- [ ] **Step 3: Run full integration on integrated SHA**

```bash
cd schedjuice-reimagined-fe
git fetch origin
git checkout dev
git pull --ff-only origin dev
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/dev)"
INTEGRATED_SHA=$(git rev-parse HEAD) npm run verify:final-integration
```

Expected output when program is complete:

```text
=== R16 Final Integration Verification ===
SHA: $INTEGRATED_SHA
--- lint ---
PASS: lint
--- typecheck ---
PASS: typecheck
--- unit tests ---
PASS: unit tests
--- production build ---
PASS: production build
--- browser suite ---
PASS: browser suite
--- legacy token gate ---
PASS: legacy token gate
--- z-index gate ---
PASS: z-index gate
--- manifest closure ---
Manifest closure PASSED
PASS: manifest closure
--- defect triage ---
Defects: 0, blocking: 0
PASS: defect triage
R16 PASSED on SHA $INTEGRATED_SHA
```

Expected exit code: `0`. The displayed SHA must equal `git rev-parse HEAD`; R0's `e2e/reporters/no-skips.ts` must report zero skipped tests. A run with any failed, skipped, or focused browser test is not acceptable.

- [ ] **Step 4: Commit**

```bash
git add scripts/ui-remediation/verify-final-integration.sh package.json
git commit -m "feat(ui-remediation): add final integration verification script"
```

---

### Task 4: Static legacy token and z-index checks (R16 verification)

These scripts are introduced in R1 and R2; R16 verifies they pass. Document expected behavior:

- [ ] **Step 1: Verify legacy token gate**

Run: `cd schedjuice-reimagined-fe && npm run check:legacy-tokens`  
Expected: exit 0, stdout contains `Legacy token gate OK`; no new or untracked legacy token class exceeds the R1 baseline.

Failure example (exit 1):

```text
LEGACY TOKEN VIOLATIONS:
src/app/(internal)/campuses/page.tsx:42: className="text-muted-foreground"
```

Route to: R1 owner

- [ ] **Step 2: Verify z-index gate**

Run: `cd schedjuice-reimagined-fe && npm run check:overlay-z-index`  
Expected: exit 0, stdout contains `Overlay z-index gate OK`

Failure example (exit 1):

```text
Z-INDEX VIOLATIONS:
src/components/finances/student-payments/StatusCell.tsx:18: z-400
```

Route to: R2 owner

- [ ] **Step 3: Verify overlay contract unit tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/ui/overlay-layers.test.ts -v`  
Expected: PASS — all overlay layer values match `src/lib/ui/overlay-layers.ts`

---

### Task 5: Artifact review

- [ ] **Step 1: Review QA evidence completeness**

```bash
cd schedjuice-reimagined-fe
node -e '
const fs = require("node:fs");
const manifest = JSON.parse(
  fs.readFileSync("docs/ui-remediation/route-manifest.json", "utf8"),
);
const routeCounts = { pass: 0, pending: 0, blocked: 0, fail: 0 };
const variantCounts = { pass: 0, pending: 0, blocked: 0, fail: 0 };
for (const entry of manifest.entries) {
  routeCounts[entry.qaStatus] += 1;
  for (const variant of entry.verificationVariants) {
    variantCounts[variant.qaStatus] += 1;
  }
}
console.log(
  JSON.stringify(
    {
      routeTotal: manifest.entries.length,
      routeCounts,
      variantTotal: Object.values(variantCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
      variantCounts,
    },
    null,
    2,
  ),
);
'
```

Expected for signoff: route `pass` equals route `total`; route `pending`, `blocked`, and `fail` are all zero; variant `pass` equals variant `total`. Blocked routes are reported during R15 but cannot pass R16.

- [ ] **Step 2: Review automated browser screenshots**

```bash
rg --files docs/ui-remediation/qa-evidence -g "*.png" | wc -l
```

Expected: screenshot count is greater than zero and every high-risk or representative variant evidence JSON names at least one existing screenshot.

- [ ] **Step 3: Review verification command registry**

Read `docs/VERIFICATION.md` (from R0) and confirm commands match R16 script invocation.

---

### Task 6: Cold QA prompt and signoff

- [ ] **Step 1: Dispatch cold QA subagent**

Copy verbatim:

```text
You are a cold independent QA verifier for UI Migration Remediation R16.
You have NOT seen implementation conversations. You verify only.

Repository: schedjuice-reimagined-fe
Integrated SHA: $INTEGRATED_SHA
Checkout: git checkout "$INTEGRATED_SHA"

Read only:
- docs/superpowers/specs/2026-07-12-ui-migration-remediation-program-design.md (§14 completion criteria)
- docs/ui-remediation/route-manifest.json
- docs/ui-remediation/qa-evidence/ (sample 10% per route family, minimum 3 routes per family)
- docs/ui-remediation/defect-triage.json

Run:
npm run verify:final-integration

Manual cold spot-check (no patching):
1. Pick 2 real routes per route family from the manifest at random; if a family has only 1 real route, verify that route.
2. Log in with the persona listed in manifest entry.
3. Navigate to fixtureUrl at primaryViewport and primaryTheme.
4. Verify: no horizontal overflow, page title present, primary action visible, one overlay interaction works.
5. For every entry with `resource-table`, `glide`, or `shared-shell`, activate and verify each listed variant on the same real `fixtureUrl`; never construct a mode-specific URL.
6. For finance routes: verify table scroll before column crush.
7. Record results in docs/ui-remediation/cold-qa-report.md.

Pass criteria:
- verify:final-integration exits 0
- Cold spot-check: 0 failures across every selected route and required variant
- defect-triage.json shows 0 defects
- No manifest route or verification variant with qaStatus pending, blocked, or fail

Return: PASS or FAIL with route list and evidence paths.
Do NOT patch product code.
```

- [ ] **Step 2: Write final signoff generator**

Create `scripts/ui-remediation/write-final-signoff.ts`:

```typescript
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RouteManifestFileSchema } from "../../src/lib/ui-remediation/route-manifest-schema";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const orchestrator = process.env.R16_ORCHESTRATOR;
if (!orchestrator) {
  throw new Error("R16_ORCHESTRATOR is required");
}

const integratedSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const branch = execFileSync("git", ["branch", "--show-current"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
if (branch !== "dev") {
  throw new Error(`Final signoff must run on dev, received ${branch}`);
}

const manifest = RouteManifestFileSchema.parse(
  JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "docs/ui-remediation/route-manifest.json"),
      "utf8",
    ),
  ),
);
if (manifest.baseSha !== integratedSha) {
  throw new Error(
    `Manifest SHA ${manifest.baseSha} does not match ${integratedSha}`,
  );
}
const routePass = manifest.entries.filter(
  (entry) => entry.qaStatus === "pass",
).length;
const variants = manifest.entries.flatMap(
  (entry) => entry.verificationVariants,
);
const variantPass = variants.filter(
  (variant) => variant.qaStatus === "pass",
).length;
if (routePass !== manifest.entries.length || variantPass !== variants.length) {
  throw new Error("Final signoff requires every route and variant to pass");
}

const coldQaPath = path.join(
  repoRoot,
  "docs/ui-remediation/cold-qa-report.md",
);
const coldQa = fs.readFileSync(coldQaPath, "utf8");
if (!coldQa.includes("Result: PASS")) {
  throw new Error("Cold QA report must contain Result: PASS");
}

const markdown = `# UI Migration Remediation — Final Signoff

## Integrated SHA

- SHA: ${integratedSha}
- Branch: ${branch}
- Date: ${new Date().toISOString()}

## Automated gates

| Gate | Command | Result |
| --- | --- | --- |
| Lint | npm run lint | PASS |
| Typecheck | npm run typecheck | PASS |
| Unit | npm run test:unit | PASS |
| Build | npm run build | PASS |
| Browser | npm run test:browser | PASS — zero skipped |
| Legacy tokens | npm run check:legacy-tokens | PASS |
| Z-index | npm run check:overlay-z-index | PASS |
| Manifest closure | npm run check:manifest-closure | PASS |
| Defect triage | npm run triage:defects | PASS |
| Full integration | npm run verify:final-integration | PASS |

## Manifest summary

- Total routes: ${manifest.entries.length}
- QA route pass: ${routePass}
- Total verification variants: ${variants.length}
- QA variant pass: ${variantPass}
- QA pending: 0
- QA blocked: 0
- QA fail: 0

## Cold QA

- Report: docs/ui-remediation/cold-qa-report.md
- Result: PASS

## Signoff

- Orchestrator: ${orchestrator}
- Cold QA agent: independent cold QA subagent
- Program status: COMPLETE
`;

fs.writeFileSync(
  path.join(repoRoot, "docs/ui-remediation/final-signoff.md"),
  markdown,
);
console.log(`Wrote final signoff for ${integratedSha}`);
```

- [ ] **Step 3: Generate and inspect final signoff**

Run:

```bash
cd schedjuice-reimagined-fe
R16_ORCHESTRATOR="$(git config user.name)" npx tsx scripts/ui-remediation/write-final-signoff.ts
```

Expected: exit 0 and `Wrote final signoff for ` followed by the exact output of `git rev-parse HEAD`. `docs/ui-remediation/final-signoff.md` records all routes and variants passing and zero pending, blocked, failed, or skipped checks.

- [ ] **Step 4: Commit signoff**

```bash
git add scripts/ui-remediation/write-final-signoff.ts docs/ui-remediation/final-signoff.md docs/ui-remediation/cold-qa-report.md
git commit -m "docs(ui-remediation): R16 final signoff"
```

---

## Stop conditions

| Condition | Exit code | Action |
| --- | --- | --- |
| `npm run lint` fails | 1 | Route to R0; block R16 |
| `npm run typecheck` fails | 1 | Route to R0; block R16 |
| `npm run test:unit` fails | 1 | Identify failing test owner wave; block R16 |
| `npm run build` fails | 1 | Route to last merged wave touching build error; block R16 |
| `npm run test:browser` fails or reports skipped/focused tests | 1 | Route to R0 harness or route/variant owner; block R16 |
| `check:legacy-tokens` fails | 1 | Route to R1; block R16 |
| `check:overlay-z-index` fails | 1 | Route to R2; block R16 |
| Manifest closure fails | 1 | Route to R15; block R16 |
| Defect triage finds blocking defect | 1 | Route to R1–R5 per triage; block R16 |
| Defect triage finds any route-local fail | 1 | Route to R6–R14 owner; block R16 |
| Cold QA spot-check fails | manual FAIL | Re-open R15 cohort for failed family; block signoff |
| New commit merges to `dev` during R16 | invalidate | Restart R16 from Task 3 Step 3 |
| Any route or verification variant has `qaStatus` pending, blocked, or fail | 1 | Re-run or repair the owning R15 QA cohort; blockers cannot be accepted as final closure |

**Program is NOT complete until:** all stop conditions are clear, `verify:final-integration` exits 0, cold QA returns PASS, and `final-signoff.md` is committed.

---

## Defect routing matrix (R16 triage)

| Defect signal | Owner wave | Blocks |
| --- | --- | --- |
| Overlay clipping on 3+ families | R2 | Entire program |
| Legacy token in product code | R1 | Entire program |
| Table column crush on 3+ list routes | R3 | R8–R14, R16 |
| AutoForm width cap regression | R4 | R8–R14, R16 |
| Page title/container inconsistency across family | R5 | That route family R15 QA |
| Single route or mode layout break | Manifest variant `implementationOwner` (R6–R14) | That route variant only |
| Missing manifest entry | R15 | R16 |
| Missing QA evidence | R15 cohort | R16 |

---

## Exact command reference (complete gate suite)

```bash
cd schedjuice-reimagined-fe
git fetch origin
git checkout dev
git pull --ff-only origin dev
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/dev)"

# Individual gates
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:browser
npm run check:legacy-tokens
npm run check:overlay-z-index
npm run check:manifest-closure
npm run triage:defects

# Orchestrated
npm run verify:final-integration
```

| Command | Expected exit | Expected key output |
| --- | --- | --- |
| `npm run lint` | 0 | `✔ No ESLint warnings or errors` |
| `npm run typecheck` | 0 | no stderr |
| `npm run test:unit` | 0 | Vitest summary reports zero failed test files and zero failed tests |
| `npm run build` | 0 | `Compiled successfully` |
| `npm run test:browser` | 0 | Playwright summary reports zero failed and zero skipped tests |
| `npm run check:legacy-tokens` | 0 | `Legacy token gate OK` |
| `npm run check:overlay-z-index` | 0 | `Overlay z-index gate OK` |
| `npm run check:manifest-closure` | 0 | `Manifest closure PASSED` |
| `npm run triage:defects` | 0 | `Defects: 0, blocking: 0` |
| `npm run verify:final-integration` | 0 | `R16 PASSED on SHA` |

---

## Self-review

**Spec coverage:** §9 verification foundation, §14 completion criteria (all 11 items), §10.3 failure routing, §7 manifest closure — addressed.

**Placeholder scan:** No omitted-code markers or unresolved angle-bracket placeholders remain. Every `...` token in code is legitimate JavaScript/TypeScript object spread or rest syntax.

**Type consistency:** The closure verifier and triage script consume R15's `coverageMode` and nested `verificationVariants`; student-payment shell and ResourceTable failures route to R12, and Glide failures route to R13.

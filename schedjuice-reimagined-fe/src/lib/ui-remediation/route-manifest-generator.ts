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
import { mergePriorManifestQa } from "./sync-route-qa-status";

type GenerateOptions = {
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
  if (
    rel.includes("/internal/") ||
    rel.includes("/artifacts/") ||
    rel.includes("/api/")
  ) {
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
  const relPagePath = path
    .relative(options.repoRoot, pagePath)
    .replace(/\\/g, "/");
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
  }));
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
      routePattern === "/"
        ? "Redirect smoke: authed users → /home, unauthed → /login; verify redirect only"
        : fixtureUrl === null
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

function loadExistingManifest(repoRoot: string): RouteManifestFile | null {
  const manifestPath = path.join(
    repoRoot,
    "docs/ui-remediation/route-manifest.json",
  );
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return RouteManifestFileSchema.parse(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    );
  } catch {
    return null;
  }
}

export function generateRouteManifest(
  options: GenerateOptions,
): RouteManifestFile {
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
    entries: entries.sort((a, b) =>
      a.routePattern.localeCompare(b.routePattern),
    ),
  };

  const prior = loadExistingManifest(options.repoRoot);
  return RouteManifestFileSchema.parse(mergePriorManifestQa(manifest, prior));
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

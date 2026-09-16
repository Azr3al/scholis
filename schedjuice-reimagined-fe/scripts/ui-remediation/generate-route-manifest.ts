import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeRouteManifest } from "../../src/lib/ui-remediation/route-manifest-generator";
import { RouteFixtureOverridesSchema } from "../../src/lib/ui-remediation/route-manifest-schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const baseSha =
  process.env.MANIFEST_BASE_SHA ??
  execSync("git rev-parse HEAD", {
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

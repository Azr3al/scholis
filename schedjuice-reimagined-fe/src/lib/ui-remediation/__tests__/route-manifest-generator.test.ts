import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { generateRouteManifest } from "../route-manifest-generator";
import { RouteManifestFileSchema } from "../route-manifest-schema";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

describe("generateRouteManifest", () => {

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

  it("preserves pass qaStatus from a prior manifest on regenerate", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-manifest-"));
    const docsDir = path.join(tempRoot, "docs/ui-remediation");
    fs.mkdirSync(docsDir, { recursive: true });
    fs.copyFileSync(
      path.join(REPO_ROOT, "docs/ui-remediation/route-manifest-exclusions.json"),
      path.join(docsDir, "route-manifest-exclusions.json"),
    );
    fs.cpSync(path.join(REPO_ROOT, "src/app"), path.join(tempRoot, "src/app"), {
      recursive: true,
    });

    const options = {
      repoRoot: tempRoot,
      baseSha: "05ac447b",
      automatedSmokePatterns: new Set<string>(),
      fixtureOverrides: {
        "/login": "/login",
      },
    };

    const first = generateRouteManifest(options);
    const loginEntry = first.entries.find(
      (entry) => entry.routePattern === "/login",
    );
    expect(loginEntry).toBeDefined();
    loginEntry!.qaStatus = "pass";
    loginEntry!.verificationVariants[0].qaStatus = "pass";
    fs.writeFileSync(
      path.join(docsDir, "route-manifest.json"),
      JSON.stringify(first, null, 2),
    );

    const second = generateRouteManifest({
      ...options,
      baseSha: "06ac447c",
    });
    const regenerated = second.entries.find(
      (entry) => entry.routePattern === "/login",
    );
    expect(regenerated?.qaStatus).toBe("pass");
    expect(regenerated?.verificationVariants[0].qaStatus).toBe("pass");

    fs.rmSync(tempRoot, { recursive: true, force: true });
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

    for (const [routePattern, pagePath] of Array.from(expected)) {
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

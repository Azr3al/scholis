import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RouteManifestFileSchema,
  RouteQaEvidenceSchema,
} from "../../src/lib/ui-remediation/route-manifest-schema";
import { syncManifestQaStatus } from "../../src/lib/ui-remediation/sync-route-qa-status";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const manifestPath = path.join(
  repoRoot,
  "docs/ui-remediation/route-manifest.json",
);
const manifest = RouteManifestFileSchema.parse(
  JSON.parse(fs.readFileSync(manifestPath, "utf8")),
);

syncManifestQaStatus(manifest, (evidencePath) => {
  const evidenceFile = path.join(repoRoot, evidencePath, "evidence.json");
  if (!fs.existsSync(evidenceFile)) {
    return null;
  }
  return RouteQaEvidenceSchema.parse(
    JSON.parse(fs.readFileSync(evidenceFile, "utf8")),
  );
});

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Synchronized ${manifest.entries.length} route entries`);

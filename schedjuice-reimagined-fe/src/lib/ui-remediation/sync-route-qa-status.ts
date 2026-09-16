import type {
  QaStatus,
  RouteManifestEntry,
  RouteManifestFile,
  RouteQaEvidence,
  VerificationVariant,
} from "./route-manifest-schema";

const FIXTURE_BLOCKER_PREFIX = "No concrete fixture URL configured";

function isFixtureBlockerReason(reason: string | undefined): boolean {
  return (
    typeof reason === "string" &&
    reason.startsWith(FIXTURE_BLOCKER_PREFIX)
  );
}

export function resolveVariantQaWithoutEvidence(variant: {
  blockerReason?: string;
}): { qaStatus: QaStatus } {
  if (
    typeof variant.blockerReason === "string" &&
    variant.blockerReason.length > 0
  ) {
    return { qaStatus: "blocked" };
  }
  return { qaStatus: "pending" };
}

export function resolveVariantQaFromEvidence(
  evidence: RouteQaEvidence,
): { qaStatus: QaStatus; blockerReason?: string } {
  if (evidence.result === "pass") {
    return { qaStatus: "pass" };
  }
  if (evidence.result === "fail") {
    return { qaStatus: "fail" };
  }
  if (
    evidence.result === "blocked" &&
    typeof evidence.blockerReason === "string" &&
    evidence.blockerReason.length > 0
  ) {
    return { qaStatus: "blocked", blockerReason: evidence.blockerReason };
  }
  throw new Error(
    `Invalid evidence result: ${evidence.result} for ${evidence.routePattern} ${evidence.variantId}`,
  );
}

export function aggregateRouteQaStatus(
  variants: Array<{ qaStatus: QaStatus; blockerReason?: string }>,
): { qaStatus: QaStatus; blockerReason?: string } {
  const statuses = variants.map((variant) => variant.qaStatus);
  if (statuses.includes("fail")) {
    return { qaStatus: "fail" };
  }
  if (statuses.includes("blocked")) {
    const blockerReason = variants
      .map((variant) => variant.blockerReason)
      .filter((reason): reason is string => typeof reason === "string")
      .join("; ");
    return blockerReason.length > 0
      ? { qaStatus: "blocked", blockerReason }
      : { qaStatus: "blocked" };
  }
  if (statuses.includes("pending")) {
    return { qaStatus: "pending" };
  }
  return { qaStatus: "pass" };
}

function applyVariantQaResolution(
  variant: VerificationVariant,
  resolution: { qaStatus: QaStatus; blockerReason?: string },
): void {
  variant.qaStatus = resolution.qaStatus;
  if (resolution.qaStatus === "blocked" && resolution.blockerReason) {
    variant.blockerReason = resolution.blockerReason;
  } else {
    delete variant.blockerReason;
  }
}

function applyRouteQaAggregation(entry: RouteManifestEntry): void {
  const aggregated = aggregateRouteQaStatus(entry.verificationVariants);
  entry.qaStatus = aggregated.qaStatus;
  if (aggregated.qaStatus === "blocked" && aggregated.blockerReason) {
    entry.blockerReason = aggregated.blockerReason;
  } else {
    delete entry.blockerReason;
  }
}

export function mergeVariantQaFromPrior(
  prior: Pick<VerificationVariant, "qaStatus" | "blockerReason">,
  fresh: Pick<VerificationVariant, "qaStatus" | "blockerReason">,
): { qaStatus: QaStatus; blockerReason?: string } {
  if (prior.qaStatus === "pass" || prior.qaStatus === "fail") {
    return { qaStatus: prior.qaStatus };
  }
  if (prior.qaStatus === "blocked") {
    const wasFixtureBlocked = isFixtureBlockerReason(prior.blockerReason);
    if (wasFixtureBlocked && fresh.qaStatus === "pending") {
      return { qaStatus: "pending" };
    }
    if (!wasFixtureBlocked || fresh.qaStatus === "blocked") {
      return {
        qaStatus: "blocked",
        ...(prior.blockerReason ? { blockerReason: prior.blockerReason } : {}),
      };
    }
  }
  return {
    qaStatus: fresh.qaStatus,
    ...(fresh.blockerReason ? { blockerReason: fresh.blockerReason } : {}),
  };
}

export function mergePriorManifestQa(
  fresh: RouteManifestFile,
  prior: RouteManifestFile | null,
): RouteManifestFile {
  if (!prior) {
    return fresh;
  }

  const priorByPattern = new Map(
    prior.entries.map((entry) => [entry.routePattern, entry]),
  );

  for (const entry of fresh.entries) {
    const priorEntry = priorByPattern.get(entry.routePattern);
    if (!priorEntry) {
      continue;
    }

    entry.defectRefs = [...priorEntry.defectRefs];

    const priorVariants = new Map(
      priorEntry.verificationVariants.map((variant) => [variant.id, variant]),
    );
    for (const variant of entry.verificationVariants) {
      const priorVariant = priorVariants.get(variant.id);
      if (!priorVariant) {
        continue;
      }
      const merged = mergeVariantQaFromPrior(priorVariant, variant);
      applyVariantQaResolution(variant, merged);
    }

    applyRouteQaAggregation(entry);
  }

  return fresh;
}

type EvidenceReader = (
  evidencePath: string,
) => RouteQaEvidence | null | undefined;

export function syncManifestQaStatus(
  manifest: RouteManifestFile,
  readEvidence: EvidenceReader,
): RouteManifestFile {
  for (const entry of manifest.entries) {
    for (const variant of entry.verificationVariants) {
      const evidence = readEvidence(variant.evidencePath);
      if (!evidence) {
        applyVariantQaResolution(
          variant,
          resolveVariantQaWithoutEvidence(variant),
        );
        continue;
      }
      applyVariantQaResolution(variant, resolveVariantQaFromEvidence(evidence));
    }
    applyRouteQaAggregation(entry);
  }

  return manifest;
}

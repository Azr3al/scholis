import { z } from "zod";

const RouteFamilySchema = z.enum([
  "global-shell-auth-public",
  "home-dashboard-analytics",
  "administration-crud",
  "courses-attendance-scheduling",
  "quizzes-docs-content-services",
  "finance-operations",
  "student-payments",
  "payment-upload-verification",
]);

const CoverageModeSchema = z.enum([
  "automated",
  "representative",
  "manual",
]);

const VerificationVariantIdSchema = z.enum([
  "default",
  "shared-shell",
  "resource-table",
  "glide",
]);

const RiskTierSchema = z.enum(["high", "medium", "low"]);

const ImplementationStatusSchema = z.enum([
  "pending",
  "in_progress",
  "complete",
]);

const QaStatusSchema = z.enum([
  "pending",
  "pass",
  "fail",
  "blocked",
]);

const ViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const VerificationVariantSchema = z.object({
  id: VerificationVariantIdSchema,
  implementationPlan: z.string().min(1),
  implementationOwner: z.string().min(1),
  qaOwner: z.string().min(1),
  qaStatus: QaStatusSchema,
  evidencePath: z.string().min(1),
  blockerReason: z.string().min(1).optional(),
});

const RouteQaDefectSchema = z.object({
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
export type QaStatus = z.infer<typeof QaStatusSchema>;
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

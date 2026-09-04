import { z } from 'zod';

/**
 * Vocabulary for app-to-app callers.
 *
 * Scholis is the assessment engine; the systems that integrate with it own
 * timetables, gradebooks and report cards. Nothing in this file knows what a
 * report card is, and it must stay that way — the moment Scholis learns about
 * gradebook columns it stops being a product that can be sold on its own.
 */

/**
 * Two tiers, and the split is deliberate.
 *
 * A `platform` credential belongs to the integrating system itself. It may
 * create organisations and mint their keys, and it may not read or write a
 * single paper or mark. An `org` credential acts inside exactly one school and
 * may never mint another credential.
 *
 * That is separation of duties: a leaked org key exposes one school, and a
 * leaked platform key cannot read anybody's marks without first minting a key,
 * which is a loud and logged act.
 */
export const apiClientKindSchema = z.enum(['platform', 'org']);
export type ApiClientKind = z.infer<typeof apiClientKindSchema>;

/**
 * Deliberately few. Every scope here is one somebody asked for; a scope tree
 * that mirrors the route table is a permissions model nobody can reason about.
 */
export const apiScopeSchema = z.enum([
  /** Read papers and their questions. */
  'tests:read',
  /** Author papers. */
  'tests:write',
  /** Read released results. Never unreleased ones — see the scores service. */
  'results:read',
  /** Start attempts on a student's behalf. */
  'launch:write',
  /** Create organisations and mint their keys. Platform tier only. */
  'orgs:write',
]);
export type ApiScope = z.infer<typeof apiScopeSchema>;

/** What an org credential may hold. `orgs:write` is absent on purpose. */
export const ORG_SCOPES: readonly ApiScope[] = [
  'tests:read',
  'tests:write',
  'results:read',
  'launch:write',
] as const;

/** What a platform credential may hold. Provisioning, and nothing else. */
export const PLATFORM_SCOPES: readonly ApiScope[] = ['orgs:write'] as const;

/**
 * One student's result for one paper, flattened for a gradebook.
 *
 * Raw marks only — no letter grades, no percentages, no totals. Grade
 * boundaries differ per school and change per year, and arithmetic over
 * columns is the calling system's job. Scholis returning a "B" would be
 * Scholis asserting a policy it has no way to know.
 */
export const scoreRowSchema = z.object({
  testId: z.uuid(),
  testTitle: z.string(),
  /** The caller's own course identifier, echoed back from the paper. */
  courseRef: z.string().nullable(),
  attemptId: z.uuid(),
  /** The caller's own student identifier. Null for a walk-in attempt. */
  studentRef: z.string().nullable(),
  /** Whatever the student typed when starting. Display only — match on studentRef. */
  takerName: z.string(),
  score: z.number(),
  maxScore: z.number(),
  submittedAt: z.iso.datetime(),
  releasedAt: z.iso.datetime(),
  /**
   * Marks per section, for gradebook columns that combine skills — a single
   * "Reading and Use of English" column is two sections of one paper.
   * Questions outside any section are grouped under a null id.
   */
  sections: z.array(
    z.object({
      sectionId: z.uuid().nullable(),
      title: z.string(),
      score: z.number(),
      maxScore: z.number(),
    }),
  ),
});
export type ScoreRow = z.infer<typeof scoreRowSchema>;

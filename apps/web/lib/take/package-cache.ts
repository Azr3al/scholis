import { testPackageSchema, type TestPackage } from '@scholis/schema';
import { z } from 'zod';

/**
 * The student-facing test package, kept on the device so a reload with no
 * connection can still show the paper.
 *
 * The answers were never the hard part — they are in the attempt snapshot. The
 * questions were, because they come from the network and `/api/*` is never
 * cached by the service worker. That rule exists to keep scores, grading and
 * release state uncacheable, and it is not being relaxed: this is application
 * state stored deliberately by application code, not an HTTP response cached
 * by a worker that cannot tell one payload from another.
 *
 * `testPackageSchema` is the *public* shape — the same one the server parses
 * through before responding, which is what strips answer keys. Parsing on read
 * as well means a stored payload cannot reintroduce a key even if something
 * upstream ever wrote one: zod drops unrecognised properties at every depth.
 */
export const cachedPackageSchema = z.object({
  version: z.literal(1),
  code: z.string().min(1),
  pkg: testPackageSchema,
  savedAt: z.iso.datetime(),
});

export type CachedPackage = z.infer<typeof cachedPackageSchema>;

export const makeCachedPackage = (code: string, pkg: TestPackage, now: Date): CachedPackage => ({
  version: 1,
  code,
  pkg,
  savedAt: now.toISOString(),
});

/**
 * Parse a stored package, or `null` if it is unusable.
 *
 * Discarded rather than repaired, exactly as with the attempt snapshot. A
 * package belonging to another code, or from an older shape, would put the
 * wrong questions in front of a student — refusing to show anything is the
 * safer failure, because the caller falls back to the network error and the
 * student is told rather than misled.
 */
export const readCachedPackage = (raw: unknown, expectedCode: string): CachedPackage | null => {
  const parsed = cachedPackageSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.code !== expectedCode) return null;
  return parsed.data;
};

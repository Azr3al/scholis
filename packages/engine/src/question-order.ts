import type { TestPackage } from '@scholis/schema';

export interface OrderableQuestion {
  id: string;
  position: number;
  sectionId: string | null;
}

/** Deterministic 32-bit hash for seeding per-run shuffles. */
const hashSeed = (seed: string, runIndex: number): number => {
  let h = 2166136261;
  const input = `${seed}:${String(runIndex)}`;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Mulberry32 PRNG — fast, deterministic, good enough for question order. */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const fisherYates = <T>(items: T[], random: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j] as T;
    out[j] = tmp as T;
  }
  return out;
};

/** Split canonical list into contiguous runs with the same sectionId. */
const sectionRuns = (questions: OrderableQuestion[]): OrderableQuestion[][] => {
  const sorted = [...questions].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  // Iterated rather than indexed: with noUncheckedIndexedAccess every sorted[i]
  // is possibly undefined, and asserting that away needs a cast the lint rules
  // reject in both spellings. Walking the array has neither problem and drops
  // the empty-input special case.
  const runs: OrderableQuestion[][] = [];
  let current: OrderableQuestion[] = [];
  let currentSection: string | null = null;

  for (const question of sorted) {
    if (current.length > 0 && question.sectionId === currentSection) {
      current.push(question);
      continue;
    }
    if (current.length > 0) runs.push(current);
    current = [question];
    currentSection = question.sectionId;
  }
  if (current.length > 0) runs.push(current);

  return runs;
};

/**
 * Shuffle question ids within each contiguous section run.
 * Canonical position order is preserved between runs.
 */
export const shuffleQuestionsWithinSections = (
  questions: OrderableQuestion[],
  seed: string,
): string[] => {
  const runs = sectionRuns(questions);
  const ordered: string[] = [];

  runs.forEach((run, runIndex) => {
    const random = mulberry32(hashSeed(seed, runIndex));
    const shuffled = fisherYates(run, random);
    ordered.push(...shuffled.map((q) => q.id));
  });

  return ordered;
};

/** Reorder a test package's questions by a stored attempt order. */
export const applyQuestionOrder = (pkg: TestPackage, order: string[]): TestPackage => {
  if (order.length === 0) return pkg;

  const byId = new Map(pkg.questions.map((q) => [q.id, q]));
  if (order.length !== pkg.questions.length) {
    throw new Error('Question order length does not match package.');
  }

  const reordered = order.map((id) => {
    const question = byId.get(id);
    if (question === undefined) {
      throw new Error(`Unknown question id in order: ${id}`);
    }
    return question;
  });

  return { ...pkg, questions: reordered };
};

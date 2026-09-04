import type { KeyedQuestion, ResponseValue } from '@scholis/schema';
<<<<<<< HEAD
=======
import { buildEvenSplitRubric } from '@scholis/schema';
import { textToRichText } from '@scholis/schema';
>>>>>>> master
import { describe, expect, it } from 'vitest';
import { choice } from './fixtures';
import { scoreChoice } from './score-choice';

type KeyedChoice = Extract<KeyedQuestion, { type: 'choice' }>;

const pick = (...ids: string[]): ResponseValue => ({ kind: 'choice', optionIds: ids });
const q = (...args: Parameters<typeof choice>) => choice(...args) as KeyedChoice;

<<<<<<< HEAD
=======
const rubricTwoOfOnePoint = [
  { correctCount: 0, points: 0 },
  { correctCount: 1, points: 0.5 },
  { correctCount: 2, points: 1 },
];

>>>>>>> master
describe('scoreChoice › single selection', () => {
  const question = q('q', [true, false, false]);

  it('awards full points for the correct option', () => {
    expect(scoreChoice(question, pick('q-0'))).toBe(4);
  });

  it('awards nothing for a wrong option', () => {
    expect(scoreChoice(question, pick('q-1'))).toBe(0);
  });

  it('awards nothing when nothing is selected', () => {
    expect(scoreChoice(question, pick())).toBe(0);
  });

  it('awards nothing when more than one is selected', () => {
<<<<<<< HEAD
    // Not "partially right" — a multi-select on a single-select question is an
    // invalid response, usually a client bug.
=======
>>>>>>> master
    expect(scoreChoice(question, pick('q-0', 'q-1'))).toBe(0);
  });

  it('ignores unknown option ids', () => {
    expect(scoreChoice(question, pick('does-not-exist'))).toBe(0);
  });
});

<<<<<<< HEAD
describe('scoreChoice › multi, all or nothing', () => {
  const question = q('q', [true, true, false], { selection: 'multi' });

  it('awards full points for the exact correct set', () => {
    expect(scoreChoice(question, pick('q-0', 'q-1'))).toBe(4);
  });

  it('is order independent', () => {
    expect(scoreChoice(question, pick('q-1', 'q-0'))).toBe(4);
  });

  it('awards nothing for a partial set', () => {
    expect(scoreChoice(question, pick('q-0'))).toBe(0);
  });

  it('awards nothing when a wrong option is included', () => {
    expect(scoreChoice(question, pick('q-0', 'q-1', 'q-2'))).toBe(0);
  });
});

describe('scoreChoice › multi, partial credit', () => {
  const question = q('q', [true, true, false, false], {
    selection: 'multi',
    partialCredit: true,
  });

  it('awards full points for the exact correct set', () => {
    expect(scoreChoice(question, pick('q-0', 'q-1'))).toBe(4);
  });

  it('awards half for one of two correct', () => {
    expect(scoreChoice(question, pick('q-0'))).toBe(2);
  });

  it('cancels a right tick with a wrong one', () => {
    expect(scoreChoice(question, pick('q-0', 'q-2'))).toBe(0);
  });

  it('scores zero for selecting everything, not full marks', () => {
    // Without the penalty, "select all that apply" is trivially gamed.
    expect(scoreChoice(question, pick('q-0', 'q-1', 'q-2', 'q-3'))).toBe(0);
  });

  it('floors at zero rather than going negative', () => {
    expect(scoreChoice(question, pick('q-2', 'q-3'))).toBe(0);
  });

  it('rounds repeating fractions to four places', () => {
    const thirds = q('t', [true, true, true], {
      selection: 'multi',
      partialCredit: true,
      points: 1,
    });
    expect(scoreChoice(thirds, pick('t-0'))).toBe(0.3333);
=======
describe('scoreChoice › multi with explicit rubric', () => {
  const question = q('q', [true, true, false], {
    selection: 'multi',
    rubric: rubricTwoOfOnePoint,
    points: 1,
  });

  it('awards full points for every correct option selected', () => {
    expect(scoreChoice(question, pick('q-0', 'q-1'))).toBe(1);
  });

  it('awards the rubric tier for one of two correct', () => {
    expect(scoreChoice(question, pick('q-0'))).toBe(0.5);
  });

  it('ignores wrong selections when looking up the rubric tier', () => {
    expect(scoreChoice(question, pick('q-0', 'q-2'))).toBe(0.5);
  });

  it('awards nothing when the stored rubric has no tier for that many correct', () => {
    // Reachable in real data rather than merely defensive: a teacher adds a
    // third correct option to a reopened paper without extending the rubric,
    // and the stored tiers now stop short of what a student can achieve.
    // Scoring zero is the safe failure — a marker will see it, where a mark
    // invented from a rubric that does not cover the case would pass unnoticed.
    const stale = q('stale', [true, true, true], {
      selection: 'multi',
      rubric: rubricTwoOfOnePoint,
      points: 1,
    });

    expect(scoreChoice(stale, pick('stale-0', 'stale-1', 'stale-2'))).toBe(0);
  });

  it('awards nothing when no correct options are selected', () => {
    expect(scoreChoice(question, pick('q-2'))).toBe(0);
  });

  it('is order independent', () => {
    expect(scoreChoice(question, pick('q-1', 'q-0'))).toBe(1);
  });
});

describe('scoreChoice › multi with one correct option only', () => {
  const question = q('q', [true, false, false], { selection: 'multi' });

  it('awards full points when the sole correct option is selected', () => {
    expect(scoreChoice(question, pick('q-0'))).toBe(4);
  });

  it('awards nothing when only wrong options are selected', () => {
    expect(scoreChoice(question, pick('q-1'))).toBe(0);
  });
});

describe('scoreChoice › legacy partialCredit migration', () => {
  it('uses all-or-nothing when partialCredit is false and rubric is null', () => {
    const question = q('q', [true, true, false], { selection: 'multi', partialCredit: false });
    expect(scoreChoice(question, pick('q-0', 'q-1'))).toBe(4);
    expect(scoreChoice(question, pick('q-0'))).toBe(0);
  });

  it('uses even split when partialCredit is true and rubric is null', () => {
    const question = q('q', [true, true, false, false], {
      selection: 'multi',
      partialCredit: true,
    });
    expect(scoreChoice(question, pick('q-0', 'q-1'))).toBe(4);
    expect(scoreChoice(question, pick('q-0'))).toBe(2);
    expect(scoreChoice(question, pick('q-0', 'q-2'))).toBe(2);
  });

  it('prefers explicit rubric over legacy partialCredit', () => {
    const custom = buildEvenSplitRubric(2, 1).map((tier, index) =>
      index === 1 ? { correctCount: 1, points: 0 } : tier,
    );
    const question = q('q', [true, true, false], {
      selection: 'multi',
      partialCredit: true,
      rubric: custom,
      points: 1,
    });
    expect(scoreChoice(question, pick('q-0'))).toBe(0);
>>>>>>> master
  });
});

describe('scoreChoice › defensive cases', () => {
  it('scores zero when no option is keyed correct', () => {
<<<<<<< HEAD
    // An authoring mistake. Award nothing rather than dividing by zero or
    // handing everyone full marks.
=======
>>>>>>> master
    expect(scoreChoice(q('q', [false, false]), pick('q-0'))).toBe(0);
    const multi = q('q', [false, false], { selection: 'multi', partialCredit: true });
    expect(scoreChoice(multi, pick('q-0'))).toBe(0);
  });

  it('scores zero for a missing response', () => {
    expect(scoreChoice(q('q', [true, false]), undefined)).toBe(0);
  });

  it('scores zero for a response of the wrong kind', () => {
<<<<<<< HEAD
    expect(scoreChoice(q('q', [true, false]), { kind: 'short', text: 'q-0' })).toBe(0);
=======
    expect(scoreChoice(q('q', [true, false]), { kind: 'short', doc: textToRichText('q-0') })).toBe(0);
>>>>>>> master
  });
});

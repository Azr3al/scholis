import { describe, expect, it } from 'vitest';
import { groupBySection, moveTo, orderOf, type QuestionGroup } from './question-groups';

interface Q {
  id: string;
  sectionId: string | null;
}
interface S {
  id: string;
}

const q = (id: string, sectionId: string | null = null): Q => ({ id, sectionId });
const s = (id: string): S => ({ id });

const groupsOf = (sections: S[], questions: Q[]): QuestionGroup<Q, S>[] =>
  groupBySection(sections, questions);

describe('groupBySection', () => {
  it('keeps paper numbering while grouping', () => {
    // The point of carrying both indexes: Gamma is Q3 whichever heading it sits
    // under, because a section is a label over one ordered list.
    const groups = groupsOf([s('a'), s('b')], [q('alpha', 'a'), q('beta', 'b'), q('gamma', 'a')]);

    expect(groups.map((g) => g.section?.id ?? null)).toEqual(['a', 'b']);
    expect(groups[0]?.items.map((i) => [i.question.id, i.index, i.indexInGroup])).toEqual([
      ['alpha', 0, 0],
      ['gamma', 2, 1],
    ]);
    expect(groups[1]?.items[0]?.index).toBe(1);
  });

  it('keeps an empty named section but drops an empty unsectioned one', () => {
    const groups = groupsOf([s('a')], [q('only', 'a')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.section?.id).toBe('a');
  });

  it('gives unsectioned questions a home at the end', () => {
    const groups = groupsOf([s('a')], [q('loose'), q('grouped', 'a')]);
    expect(groups.map((g) => g.section?.id ?? 'none')).toEqual(['a', 'none']);
    expect(groups[1]?.items.map((i) => i.question.id)).toEqual(['loose']);
  });

  it('orders sections by the section list, not by question position', () => {
    // The second section's question comes first in the paper; the headings must
    // still read in section order.
    const groups = groupsOf([s('a'), s('b')], [q('fromB', 'b'), q('fromA', 'a')]);
    expect(groups.map((g) => g.section?.id)).toEqual(['a', 'b']);
  });
});

describe('orderOf', () => {
  it('reads the view top to bottom', () => {
    const groups = groupsOf([s('a'), s('b')], [q('one', 'a'), q('two', 'b'), q('three', 'a')]);
    // Interleaved on disk, contiguous on screen — this is the order a drag
    // will settle the paper into.
    expect(orderOf(groups)).toEqual(['one', 'three', 'two']);
  });
});

describe('moveTo', () => {
  it('moves a question up within its section', () => {
    const groups = groupsOf([s('a')], [q('one', 'a'), q('two', 'a'), q('three', 'a')]);
    const result = moveTo(groups, 'three', { sectionId: 'a', beforeId: 'two' });

    expect(result?.questionIds).toEqual(['one', 'three', 'two']);
    // Same section, so nothing to reassign.
    expect(result?.sectionId).toBeUndefined();
  });

  it('moves a question down within its section', () => {
    const groups = groupsOf([s('a')], [q('one', 'a'), q('two', 'a'), q('three', 'a')]);
    const result = moveTo(groups, 'one', { sectionId: 'a', beforeId: 'three' });
    expect(result?.questionIds).toEqual(['two', 'one', 'three']);
  });

  it('appends to the end of a section rather than the end of the paper', () => {
    // The trap: "last in section A" is the middle of the flat list when B
    // follows it. Dropping at the end of A must not jump past B.
    const groups = groupsOf([s('a'), s('b')], [q('a1', 'a'), q('a2', 'a'), q('b1', 'b')]);
    const result = moveTo(groups, 'a1', { sectionId: 'a', beforeId: null });

    expect(result?.questionIds).toEqual(['a2', 'a1', 'b1']);
  });

  it('carries a question into another section and reports the change', () => {
    const groups = groupsOf([s('a'), s('b')], [q('a1', 'a'), q('b1', 'b')]);
    const result = moveTo(groups, 'a1', { sectionId: 'b', beforeId: 'b1' });

    expect(result?.questionIds).toEqual(['a1', 'b1']);
    // The order happens to be unchanged, but the section is not — and without
    // this the question would silently stay in its old section.
    expect(result?.sectionId).toBe('b');
  });

  it('carries a question out of every section', () => {
    const groups = groupsOf([s('a')], [q('a1', 'a'), q('loose')]);
    const result = moveTo(groups, 'a1', { sectionId: null, beforeId: 'loose' });

    expect(result?.sectionId).toBeNull();
    expect(result?.questionIds).toEqual(['a1', 'loose']);
  });

  it('drops into an empty section', () => {
    const groups = groupsOf([s('a'), s('empty')], [q('a1', 'a')]);
    const result = moveTo(groups, 'a1', { sectionId: 'empty', beforeId: null });

    expect(result?.sectionId).toBe('empty');
    expect(result?.questionIds).toEqual(['a1']);
  });

  it('settles an interleaved paper into what the teacher sees', () => {
    // Positions alternate between sections, so students would see a heading
    // appear, vanish and return. Any drag rewrites the whole order, which fixes
    // it without a separate repair step.
    const groups = groupsOf(
      [s('a'), s('b')],
      [q('a1', 'a'), q('b1', 'b'), q('a2', 'a'), q('b2', 'b')],
    );
    const result = moveTo(groups, 'a2', { sectionId: 'a', beforeId: 'a1' });

    expect(result?.questionIds).toEqual(['a2', 'a1', 'b1', 'b2']);
  });

  it('treats a drop onto itself as no move at all', () => {
    const groups = groupsOf([s('a')], [q('one', 'a'), q('two', 'a')]);
    expect(moveTo(groups, 'one', { sectionId: 'a', beforeId: 'one' })).toBeNull();
  });

  it('refuses a question it does not have', () => {
    const groups = groupsOf([s('a')], [q('one', 'a')]);
    expect(moveTo(groups, 'ghost', { sectionId: 'a', beforeId: null })).toBeNull();
  });

  it('refuses a target that has gone', () => {
    const groups = groupsOf([s('a')], [q('one', 'a'), q('two', 'a')]);
    expect(moveTo(groups, 'one', { sectionId: 'a', beforeId: 'gone' })).toBeNull();
  });

  it('keeps every question when one moves', () => {
    // A reorder that loses or duplicates a question changes what students are
    // marked on, and the server rejects anything that is not a permutation.
    const questions = [q('a1', 'a'), q('a2', 'a'), q('b1', 'b'), q('loose')];
    const groups = groupsOf([s('a'), s('b')], questions);
    const result = moveTo(groups, 'b1', { sectionId: 'a', beforeId: 'a1' });

    expect([...(result?.questionIds ?? [])].sort()).toEqual(questions.map((x) => x.id).sort());
  });
});

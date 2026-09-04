import { describe, expect, it } from 'vitest';
import { buildFilteredDisplay, buildGroupedDisplay, buildTestListDisplay } from './test-tag-views';
import type { TestSummary } from '@scholis/contracts';

const test = (id: string, title: string, tagIds: string[]): TestSummary => ({
  id,
  title,
  status: 'draft',
  code: id.slice(0, 6),
  timeLimitMinutes: null,
  allowNavigation: true,
  testTakingMode: false,
  maxAttempts: 1,
  questionCount: 0,
  updatedAt: new Date().toISOString(),
  tags: tagIds.map((tagId) => ({ id: tagId, name: tagId })),
});

describe('test-tag-views', () => {
  it('groups multi-tagged tests under each tag and lists untagged separately', () => {
    const tests = [test('a', 'Alpha', ['t1']), test('b', 'Beta', ['t1', 't2']), test('c', 'Gamma', [])];
    const orgTags = [
      { id: 't1', name: 'One', position: 0 },
      { id: 't2', name: 'Two', position: 1 },
    ];

    const groups = buildGroupedDisplay(tests, orgTags, '');
    expect(groups.find((g) => g.key === 't1')?.tests.map((t) => t.id)).toEqual(['a', 'b']);
    expect(groups.find((g) => g.key === 't2')?.tests.map((t) => t.id)).toEqual(['b']);
    expect(groups.find((g) => g.key === 'untagged')?.tests.map((t) => t.id)).toEqual(['c']);
  });

  it('filters with OR union and dedupes', () => {
    const tests = [test('a', 'Alpha', ['t1']), test('b', 'Beta', ['t2']), test('c', 'Both', ['t1', 't2'])];
    const filtered = buildFilteredDisplay(tests, new Set(['t1', 't2']), '');
    expect(filtered.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('scopes search to the filtered set only', () => {
    const tests = [test('a', 'Alpha exam', ['t1']), test('b', 'Beta quiz', ['t1'])];
    const display = buildTestListDisplay(tests, [{ id: 't1', name: 'One', position: 0 }], new Set(['t1']), 'alpha');
    expect(display.mode).toBe('filtered');
    if (display.mode === 'filtered') {
      expect(display.tests.map((t) => t.id)).toEqual(['a']);
    }
  });
});

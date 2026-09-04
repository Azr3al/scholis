import type { TestSummary, TestTag } from '@scholis/contracts';

export interface TestListGroup {
  key: string;
  label: string;
  tests: TestSummary[];
}

export type TestListDisplay =
  | { mode: 'grouped'; groups: TestListGroup[] }
  | { mode: 'filtered'; tests: TestSummary[] };

const matchesSearch = (test: TestSummary, query: string): boolean =>
  query === '' || test.title.toLowerCase().includes(query);

/** All view (no tag filter): groups by org tag + Untagged; search scoped per group. */
export const buildGroupedDisplay = (
  tests: TestSummary[],
  orgTags: TestTag[],
  search: string,
): TestListGroup[] => {
  const query = search.trim().toLowerCase();
  const groups: TestListGroup[] = [];

  for (const tag of orgTags) {
    const groupTests = tests.filter(
      (test) => test.tags.some((t) => t.id === tag.id) && matchesSearch(test, query),
    );
    groups.push({ key: tag.id, label: tag.name, tests: groupTests });
  }

  const untagged = tests.filter((test) => test.tags.length === 0 && matchesSearch(test, query));
  if (untagged.length > 0 || (query === '' && tests.some((test) => test.tags.length === 0))) {
    groups.push({ key: 'untagged', label: 'Untagged', tests: untagged });
  }

  return groups;
};

/** Filtered view: OR union across selected tags, deduped, then search. */
export const buildFilteredDisplay = (
  tests: TestSummary[],
  selectedTagIds: Set<string>,
  search: string,
): TestSummary[] => {
  const query = search.trim().toLowerCase();
  const seen = new Set<string>();
  const result: TestSummary[] = [];

  for (const test of tests) {
    if (seen.has(test.id)) continue;
    if (!test.tags.some((tag) => selectedTagIds.has(tag.id))) continue;
    if (!matchesSearch(test, query)) continue;
    seen.add(test.id);
    result.push(test);
  }

  return result;
};

export const buildTestListDisplay = (
  tests: TestSummary[],
  orgTags: TestTag[],
  selectedTagIds: Set<string>,
  search: string,
): TestListDisplay => {
  if (selectedTagIds.size === 0) {
    return { mode: 'grouped', groups: buildGroupedDisplay(tests, orgTags, search) };
  }
  return {
    mode: 'filtered',
    tests: buildFilteredDisplay(tests, selectedTagIds, search),
  };
};

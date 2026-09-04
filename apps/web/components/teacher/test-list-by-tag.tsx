'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { TestSummary } from '@/lib/api';
import type { TestListDisplay } from '@/lib/teacher/test-tag-views';
import Link from 'next/link';

const TestCard = ({ test }: { test: TestSummary }) => (
  <Card className="transition-ui hover:bg-muted">
    <Link href={`/teacher/${test.id}`} className="block rounded-[inherit]">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">{test.title}</p>
          <p className="text-sm text-muted-foreground">
            {test.code} · {test.questionCount}{' '}
            {test.questionCount === 1 ? 'question' : 'questions'}
          </p>
        </div>
        <Badge variant={test.status === 'published' ? 'default' : 'secondary'}>{test.status}</Badge>
      </CardContent>
    </Link>
  </Card>
);

export const TestListByTag = ({
  display,
  loading,
  search,
  hasTests,
}: {
  display: TestListDisplay | null;
  loading: boolean;
  search: string;
  hasTests: boolean;
}) => {
  if (loading) {
    return (
      <div className="flex flex-col gap-3" data-testid="test-list">
        {[0, 1, 2].map((i) => (
          <Card key={i} aria-hidden>
            <CardContent className="flex animate-pulse flex-col gap-2 p-4">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (display === null) return null;

  if (display.mode === 'grouped') {
    const visibleGroups = display.groups.filter(
      (group) => group.tests.length > 0 || search.trim() === '',
    );
    const anyVisible = visibleGroups.some((group) => group.tests.length > 0);

    return (
      <div className="flex flex-col gap-6" data-testid="test-list">
        {visibleGroups.map((group) => (
          <section key={group.key} data-testid={`test-group-${group.key}`}>
            <h2 className="mb-2 text-sm font-semibold text-foreground">{group.label}</h2>
            <div className="flex flex-col gap-3">
              {group.tests.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid={`empty-group-${group.key}`}>
                  No tests in this group.
                </p>
              ) : (
                group.tests.map((test) => <TestCard key={`${group.key}-${test.id}`} test={test} />)
              )}
            </div>
          </section>
        ))}

        {!anyVisible && search.trim() !== '' && (
          <p className="text-sm text-muted-foreground" data-testid="no-search-results">
            No tests match your search.
          </p>
        )}

        {!anyVisible && search.trim() === '' && !hasTests && (
          <p className="text-sm text-muted-foreground" data-testid="no-tests">
            No tests yet. Create one above and you&apos;ll get a code to share.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="test-list">
      {display.tests.map((test) => (
        <TestCard key={test.id} test={test} />
      ))}

      {display.tests.length === 0 && search.trim() !== '' && (
        <p className="text-sm text-muted-foreground" data-testid="no-search-results">
          No tests match your search.
        </p>
      )}

      {display.tests.length === 0 && search.trim() === '' && hasTests && (
        <p className="text-sm text-muted-foreground" data-testid="no-filter-results">
          No tests match the selected tags.
        </p>
      )}

      {display.tests.length === 0 && search.trim() === '' && !hasTests && (
        <p className="text-sm text-muted-foreground" data-testid="no-tests">
          No tests yet. Create one above and you&apos;ll get a code to share.
        </p>
      )}
    </div>
  );
};

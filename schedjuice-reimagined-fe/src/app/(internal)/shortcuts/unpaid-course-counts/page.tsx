"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { makePostRequest } from "@/app/client-api/utils";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { Button, Input, Select, Skeleton } from "@/components/primitives";
// Legacy toast API (title/description/variant) — primitive useToast is incompatible.
import { useToast } from "@/components/primitives";
import {
  canAccessStaffShortcuts,
  canAccessUnpaidCourseShortcut,
} from "@/helpers/authorization";
import {
  COURSE_START_TIMING_LABEL_EARLY,
  COURSE_START_TIMING_LABEL_LATER,
  getCalendarMonthUtcFilterBounds,
} from "@/helpers/date";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { TransactionScreenshotStrategy } from "@/types/organization";
import {
  parseCourseMonthFilter,
  UnpaidShortcutCourseMonthFilter,
} from "@/types/unpaid-course-shortcut";
import { useQuery } from "@tanstack/react-query";
import { Copy, NavArrowLeft, Search } from "iconoir-react";
import Link from "next/link";
import { parseAsIsoDateTime, parseAsString, useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { queryParamDefault } from "@/config/defaults";
import { FilterToolbar } from "@/components/filters/filter-toolbar";

type UnpaidCourseSummaryRow = {
  course_id: number;
  title: string;
  category_id: number | null;
  category_name: string;
  category_sort_order?: number;
  unpaid_count: number;
};

type UnpaidCourseSummaryCourseRow = {
  title: string;
  unpaid_count: number;
  course_id: number;
};

function unwrapUnpaidSummaryRows(res: {
  data: { data?: unknown; isError?: boolean; message?: string };
}): UnpaidCourseSummaryRow[] {
  const inner = res.data?.data;
  if (Array.isArray(inner)) return inner as UnpaidCourseSummaryRow[];
  if (
    inner &&
    typeof inner === "object" &&
    Array.isArray((inner as { data?: unknown }).data)
  ) {
    return (inner as { data: UnpaidCourseSummaryRow[] }).data;
  }
  return [];
}

function buildCategoryCopyBlock(
  categoryName: string,
  courses: { title: string; unpaid_count: number }[],
): string {
  const lines = [
    categoryName,
    ...courses.map((c) => `${c.title} - ${c.unpaid_count}`),
  ];
  return lines.join("\n");
}

export default function UnpaidCourseCountsPage() {
  const { user, isLoading: userLoading } = useUser();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const router = useRouter();
  const toast = useToast();
  const [courseNameSearch, setCourseNameSearch] = useState("");

  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );

  const [courseMonthRaw, setCourseMonthRaw] = useQueryState(
    "courseMonth",
    parseAsString.withDefault(UnpaidShortcutCourseMonthFilter.All),
  );

  const courseMonthFilter = parseCourseMonthFilter(courseMonthRaw);

  const isAdminUploadFlow =
    tenant?.transaction_screenshot_strategy ===
    TransactionScreenshotStrategy.admin_upload;

  useEffect(() => {
    if (!userLoading && user && !canAccessStaffShortcuts(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (
      !userLoading &&
      user &&
      canAccessStaffShortcuts(user) &&
      !canAccessUnpaidCourseShortcut(user)
    ) {
      router.replace("/shortcuts");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (
      !userLoading &&
      !tenantLoading &&
      user &&
      canAccessUnpaidCourseShortcut(user) &&
      tenant &&
      !isAdminUploadFlow
    ) {
      router.replace("/shortcuts");
    }
  }, [
    userLoading,
    tenantLoading,
    user,
    tenant,
    isAdminUploadFlow,
    router,
  ]);

  const allowed = user ? canAccessUnpaidCourseShortcut(user) : false;
  const fmHmFilterEnabled = !!tenant?.is_fm_hm_course_display_enabled;

  const monthDate = date ?? new Date();
  const monthBounds = getCalendarMonthUtcFilterBounds(monthDate);
  const firstIso = monthBounds.start.toISOString();
  const lastIso = monthBounds.end.toISOString();

  const summaryQuery = useQuery({
    queryKey: [
      "unpaid-course-summary",
      firstIso,
      lastIso,
      fmHmFilterEnabled ? courseMonthFilter : UnpaidShortcutCourseMonthFilter.All,
    ],
    queryFn: async () => {
      const body: {
        filter_params: {
          field_name: string;
          operator: string;
          value: string;
        }[];
        exclude_params: unknown[];
        course_month_type?: string;
      } = {
        filter_params: [
          {
            field_name: "issued_at",
            operator: operatorEnum.gte,
            value: firstIso,
          },
          {
            field_name: "issued_at",
            operator: operatorEnum.lte,
            value: lastIso,
          },
        ],
        exclude_params: [],
      };
      if (
        fmHmFilterEnabled &&
        courseMonthFilter !== UnpaidShortcutCourseMonthFilter.All
      ) {
        body.course_month_type = courseMonthFilter;
      }
      const res = await makePostRequest(
        "user-payments/unpaid-course-summary",
        body,
        queryParamDefault,
      );
      return unwrapUnpaidSummaryRows(res);
    },
    enabled: allowed && isAdminUploadFlow && !!tenant && !tenantLoading,
  });

  const filteredRows = useMemo(() => {
    const list = summaryQuery.data ?? [];
    const q = courseNameSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.title.toLowerCase().includes(q));
  }, [summaryQuery.data, courseNameSearch]);

  const byCategory = useMemo(() => {
    const map = new Map<
      string,
      { sortOrder: number; rows: UnpaidCourseSummaryCourseRow[] }
    >();
    for (const r of filteredRows) {
      const name = r.category_name || "Uncategorized";
      const sortOrder = r.category_sort_order ?? 0;
      let slot = map.get(name);
      if (!slot) {
        slot = { sortOrder, rows: [] };
        map.set(name, slot);
      }
      slot.rows.push({
        course_id: r.course_id,
        title: r.title,
        unpaid_count: r.unpaid_count,
      });
    }
    for (const slot of Array.from(map.values())) {
      slot.rows.sort((a: UnpaidCourseSummaryCourseRow, b: UnpaidCourseSummaryCourseRow) =>
        a.title.localeCompare(b.title),
      );
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const oa = a[1].sortOrder;
        const ob = b[1].sortOrder;
        if (oa !== ob) return oa - ob;
        return a[0].localeCompare(b[0]);
      })
      .map(
        ([name, slot]) => [name, slot.rows] as [string, UnpaidCourseSummaryCourseRow[]],
      );
  }, [filteredRows]);

  const copyCategory = (
    categoryName: string,
    courses: { title: string; unpaid_count: number }[],
  ) => {
    const block = buildCategoryCopyBlock(categoryName, courses);
    if (!block) return;
    void navigator.clipboard.writeText(block).then(() => {
      toast.add({ title: `Copied ${categoryName}` });
    });
  };

  const headerToolbar = (
    <FilterToolbar className="flex-col sm:flex-row sm:items-end">
      <YearMonthSelector
        layout="toolbar"
        label="Month"
        date={monthDate}
        setDate={(d) => setDate(d)}
      />
      {fmHmFilterEnabled ? (
        <div className="flex w-full min-w-[12rem] flex-col gap-1.5 sm:w-56">
          <span
            id="unpaid-course-month-type-label"
            className="text-xs font-medium text-text-secondary"
          >
            When the class starts in the month
          </span>
          <Select
            className="h-9 w-full"
            value={courseMonthFilter}
            onValueChange={(v) =>
              setCourseMonthRaw(v as UnpaidShortcutCourseMonthFilter)
            }
            aria-labelledby="unpaid-course-month-type-label"
            items={[
              {
                value: UnpaidShortcutCourseMonthFilter.All,
                label: "All classes",
              },
              {
                value: UnpaidShortcutCourseMonthFilter.FM,
                label: COURSE_START_TIMING_LABEL_EARLY,
              },
              {
                value: UnpaidShortcutCourseMonthFilter.HM,
                label: COURSE_START_TIMING_LABEL_LATER,
              },
            ]}
            placeholder="All classes"
          />
        </div>
      ) : null}
    </FilterToolbar>
  );

  usePageHeader(
    useMemo(
      () =>
        user && canAccessStaffShortcuts(user) && allowed && isAdminUploadFlow
          ? {
              breadcrumb: (
                <h1 className="font-serif text-lg text-text-primary">
                  Unpaid students by course
                </h1>
              ),
              toolbar: headerToolbar,
            }
          : null,
      [
        user,
        allowed,
        isAdminUploadFlow,
        monthDate,
        courseMonthFilter,
        fmHmFilterEnabled,
        setDate,
        setCourseMonthRaw,
      ],
    ),
  );

  if (userLoading || (user && !canAccessStaffShortcuts(user))) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!userLoading && !user) {
    return null;
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
                <div
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (tenantLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
                <div
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-w-0 max-w-full space-y-4">
        <Link
          href="/shortcuts"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Shortcuts
        </Link>
        <p className="text-text-muted text-sm" role="status">
          Organization settings could not be loaded. Refresh the page or try
          again later.
        </p>
      </div>
    );
  }

  if (!isAdminUploadFlow) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
                <div
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary motion-reduce:animate-none"
        />
      </div>
    );
  }

  return  (
<PageContainer width="default" className="min-w-0 max-w-full space-y-4">
      <header className="space-y-2">
        <Link
          href="/shortcuts"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Shortcuts
        </Link>
        <p className="max-w-2xl text-xs leading-snug text-text-muted sm:text-sm">
          For the month you pick, see how many students still owe payment in each
          class. Results are grouped by category. Students who left the class are
          not counted.
        </p>
      </header>

      {summaryQuery.isLoading ? (
        <Skeleton className="h-32 w-full" aria-busy />
      ) : summaryQuery.isError ? (
        <p className="text-danger text-sm" role="alert">
          Failed to load unpaid summary. Please try again.
        </p>
      ) : (summaryQuery.data?.length ?? 0) === 0 ? (
        <p className="text-text-muted text-sm py-4 text-center border rounded-lg text-balance">
          No classes match this month
          {fmHmFilterEnabled &&
            courseMonthFilter !== UnpaidShortcutCourseMonthFilter.All
            ? " and the start date you chose"
            : ""}
          .
        </p>
      ) : (
        <div className="space-y-4">
          <div className="relative w-full max-w-sm min-w-0">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search by class name…"
              value={courseNameSearch}
              onChange={(e) => setCourseNameSearch(e.target.value)}
              className="h-9 pl-8 text-sm"
              aria-label="Filter by class name"
            />
          </div>
          {filteredRows.length === 0 ? (
            <p className="text-text-muted text-sm py-4 text-center border rounded-lg text-balance">
              No classes match &quot;{courseNameSearch.trim()}&quot;.
            </p>
          ) : (
            <div className="space-y-6">
              {byCategory.map(([catName, courses]) => (
                <section key={catName} className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1">
                    <h2 className="text-base font-semibold break-words">
                      {catName}
                    </h2>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => copyCategory(catName, courses)}
                    >
                      <Copy className="size-3.5" aria-hidden />
                      Copy
                    </Button>
                  </div>
                  <ul className="list-none space-y-1 text-sm">
                    {courses.map((c) => (
                      <li key={c.course_id}>
                        {c.title} - {c.unpaid_count}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
);
}

"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { searchEntities } from "@/app/client-api/utils";
import CopyInput from "@/components/misc/copy-input";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { MeetingLinkCourseCard } from "@/components/shortcuts/meeting-link-course-card";
import {
  canAccessMeetingLinkSheet,
  canAccessStaffShortcuts,
} from "@/helpers/authorization";
import {
  getDateISOString,
  getFirstDayOfMonth,
  getLastDayOfMonth,
} from "@/helpers/date";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import {
  getCategoryDisplayName,
  getCategorySortOrderFromCourse,
} from "@/helpers/category-grouping";
import type { courseType } from "@/types/course";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft, Search } from "iconoir-react";
import Link from "next/link";
import { parseAsBoolean, parseAsIsoDateTime, useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Input, Skeleton, Switch, useToast } from "@/components/primitives";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
function MeetingLinkSheetContent() {
  const { user, isLoading: userLoading } = useUser();
  const router = useRouter();
  const toast = useToast();
  const [shareUrl, setShareUrl] = useState("");
  const [courseNameSearch, setCourseNameSearch] = useState("");

  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );

  const [startsThisMonthOnly, setStartsThisMonthOnly] = useQueryState(
    "startsThisMonthOnly",
    parseAsBoolean.withDefault(false),
  );

  useEffect(() => {
    setShareUrl(typeof window !== "undefined" ? window.location.href : "");
  }, [date, startsThisMonthOnly]);

  const allowed = user ? canAccessMeetingLinkSheet(user) : false;

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
      !canAccessMeetingLinkSheet(user)
    ) {
      router.replace("/shortcuts");
    }
  }, [userLoading, user, router]);

  const monthDate = date ?? new Date();
  const firstDay = getFirstDayOfMonth(monthDate);
  const lastDay = getLastDayOfMonth(monthDate);
  const firstIso = getDateISOString(firstDay);
  const lastIso = getDateISOString(lastDay);

  const coursesQuery = useQuery({
    queryKey: [
      "meeting-link-sheet-courses",
      firstIso,
      lastIso,
    ],
    queryFn: async () => {
      const res = await searchEntities(
        "courses",
        {
          size: -1,
          expand: ["category"],
          sorts: ["title"],
          fields: [
            "id",
            "title",
            "meeting_link",
            "meeting_scheduled_at",
            "meeting_join_id",
            "meeting_passcode",
            "category",
            "start_date",
          ],
        },
        {
          filter_params: [
            {
              field_name: "start_date",
              operator: operatorEnum.lte,
              value: lastIso,
            },
            {
              field_name: "end_date",
              operator: operatorEnum.gte,
              value: firstIso,
            },
          ],
        },
      );
      return (res.data.data ?? []) as courseType[];
    },
    enabled: allowed,
  });

  const withMeetingLink = useMemo(() => {
    const list = coursesQuery.data ?? [];
    return list.filter((c) => c.meeting_link && String(c.meeting_link).trim());
  }, [coursesQuery.data]);

  const rows = useMemo(() => {
    if (!startsThisMonthOnly) return withMeetingLink;
    return withMeetingLink.filter((c) => {
      const sd = new Date(c.start_date);
      return (
        sd.getFullYear() === monthDate.getFullYear() &&
        sd.getMonth() === monthDate.getMonth()
      );
    });
  }, [withMeetingLink, startsThisMonthOnly, monthDate]);

  const filteredRows = useMemo(() => {
    const q = courseNameSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => c.title.toLowerCase().includes(q));
  }, [rows, courseNameSearch]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { sortOrder: number; courses: courseType[] }>();
    for (const c of filteredRows) {
      const name = getCategoryDisplayName(c);
      const sortOrder = getCategorySortOrderFromCourse(c);
      let slot = map.get(name);
      if (!slot) {
        slot = { sortOrder, courses: [] };
        map.set(name, slot);
      }
      slot.courses.push(c);
    }
    for (const slot of Array.from(map.values())) {
      slot.courses.sort((a: courseType, b: courseType) =>
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
      .map(([name, slot]) => [name, slot.courses] as [string, courseType[]]);
  }, [filteredRows]);

  const copyText = (label: string, text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      toast.add({ title: `Copied ${label}` });
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
      <div className="flex w-full max-w-sm items-center justify-between gap-3 rounded-md border px-3 py-2 sm:max-w-none">
        <label
          htmlFor="meeting-sheet-starts-this-month"
          className="cursor-pointer text-sm font-normal leading-snug"
        >
          This month&apos;s course only
        </label>
        <Switch
          id="meeting-sheet-starts-this-month"
          checked={startsThisMonthOnly}
          onCheckedChange={(checked) =>
            void setStartsThisMonthOnly(checked ? true : null)
          }
          aria-describedby="meeting-sheet-starts-this-month-hint"
        />
      </div>
    </FilterToolbar>
  );

  usePageHeader(
    useMemo(
      () =>
        user && canAccessStaffShortcuts(user) && allowed
          ? {
              breadcrumb: (
                <h1 className="font-serif text-lg text-text-primary">
                  Meeting link sheet
                </h1>
              ),
              toolbar: headerToolbar,
            }
          : null,
      [user, allowed, monthDate, startsThisMonthOnly, setDate, setStartsThisMonthOnly],
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
        <Spinner className="h-8 w-8 text-text-muted" />
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
          Courses in the selected month with a Teams meeting link, by
          category.
        </p>
        <p
          id="meeting-sheet-starts-this-month-hint"
          className="max-w-2xl text-xs leading-snug text-text-muted"
        >
          When on, you only see classes that begin during the month you picked.
          They still need an online meeting link for this list.
        </p>
      </header>

      <CopyInput
        className="space-y-1.5"
        label="Share this list"
        text={shareUrl}
        description="The link keeps the same month and options so someone else sees what you see."
      />

      {coursesQuery.isLoading ? (
        <Skeleton className="h-32 w-full" aria-busy />
      ) : coursesQuery.isError ? (
        <p className="text-danger text-sm" role="alert">
          Failed to load courses. Please try again.
        </p>
      ) : withMeetingLink.length === 0 ? (
        <p className="text-text-muted text-sm py-4 text-center border rounded-lg text-balance">
          No courses with a meeting link overlap this month.
        </p>
      ) : startsThisMonthOnly && rows.length === 0 ? (
        <p className="text-text-muted text-sm py-4 text-center border rounded-lg text-balance">
          No courses with a meeting link start in the selected month.
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
                  <h2 className="text-base font-semibold border-b pb-1 break-words">
                    {catName}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {courses.map((c) => (
                      <MeetingLinkCourseCard
                        key={c.id}
                        course={c}
                        onCopy={copyText}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
);
}

export default MeetingLinkSheetContent;

"use client";

import {
  getUnpaidStudentColumns,
  unpaidStudentColumnLayout,
} from "@/app/(internal)/finances/unpaid-students/unpaid-student-columns";
import { applyColumnLayoutMeta } from "@/lib/finances/apply-column-layout-meta";
import EntityCombobox from "@/components/form/entity-combobox";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import CopyInput from "@/components/misc/copy-input";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import {
  getActiveCourseFilterParams,
  getCalendarMonthUtcFilterBounds,
  getCourseMonthType,
} from "@/helpers/date";
import { formatMonthLong } from "@/helpers/payment-coverage-months";
import { hasSchoolWideUnpaidAccess } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { useUnpaidUsersList } from "@/sdk/hooks/unpaid-users";
import { operatorEnum } from "@/types/api";
import { TransactionScreenshotStrategy } from "@/types/organization";
import { OpenNewWindow } from "iconoir-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseAsIsoDateTime, useQueryState } from "nuqs";
import { Suspense, useEffect, useMemo, useState } from "react";

const UnpaidStudentView = () => {
  const searchParams = useSearchParams();
  const { tenant } = useTenant();
  const { user } = useUser();
  const isUserUpload =
    tenant?.transaction_screenshot_strategy ===
    TransactionScreenshotStrategy.user_upload;
  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );
  const [courseId, setCourseId] = useQueryState("courseId", {
    parse: (v) => v,
    defaultValue: null,
  });
  const canLoadWithoutCourse =
    (isUserUpload && !!user && hasSchoolWideUnpaidAccess(user)) ||
    courseId !== null;

  const [selectedCourseStartDate, setSelectedCourseStartDate] = useState<
    string | undefined
  >(undefined);

  const unpaidMonthFilterType = useMemo(() => {
    if (!selectedCourseStartDate) return null;
    return getCourseMonthType(selectedCourseStartDate);
  }, [selectedCourseStartDate]);

  useEffect(() => {
    if (!searchParams.get("date")) {
      void setDate(new Date());
    }
  }, []);

  const monthBounds = useMemo(
    () => getCalendarMonthUtcFilterBounds(date),
    [date?.getFullYear(), date?.getMonth()],
  );

  const monthLabel = formatMonthLong(date.getFullYear(), date.getMonth() + 1);

  useFinancePageHeader();

  const tableState = useResourceTableState({
    namespace: "unpaid-users",
    syncUrl: false,
    initial: { pageSize: 100 },
  });

  const filterParams = useMemo(
    () => [
      {
        field_name: "issued_at",
        operator: operatorEnum.gte,
        value: monthBounds.start.toISOString(),
      },
      {
        field_name: "issued_at",
        operator: operatorEnum.lte,
        value: monthBounds.end.toISOString(),
      },
      ...(courseId
        ? [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: String(courseId),
            },
          ]
        : []),
    ],
    [monthBounds, courseId],
  );

  const list = useUnpaidUsersList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    filterParams,
    enabled: canLoadWithoutCourse,
  });

  const neverPaid = list.rows.filter((r) => r.paid_until == null).length;
  const behind = list.rows.filter((r) => r.paid_until != null).length;

  const columns = useMemo(
    () =>
      applyColumnLayoutMeta(
        getUnpaidStudentColumns(!courseId),
        unpaidStudentColumnLayout,
      ),
    [courseId],
  );

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-text-muted">
        Dropped-out students are excluded from this report.
      </p>
      <div>
        <p className="text-lg font-bold mb-3">
          Total unpaid for {monthLabel}: {list.rows.length}
        </p>
        <p className="text-lg font-bold mb-3">Never paid: {neverPaid}</p>
        <p className="text-lg font-bold mb-3">Behind: {behind}</p>
      </div>

      <div className="flex flex-wrap justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:max-w-md">
          <EntityCombobox
            containerClassName="flex w-full min-w-0 flex-col gap-1.5"
              customComponent={(data, cid) => (
                <div>
                  <Link
                    target="_blank"
                    href={`/courses/${cid}`}
                    className="text-sm underline items-center gap-2 flex"
                  >
                    <span>Go to course </span>
                    <OpenNewWindow width={18} height={18} aria-hidden />
                  </Link>
                </div>
              )}
              filterParams={{
                filter_params: [...getActiveCourseFilterParams()],
              }}
              queryParams={{
                fields: ["title", "id", "start_date"],
                sorts: ["title"],
              }}
              displayFunction={(e) => e.title}
              entity={"courses"}
              value={courseId}
              onChange={(v) => setCourseId(v)}
              onSelectedEntityChange={(entity) => {
                if (!entity) {
                  setSelectedCourseStartDate(undefined);
                  return;
                }
                setSelectedCourseStartDate(
                  typeof entity.start_date === "string"
                    ? entity.start_date
                    : undefined,
                );
              }}
              label="Select a course"
              canSetDefaultValue={true}
            />
          <div className="flex w-full min-w-0 flex-col gap-1.5">
            <p className="text-sm">Filter by Month</p>
            <YearMonthSelector
              date={date}
              setDate={setDate}
              monthType={unpaidMonthFilterType}
            />
          </div>
        </div>
        <CopyInput
          disabled={true}
          label="Share report link"
          text={typeof window !== "undefined" ? window.location.href : ""}
        />
      </div>

      <div className="min-w-0 overflow-x-auto">
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={columns}
          getRowId={(row) => String(row.id)}
        />
      </div>
    </div>
  );
};

const UnpaidStudentViewSuspence = () => {
  return (
    <PageContainer width="wide">
      <Suspense>
        <UnpaidStudentView />
      </Suspense>
    </PageContainer>
  );
};

export default UnpaidStudentViewSuspence;

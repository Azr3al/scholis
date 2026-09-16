"use client";

import { PageContainer } from "@/components/layout/page-container";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { makePostRequest } from "@/app/client-api/utils";
import { Loader } from "@/components/form/loader";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import { Button } from "@/components/primitives";
import {
  getDateISOString,
  getFirstDayOfMonth,
  getLastDayOfMonth,
} from "@/helpers/date";
import { useMutation } from "@tanstack/react-query";
import { parseAsIsoDateTime, useQueryState } from "nuqs";
import { Suspense, useMemo } from "react";

const MicrosoftPayrollReportPage = () => {
  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date())
  );

  const downloadPayroll = async (payload: {
    startDate: string;
    endDate: string;
  }) => {
    const res = await makePostRequest(
      "reports/hr/payroll",
      payload,
      {},
      {},
      { responseType: "blob" }
    );
    return res.data;
  };

  const { mutate: downloadExcel, isPending } = useMutation({
    mutationFn: downloadPayroll,
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `microsoft_payroll_${getDateISOString(getFirstDayOfMonth(date))}_${getDateISOString(getLastDayOfMonth(date))}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
  });

  const handleDownload = () => {
    downloadExcel({
      startDate: getDateISOString(getFirstDayOfMonth(date)),
      endDate: getDateISOString(getLastDayOfMonth(date)),
    });
  };

  useFinancePageHeader();

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Download UserAttendance-based payroll report (Excel). One row per user
        with Total Sessions, Total Hours, Earnings; includes summary totals.
      </p>
      <FilterToolbar>
        <YearMonthSelector layout="toolbar" label="Month" date={date} setDate={setDate} />
        <Button onClick={handleDownload} isLoading={isPending}>
          Download Excel
        </Button>
      </FilterToolbar>
      {isPending && (
        <div className="flex items-center gap-3">
          <Loader />
          <span className="text-sm text-text-muted">Generating report…</span>
        </div>
      )}
    </div>
  );
};

export default function MicrosoftPayrollPage() {
  return  (
<PageContainer width="wide">
<Suspense>
      <MicrosoftPayrollReportPage />
    </Suspense>
</PageContainer>
);
}

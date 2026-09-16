"use client";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { makeGetRequest } from "@/app/client-api/utils";

import { Button, Skeleton } from "@/components/primitives";
import { DatePicker } from "@/components/date/date-picker";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ChartConfig } from "@/components/charts/chart";
import GenericLineChart from "@/components/charts/generic-line-chart";
import {
  apiDataToAreaChartData,
  apiDataToPieChartData,
  dateCountToRange,
  getPieChartConfig,
} from "@/helpers/charts";
import moment from "moment";
import { useToast } from "@/components/primitives";
import { GenericPieChart } from "@/components/charts/generic-pie-chart";
import { formatDate } from "@/helpers/date";
import { usePageHeader } from "@/components/shell/use-page-header";
import {
  dashboardMetricGridClassName,
  dashboardSectionStackClassName,
} from "@/lib/ui-remediation/r7-dashboard-layout-classes";
import { FilterToolbar, FilterToolbarField } from "@/components/filters/filter-toolbar";

const chartConfig = {
  desktop: {
    label: "y",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const ManagementDashboardPage = () => {
  const [startDate, setStartDate] = useState<Date | undefined>(
    moment(new Date()).subtract(1, "week").toDate(),
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [chartsData, setChartsData] = useState<any[][]>([]);
  const toast = useToast();

  const getChartData = useQuery({
    queryKey: ["getChartData"],
    queryFn: () =>
      makeGetRequest("reports/charts", {
        range: `${moment(startDate).format("YYYY-MM-DD")}:${moment(
          endDate,
        ).format("YYYY-MM-DD")}`,
        range_group_by: dateCountToRange(startDate!, endDate!),
      }),
    enabled: false,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Dashboard</h1>
      ),
      toolbar: (
        <FilterToolbar>
          <FilterToolbarField label="Start Date" width="sm">
            <DatePicker
              date={startDate}
              setDate={(d) => setStartDate(d)}
              size="compact"
              className="w-auto min-w-[8rem]"
            />
          </FilterToolbarField>
          <FilterToolbarField label="End Date" width="sm">
            <DatePicker
              date={endDate}
              setDate={(d) => setEndDate(d)}
              size="compact"
              className="w-auto min-w-[8rem]"
            />
          </FilterToolbarField>
          <Button
            size="sm"
            className="w-auto min-w-[8rem]"
            isLoading={getChartData.isFetching}
            onClick={() => {
              if (startDate && endDate) {
                getChartData.refetch();
              } else {
                toast.add({
                  description: "Please select a start and end date",
                });
              }
            }}
          >
            Submit
          </Button>
        </FilterToolbar>
      ),
    }),
    [startDate, endDate, getChartData.isFetching, toast],
  );

  usePageHeader(headerConfig);

  useEffect(() => {
    if (getChartData.isSuccess) {
      setChartsData([
        apiDataToAreaChartData(
          getChartData.data.data.student_trend,
          dateCountToRange(startDate!, endDate!),
          startDate!,
          endDate!,
        ),
        apiDataToAreaChartData(
          getChartData.data.data.staff_trend,
          dateCountToRange(startDate!, endDate!),
          startDate!,
          endDate!,
        ),
        apiDataToAreaChartData(
          getChartData.data.data.course_trend,
          dateCountToRange(startDate!, endDate!),
          startDate!,
          endDate!,
        ),
        apiDataToPieChartData(getChartData.data.data.course_categories),
        apiDataToPieChartData(getChartData.data.data.student_genders),
      ]);
    }
  }, [getChartData.data, getChartData.isSuccess, startDate, endDate]);

  return (
    <PageContainer width="wide">
      <div className={dashboardSectionStackClassName()}>
        <p className="max-w-96 text-sm text-text-muted">
          See the insights of the school. Filter by week, month, year or all
          time.
        </p>
        <PageSection dominant>
          {getChartData.isFetching ? (
            <div className="space-y-3 max-sm:p-2" aria-busy="true">
              {[1, 2, 3].map((item) => (
                <div key={item} className="space-y-3 border-b border-border pb-4">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-80 max-w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ))}
              <div className={dashboardMetricGridClassName(2)}>
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            </div>
          ) : (
            chartsData.length > 0 && (
              <div className="space-y-3 max-sm:p-2">
                <GenericLineChart
                  chartConfig={chartConfig}
                  chartData={chartsData[0]}
                  title="Created Student Accounts"
                  description={`Number of student accounts created over time from ${formatDate(
                    startDate || "",
                  )} to ${formatDate(endDate || "")}`}
                />
                <GenericLineChart
                  title="Created Staff Accounts"
                  description={`Number of staff accounts created over time from ${formatDate(
                    startDate || "",
                  )} to ${formatDate(endDate || "")}`}
                  chartConfig={chartConfig}
                  chartData={chartsData[1]}
                />
                <GenericLineChart
                  title="Created Courses"
                  description={`Number of courses created over time from ${formatDate(
                    startDate || "",
                  )} to ${formatDate(endDate || "")}`}
                  chartConfig={chartConfig}
                  chartData={chartsData[2]}
                />
                <div className={dashboardMetricGridClassName(2)}>
                  <GenericPieChart
                    title="Courses By Category"
                    description={`Number of courses by category from ${formatDate(
                      startDate || "",
                    )} to ${formatDate(endDate || "")}`}
                    chartConfig={getPieChartConfig(chartsData[3])}
                    chartData={chartsData[3]}
                  />
                  <GenericPieChart
                    title="Students By Gender"
                    description={`Number of students by gender from ${formatDate(
                      startDate || "",
                    )} to ${formatDate(endDate || "")}`}
                    chartConfig={getPieChartConfig(chartsData[4])}
                    chartData={chartsData[4]}
                  />
                </div>
              </div>
            )
          )}
        </PageSection>
      </div>
    </PageContainer>
  );
};

export default ManagementDashboardPage;

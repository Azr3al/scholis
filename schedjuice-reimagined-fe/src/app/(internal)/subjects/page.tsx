"use client";

import { PageContainer } from "@/components/layout/page-container";
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import { Button, Switch } from "@/components/primitives";
import { SubjectCatalogTable } from "@/components/academic/subject-catalog-table";
import { searchEntities } from "@/app/client-api/utils";
import { useSubjectUsage } from "@/hooks/academic/use-subject-usage";
import { usePageHeader } from "@/components/shell/use-page-header";
import { subjectType } from "@/types/subject";
import { SubjectUsageRow } from "@/types/subject-usage";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useMemo } from "react";

const SubjectListPage: React.FC = () => {
  const [includeAllCourses, setIncludeAllCourses] = useQueryState(
    "allCourses",
    parseAsBoolean.withDefault(false),
  );
  const usage = useSubjectUsage({ includeAllCourses });

  const { data: subjectsData, isLoading: subjectsLoading } = useQuery({
    queryKey: ["subject-catalog"],
    queryFn: () =>
      searchEntities("subjects", {
        fields: ["id", "name", "description", "exam_board"],
        sorts: ["name"],
        size: -1,
      }),
  });

  const usageById = useMemo(() => {
    const map = new Map<number, SubjectUsageRow>();
    for (const row of usage.data?.subjects ?? []) {
      map.set(row.id, row);
    }
    return map;
  }, [usage.data?.subjects]);

  const subjects = (subjectsData?.data?.data ?? []) as subjectType[];

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Subject catalog</h1>
      ),
      actions: (
        <Link href="/subjects/create">
          <Button size="sm">Create subject</Button>
        </Link>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="wide" className="space-y-6">
      <AcademicListSurface>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Usage overview
            </h2>
            <p className="text-sm text-text-secondary">
              Default counts show active courses. Toggle all courses to include
              planned and ended history.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <Switch
              checked={includeAllCourses}
              onCheckedChange={(checked) => {
                void setIncludeAllCourses(checked === true);
              }}
              aria-label="Show all courses"
            />
            Show all courses
          </label>
        </div>

        {usage.isError ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-elevated p-4 text-sm text-text-muted">
            Usage unavailable. You can still create and manage subjects.
          </div>
        ) : null}

        <SubjectCatalogTable
          subjects={subjects}
          usageById={usageById}
          includeAllCourses={includeAllCourses}
          isLoading={subjectsLoading || usage.isLoading}
          isUsageError={usage.isError}
        />
      </AcademicListSurface>
    </PageContainer>
  );
};

export default SubjectListPage;

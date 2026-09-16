"use client";

import { createCampusCheckinColumns } from "@/app/(internal)/services/campus-checkins/campus-checkin-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { DatePicker } from "@/components/date/date-picker";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useBuildingCheckinsList } from "@/sdk/hooks/building-checkins";
import { operatorEnum } from "@/types/api";
import { format } from "date-fns";
import { useMemo, useState } from "react";

const CampusCheckinsPage = () => {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  const tableState = useResourceTableState({
    namespace: "building-checkins",
    syncUrl: false,
    initial: { sorts: ["-date", "user__name"], pageSize: 100 },
  });

  const filterParams = useMemo(() => {
    if (!date) return undefined;
    return [
      {
        field_name: "date",
        value: format(date, "yyyy-MM-dd"),
        operator: operatorEnum.exact,
      },
    ];
  }, [date]);

  const list = useBuildingCheckinsList({
    page: 1,
    pageSize: -1,
    sorts: tableState.sorts.length
      ? tableState.sorts
      : ["-date", "user__name"],
    q: tableState.q,
    fields: [
      "id",
      "date",
      "actual_checkin_time",
      "actual_checkout_time",
      "checkin_verification_method",
      "checkout_verification_method",
      "checkin_image",
      "checkout_image",
      "campus.id",
      "campus.name",
      "user.id",
      "user.name",
      "user.access_log_name",
    ],
    expand: ["user", "campus"],
    filterParams,
  });

  const columns = useMemo(
    () =>
      createCampusCheckinColumns({
        onViewImage: (url) => setViewImageUrl(url),
      }),
    [],
  );

  usePageHeader({
    breadcrumb: (
      <h1 className="truncate font-serif text-lg text-text-primary">
        Campus Check-in&apos;s
      </h1>
    ),
    toolbar: (
      <DatePicker
        date={date}
        setDate={setDate}
        size="compact"
        className="w-auto min-w-[8rem]"
      />
    ),
  });

  return (
    <PageContainer width="full" className="flex flex-col gap-6">
      <PageSection dominant>
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={columns}
          getRowId={(row) => String(row.id)}
        />
      </PageSection>
      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Selfie"
        onClose={() => setViewImageUrl(null)}
      />
    </PageContainer>
  );
};

export default CampusCheckinsPage;

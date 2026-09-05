"use client";

import { PageContainer } from "@/components/layout/page-container";
import { searchEntities } from "@/app/client-api/utils";
import BackButton from "@/components/misc/back-button";
import { Skeleton } from "@/components/primitives";
import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

import { useEffect } from "react";

const DailyNotesPage = () => {
  const { id } = useParams<{id: string}>();
  const router = useRouter();
  const getEvents = useQuery({
    queryKey: ["getEventsWithNoteOfCourse", id],
    queryFn: () => {
      return searchEntities(
        "events",
        { size: -1, expand: ["daily_note"], sorts: ["date"] },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: id,
            },
          ],
        }
      );
    },
  });
  useEffect(() => {
    if (getEvents.isSuccess && getEvents.data) {
      if (getEvents.data.data.data.length > 0) {
        router.push(
          `/courses/${id}/daily-notes/${getEvents.data.data.data[0].id}`
        );
      }
    }
  }, [getEvents.data, getEvents.isSuccess]);
  return  (
<PageContainer width="default">
<div className="space-y-3">
        <BackButton href={`/courses/${id}`}></BackButton>
        {getEvents.isLoading ? (
          <Skeleton className="w-full h-40"></Skeleton>
        ) : (
          getEvents.isSuccess &&
          getEvents.data.data.data.length === 0 && (
            <div>
              <p>There is no events in this course</p>
            </div>
          )
        )}
      </div>
</PageContainer>
);
};

export default DailyNotesPage;

"use client";

import { searchEntities } from "@/app/client-api/utils";

import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "../calendar";
import { rawToFormattedEvents } from "@/helpers/calendar";
import { CalendarView } from "../types";
import { useTenant } from "@/hooks/useTenant";

interface CourseCalendarProps {
  courseId: string;
}

const CourseCalendar: React.FC<CourseCalendarProps> = ({ courseId }) => {
  const { tenant } = useTenant();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["getCourseEvents", courseId],
    queryFn: () => {
      return searchEntities(
        "events",
        {size: -1,},
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: courseId,
            },
          ],
        }
      );
    },
  });
  return (
    <Calendar
      isLoading={isLoading}
      loadError={isError}
      onRetry={() => void refetch()}
      events={rawToFormattedEvents(data?.data.data || [], tenant?.timezone)}
      showableViews={[CalendarView.WEEK, CalendarView.MONTH]}
    />
  );
};

export default CourseCalendar;

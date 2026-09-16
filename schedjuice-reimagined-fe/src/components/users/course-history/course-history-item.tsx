import { Button } from "@/components/primitives";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";

import { formatDate } from "@/helpers/date";
import { courseHistorySchema } from "@/types/course";
import { Trash } from "iconoir-react";
import * as z from "zod";
import { useMutation } from "@tanstack/react-query";
import { deleteEntity } from "@/app/client-api/utils";
import { queryClient } from "@/lib/query";

interface CourseHistoryItemProps {
  courseHistory: z.infer<typeof courseHistorySchema>;
}

const CourseHistoryItem: React.FC<CourseHistoryItemProps> = ({
  courseHistory,
}) => {
  const deleteCourseHistoryMutation = useMutation({
    mutationKey: ["deleteCourseHistory"],
    mutationFn: (id: number) => {
      return deleteEntity(`course-histories`, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["getUserCourseHistories"] });
    },
  });
  return (
    <div className="rounded-lg border border-border bg-surface text-text-primary">
      <div className="flex flex-col gap-1.5 p-6">
        <div className="flex justify-between items-start">
          <h3 className="font-serif text-xl leading-none tracking-tight">{courseHistory.course.title}</h3>
          <ConfirmationDialog
            title="Delete course history"
            content={`Are you sure you want to delete the course history "${courseHistory.course.title}"?`}
            onConfirm={() =>
              deleteCourseHistoryMutation.mutate(courseHistory.id)
            }
            isLoading={deleteCourseHistoryMutation.isPending}
          >
            <Button
              type="button"
              disabled={courseHistory.created_by === null}
              variant="ghost"
              className="text-destructive hover:text-destructive size-8 p-0"
              size="sm"
            >
              <Trash />
            </Button>
          </ConfirmationDialog>
        </div>
        <p className="text-sm text-text-secondary">
          {courseHistory.created_by ? (
            <p>Created by: {courseHistory.created_by.name}</p>
          ) : (
            <p className="italic">Automatically created by the system.</p>
          )}
        </p>
      </div>
      <div className="p-6 pt-0">
        <p>
          <span className="font-bold">Completion type: </span>
          {courseHistory.completion_type ? (
            courseHistory.completion_type
          ) : (
            <span className=" text-sm text-text-muted italic">
              No data
            </span>
          )}
        </p>
        <p>
          Duration: {formatDate(courseHistory.course.start_date)} -{" "}
          {formatDate(courseHistory.course.end_date)}
        </p>
      </div>
    </div>
  );
};

export default CourseHistoryItem;

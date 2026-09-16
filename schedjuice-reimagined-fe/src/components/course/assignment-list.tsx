import { makeGetRequest } from "@/app/client-api/utils";
import type { AxiosResponse } from "axios";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { operatorEnum } from "@/types/api";
import { Loader } from "../form/loader";
import UploadQueueDock from "../attachment-uploader/upload-queue-dock";
import { useUploadQueueStore } from "../attachment-uploader/upload-queue-store";
import AssignmentCard2 from "./assignment-card";
import { QuizAssessmentCard } from "./quiz-assessment-card";
import { searchEntities } from "@/app/client-api/utils";
import type { assignmentType } from "@/types/assignment";
import type { LearnerQuizSummary, QuizTypeV3 } from "@/types/quiz-v3";

interface IAssignmentListProps {
  courseId: number;
  canEditAssignment: boolean;
  listIsCard: boolean;
}

type AssessmentRow =
  | ({ kind: "assignment" } & assignmentType)
  | ({ kind: "quiz" } & QuizTypeV3 & {
        learner_quiz?: LearnerQuizSummary | null;
      });

const AssignmentList: React.FC<IAssignmentListProps> = ({
  courseId,
  canEditAssignment,
  listIsCard: _listIsCard,
}) => {
  const ref = useRef(null);
  const { items } = useUploadQueueStore();
  const { data: studentsData } = useQuery({
    queryKey: ["course-students", courseId],
    queryFn: () =>
      searchEntities(
        "user-courses",
        { size: -1 },
        {
          filter_params: [
            {
              operator: operatorEnum.exact,
              field_name: "course",
              value: String(courseId),
            },
            {
              operator: operatorEnum.exact,
              field_name: "assigned_as",
              value: "student",
            },
          ],
        },
      ),
  });

  const totalStudents = studentsData?.data?.data?.length || 0;

  const {
    data,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage,
    refetch,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["courseAssessments", courseId],
    queryFn: ({ pageParam }) =>
      makeGetRequest(`courses/${courseId}/assessments`, {
        page: pageParam ?? 1,
        size: 6,
      }),
    refetchOnWindowFocus: false,
    getNextPageParam: (lastPage: AxiosResponse<{ links?: { next?: string | null } }>, pages) => {
      return lastPage.data?.links?.next ? pages.length + 1 : undefined;
    },
  });

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) fetchNextPage();
      });
    });
    if (ref.current) {
      observer.observe(ref.current);
    }
    return () => observer.disconnect();
  }, [ref, fetchNextPage]);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {data?.pages.map((page, i) =>
          ((page as AxiosResponse<{ data?: AssessmentRow[] }>).data?.data ?? []).map((p: AssessmentRow) => (
            <div key={`${p.kind}-${p.id}`} className="col-span-1">
              {p.kind === "quiz" ? (
                <QuizAssessmentCard
                  quiz={p}
                  canManageCourse={canEditAssignment}
                />
              ) : (
                <AssignmentCard2
                  refetch={() =>
                    refetch({ refetchPage: (lastPage, index) => index === i })
                  }
                  canEditAssignment={canEditAssignment}
                  assignment={
                    p as unknown as assignmentType
                  }
                  totalStudents={totalStudents}
                />
              )}
            </div>
          ))
        )}
      </div>
      {isLoading && (
        <p className="flex items-center gap-2 justify-center">
          <Loader></Loader>
          <span>Loading assessments…</span>
        </p>
      )}
      {!hasNextPage && !isLoading && !isFetchingNextPage && (
        <p className="text-center text-sm text-muted-foreground">
          No more assessments.
        </p>
      )}
      <span ref={ref} />
      {items.length > 0 && <UploadQueueDock />}
    </>
  );
};

export default AssignmentList;

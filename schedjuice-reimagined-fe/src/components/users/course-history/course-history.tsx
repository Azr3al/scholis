"use client";
import { Button, Skeleton } from "@/components/primitives";

import CourseHistoryItem from "./course-history-item";
import CourseHistoryForm from "./course-history-form";
import { ControlledPagination } from "@/components/users/controlled-pagination";
import { useUser } from "@/hooks/useUser";
import { fetchEntities, searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { accountType } from "@/types/user";
import { DEFAULT_PAGE_SIZE } from "@/config/defaults";
import { hasAdminCredentials } from "@/helpers/authorization";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

interface CourseHistoryProps {
  user: accountType;
  embedded?: boolean;
}

const PAGE_SIZE = 20;

const CourseHistory: React.FC<CourseHistoryProps> = ({ user, embedded = false }) => {
  const { user: loggedInUser } = useUser();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["getUserCourseHistories", user.id, page],
    queryFn: () =>
      searchEntities(
        "course-histories",
        {
          page,
          size: PAGE_SIZE,
          sorts: ["-created_at"],
          expand: ["course", "created_by"],
        },
        {
          filter_params: [
            {
              field_name: "user_id",
              value: String(user.id),
              operator: operatorEnum.exact,
            },
          ],
        }
      ),
    keepPreviousData: true,
    refetchOnWindowFocus: false,
  });

  const totalCount = data?.data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {embedded ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-text-muted">
            {totalCount} prior {totalCount === 1 ? "enrollment" : "enrollments"}
          </p>
          {loggedInUser && hasAdminCredentials(loggedInUser) && (
            <Button onClick={() => setShowForm(true)} size="sm">
              Add new
            </Button>
          )}
        </div>
      ) : (
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Course History</h1>
            <p>
              Total courses attended:{" "}
              <span className="font-bold">{totalCount}</span>
            </p>
          </div>

          {loggedInUser && hasAdminCredentials(loggedInUser) && (
            <Button onClick={() => setShowForm(true)}>Add new</Button>
          )}
        </div>
      )}

      {showForm && (
        <CourseHistoryForm
          setShowForm={setShowForm}
          user={user}
          courseHistory={data?.data.data}
        />
      )}

      {(isLoading || isFetching) && (
        <Skeleton className="w-full h-40 rounded-lg" />
      )}

      <div className="space-y-3">
        {data?.data?.data?.map((item: any) => (
          <CourseHistoryItem key={item.id} courseHistory={item} />
        ))}

        {!isLoading && data?.data?.data?.length === 0 && (
          <EmptyState>
            <EmptyCopy {...EMPTY_COPY_PRESETS.noHistory} />
          </EmptyState>
        )}
      </div>

      <ControlledPagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="pt-6"
      />
    </div>
  );
};

export default CourseHistory;

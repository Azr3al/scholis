"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { useJuiceBoxAttachments } from "@/lib/juicebox/use-juicebox-attachments";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { buttonVariants, Skeleton } from "@/components/primitives";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import AssignmentForm from "@/components/course/assignment-form";
import { canEditCourse } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { useEffect, useMemo } from "react";

const AssignmentEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();

  const { data, isLoading } = useQuery({
    queryKey: ["assignment", id],
    queryFn: () => fetchEntity("assignments", id),
  });

  const courseId = data?.data?.data?.course;
  const { data: courseMembers } = useQuery({
    queryKey: ["user-courses", courseId],
    queryFn: () =>
      searchEntities(
        "user-courses",
        { size: -1, expand: ["user"] },
        {
          filter_params: [
            {
              field_name: "course",
              value: String(courseId),
              operator: operatorEnum.exact,
            },
          ],
        },
      ),
    enabled: !!courseId,
  });

  const { data: assignmentFiles = [] } = useJuiceBoxAttachments({
    resource: "assignment",
    foreignKey: id,
    enabled: Boolean(data?.data?.data),
  });

  const assignment = data?.data?.data;
  const courseMemberIds = useMemo(
    () =>
      (courseMembers?.data?.data ?? []).map(
        (uc: { user: number | { id: number } }) =>
          typeof uc.user === "object" ? uc.user.id : uc.user,
      ),
    [courseMembers?.data?.data],
  );
  const canEdit = user && courseId && canEditCourse(user, courseMemberIds);

  useEffect(() => {
    if (!canEdit && user && courseId) {
      router.replace(`/assignments/${id}`);
    }
  }, [canEdit, router, id, user, courseId]);

  if (isLoading || !assignment) {
    return (
      <div className="h-full w-full p-4">
        <Skeleton className="mb-4 h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <PageContainer width="narrow" className="h-full w-full p-4">
      <Link
        href={`/assignments/${id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
        aria-label="Back to assignment"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
      </Link>
      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
        <h1 className="mb-4 text-xl font-medium text-text-primary">
          Edit Assignment
        </h1>
        <AssignmentForm
          isEdit
          assignment={assignment}
          files={assignmentFiles}
          courseId={courseId}
          refetch={() => {}}
          cancelHref={`/assignments/${id}`}
          onCancel={() => router.push(`/assignments/${id}`)}
        />
      </div>
    </PageContainer>
  );
};

export default AssignmentEditPage;

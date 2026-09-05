"use client";

import { fetchEntity } from "@/app/client-api/utils";
import BackButton from "@/components/misc/back-button";
import { PageContainer } from "@/components/layout/page-container";
import { RecordSectionRail } from "@/components/record/record-section-rail";
import type { RecordSectionId } from "@/components/record/record-sections";
import { useContextRail } from "@/components/shell/use-context-rail";
import { Skeleton } from "@/components/primitives";
import { TeachingSubjectsSection } from "@/components/users/teaching-subjects/teaching-subjects-section";
import { canEditUser } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { isStaffSubject } from "@/lib/points/visibility";
import { staggerItem, staggerList } from "@/lib/sj/motion";
import type { accountType } from "@/types/user";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

const USER_RECORD_CONTEXT_PARENT = { label: "Users", href: "/users" } as const;
function pageTitle(subject: accountType, viewer: accountType | undefined): string {
  if (viewer?.id === subject.id) {
    return "Subjects you can teach";
  }
  return "Subjects they can teach";
}

export default function TeachingSubjectsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { tenant } = useTenant();
  const { user: viewer, isLoading: viewerLoading } = useUser(false);

  const subjectQuery = useQuery({
    queryKey: ["getUser", id],
    queryFn: () => fetchEntity("users", id),
    enabled: Boolean(id),
  });

  const subject: accountType | undefined = subjectQuery.data?.data?.data;
  const subjectId = Number(id);
  const canEdit = viewer != null && subject != null && canEditUser(viewer, subject.id);
  const isStaffProfileSubject = subject != null && isStaffSubject(subject);

  const navigateToSection = useCallback(
    (section: RecordSectionId) => {
      router.push(`/users/${id}?section=${section}`);
    },
    [id, router],
  );

  useContextRail(
    RecordSectionRail,
    () =>
      subject && viewer && isStaffProfileSubject
        ? {
            subject,
            viewer,
            tenant,
            section: "academic" as const,
            onSelect: navigateToSection,
          }
        : null,
    USER_RECORD_CONTEXT_PARENT,
  );

  useEffect(() => {
    if (subjectQuery.isLoading || subjectQuery.isFetching) return;
    if (subjectQuery.isError || subject == null) return;
    if (!isStaffProfileSubject) {
      router.replace(`/users/${id}?section=academic`);
      return;
    }
    if (viewer != null && viewer.id !== subject.id && !canEdit) {
      router.replace(`/users/${id}?section=overview`);
    }
  }, [
    subjectQuery.isLoading,
    subjectQuery.isFetching,
    subjectQuery.isError,
    subject,
    isStaffProfileSubject,
    id,
    router,
    viewer,
    canEdit,
  ]);

  const pageBusy = viewerLoading || subjectQuery.isLoading || subjectQuery.isFetching;

  return (
    <PageContainer width="narrow" className="space-y-6">
      <BackButton href={`/users/${id}?section=academic`} />

      {pageBusy ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-[72px] w-full rounded-lg" />
          <Skeleton className="h-[72px] w-full rounded-lg" />
        </div>
      ) : subject && viewer && isStaffProfileSubject ? (
        <motion.div
          variants={staggerList}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          <motion.header variants={staggerItem} className="space-y-2">
            <h1 className="font-serif text-3xl text-balance text-text-primary">
              {pageTitle(subject, viewer)}
            </h1>
            <p className="text-sm text-text-muted">
              {viewer.id === subject.id
                ? "Add subjects you can teach. Search by name to find the right match."
                : "Subjects, levels, and categories this teacher can teach."}
            </p>
          </motion.header>

          <motion.div variants={staggerItem}>
            <TeachingSubjectsSection userId={subjectId} canEdit={canEdit} />
          </motion.div>
        </motion.div>
      ) : null}
    </PageContainer>
  );
}

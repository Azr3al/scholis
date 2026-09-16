"use client";

import { PageContainer } from "@/components/layout/page-container";
import { CourseRoleEditForm } from "@/components/course/course-role-edit-form";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const AssignedAsRoleEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useTenant();
  const substituteEnabled = Boolean(tenant?.is_substitute_teachers_enabled);

  return (
    <PageContainer width="narrow" className="space-y-3">
      <Link
        href={`/course-roles/${id}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "size-9 p-0",
        )}
        aria-label="Back to course role"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
      </Link>
      <CourseRoleEditForm roleId={id} substituteEnabled={substituteEnabled} />
    </PageContainer>
  );
};

export default AssignedAsRoleEditPage;

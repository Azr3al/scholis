"use client";

import { PageContainer } from "@/components/layout/page-container";
import GenericForm from "@/components/form/generic-form";
import type { AutoFormGroup } from "@/components/auto-form";
import DeleteZone from "@/components/form/delete-zone";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { subjectCreateUpdateSchema } from "@/types/subject";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const subjectEditGroups: AutoFormGroup[] = [
  {
    id: "details",
    title: "Subject",
    fields: ["name", "exam_board", "description"],
  },
];

const SubjectEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <PageContainer width="narrow" className="space-y-3">
      <Link
        href={`/subjects/${id}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm"  }),
          "size-9 p-0",
        )}
        aria-label="Back to subject"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
      </Link>
      <GenericForm
        entityId={id}
        schema={subjectCreateUpdateSchema}
        entityName="subject"
        apiUrl="subjects"
        redirectUrl={`/subjects/${id}`}
        isEdit
        autosave
        groups={subjectEditGroups}
      />
      <DeleteZone
        validateInputKey="name"
        entityName="subject"
        entityId={id}
        deleteApiUrl="subjects"
      />
    </PageContainer>
  );
};

export default SubjectEditPage;

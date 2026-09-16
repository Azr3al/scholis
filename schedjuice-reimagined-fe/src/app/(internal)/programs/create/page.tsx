"use client";

import { PageContainer } from "@/components/layout/page-container";
import BackButton from "@/components/misc/back-button";
import GenericForm from "@/components/form/generic-form";
import { TypographyH1 } from "@/components/typography/h1";
import { programCreateUpdateSchema } from "@/types/program";
import type { AutoFormGroup } from "@/components/auto-form";

const PROGRAM_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "identity",
    title: "Identity",
    description: "Name and short description for this program.",
    fields: ["name", "description"],
  },
  {
    id: "academic",
    title: "Academic settings",
    description: "How classes and subjects are created in this program.",
    fields: ["course_creation_method", "subject_strategy", "intake_count"],
  },
];

const ProgramCreatePage: React.FC = () => {
  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/programs" />
      <TypographyH1>Create program</TypographyH1>
      <GenericForm
        schema={programCreateUpdateSchema}
        entityName="program"
        apiUrl="programs"
        redirectUrl="/programs"
        groups={PROGRAM_CREATE_GROUPS}
      />
    </PageContainer>
  );
};

export default ProgramCreatePage;

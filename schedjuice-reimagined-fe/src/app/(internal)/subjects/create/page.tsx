"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import GenericForm from "@/components/form/generic-form";
import BackButton from "@/components/misc/back-button";
import { subjectCreateUpdateSchema } from "@/types/subject";

const SUBJECT_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "identity",
    title: "Identity",
    description: "How this subject appears in catalogs and class setup.",
    fields: ["name", "exam_board"],
  },
  {
    id: "about",
    title: "About",
    description: "Optional context for staff choosing this subject.",
    fields: ["description"],
  },
];

const SubjectCreatePage: React.FC = () => {
  return (
    <PageContainer width="narrow">
      <div data-slot="page-section-quiet">
        <BackButton href="/subjects" />
      </div>
      <PageHeader
        title="Create subject"
        description="This subject becomes available org-wide and can be added to any program's catalog."
      />
      <PageSection dominant>
        <GenericForm
          schema={subjectCreateUpdateSchema}
          entityName="subject"
          apiUrl="subjects"
          redirectUrl="/subjects"
          groups={SUBJECT_CREATE_GROUPS}
          measure="narrow"
        />
      </PageSection>
    </PageContainer>
  );
};

export default SubjectCreatePage;

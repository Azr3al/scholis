"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import { TypographyH1 } from "@/components/typography/h1";
import GenericForm from "@/components/form/generic-form";
import { departmentCreateSchema } from "@/types/department";

const DEPARTMENT_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "identity",
    title: "Identity",
    description: "Department name as it appears in org structure.",
    fields: ["name"],
  },
  {
    id: "about",
    title: "About",
    description: "What this department covers.",
    fields: ["description"],
  },
];

const DepartmentCreatePage = () => {
  return (
    <PageContainer width="narrow" className="space-y-3">
      <TypographyH1>Create Department</TypographyH1>
      <GenericForm
        schema={departmentCreateSchema}
        entityName="department"
        apiUrl="departments"
        redirectUrl="/departments"
        groups={DEPARTMENT_CREATE_GROUPS}
      />
    </PageContainer>
  );
};

export default DepartmentCreatePage;

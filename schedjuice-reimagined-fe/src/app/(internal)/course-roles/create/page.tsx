"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import GenericForm from "@/components/form/generic-form";
import BackButton from "@/components/misc/back-button";
import { TypographyH1 } from "@/components/typography/h1";
import { useTenant } from "@/hooks/useTenant";
import { assignedAsRoleCreateSchema } from "@/types/course";

const AssignedAsRoleCreatePage = () => {
  const { tenant } = useTenant();
  const substituteEnabled = Boolean(tenant?.is_substitute_teachers_enabled);

  const groups: AutoFormGroup[] = [
    {
      id: "role-meta",
      title: "Role",
      description: "Name and system seniority for this course role.",
      fields: substituteEnabled
        ? ["name", "seniority", "is_substitute"]
        : ["name", "seniority"],
    },
    {
      id: "scheduling",
      title: "Scheduling",
      description: "Whether assignments with this role count toward collisions.",
      fields: ["is_collision_enabled"],
    },
  ];

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/course-roles"></BackButton>
      <TypographyH1>Create Course Role</TypographyH1>

      <GenericForm
        schema={assignedAsRoleCreateSchema}
        entityName="course role"
        apiUrl="assigned-as-roles"
        redirectUrl="/course-roles"
        groups={groups}
        fieldConfig={{
          is_collision_enabled: {
            description:
              "If disabled, the course assignment will be ignored from event collision calculations.",
          },
          is_substitute: {
            description:
              "Substitute roles cover specific session dates instead of weekdays and can be removed automatically. Requires Main Teacher or Assistant Teacher seniority.",
          },
        }}
      />
    </PageContainer>
  );
};

export default AssignedAsRoleCreatePage;

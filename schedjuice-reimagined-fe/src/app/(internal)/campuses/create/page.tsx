"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import GenericForm from "@/components/form/generic-form";
import BackButton from "@/components/misc/back-button";
import { TypographyH1 } from "@/components/typography/h1";
import { CampusCreateEditSchema } from "@/types/campuses";

const CAMPUS_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "identity",
    title: "Identity",
    description: "Name, description, and location for this campus.",
    fields: ["name", "description", "location"],
  },
  {
    id: "flags",
    title: "Campus type",
    description: "Online and default campus flags.",
    fields: ["is_online", "is_default"],
  },
  {
    id: "geofence",
    title: "Geofence",
    description: "Coordinates and radius used for check-in.",
    fields: ["latitude", "longitude", "geofence_radius_meters"],
    collapsible: true,
  },
];

const CampusCreatePage = () => {
  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/campuses"></BackButton>
      <TypographyH1>Create Campus</TypographyH1>
      <GenericForm
        schema={CampusCreateEditSchema}
        entityName="campus"
        apiUrl="campuses"
        redirectUrl="/campuses"
        groups={CAMPUS_CREATE_GROUPS}
      />
    </PageContainer>
  );
};

export default CampusCreatePage;

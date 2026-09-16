"use client";

import { PageContainer } from "@/components/layout/page-container";
import DeleteZone from "@/components/form/delete-zone";
import GenericForm from "@/components/form/generic-form";
import BackButton from "@/components/misc/back-button";
import { TypographyH1 } from "@/components/typography/h1";
import type { AutoFormGroup } from "@/components/auto-form";
import { CampusCreateEditSchema } from "@/types/campuses";
import { useParams } from "next/navigation";

const HIGH_RISK_CAMPUS_FIELDS = ["is_default"] as const;

const campusEditGroups: AutoFormGroup[] = [
  {
    id: "identity",
    title: "Campus",
    description: "Name, location, and campus flags.",
    fields: ["name", "description", "location", "is_online", "is_default"],
  },
  {
    id: "geofence",
    title: "Geofence",
    description: "Optional coordinates and attendance radius.",
    fields: ["latitude", "longitude", "geofence_radius_meters"],
    collapsible: true,
  },
];

const CampusUpdatePage = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href={`/campuses/${id}`}></BackButton>
      <TypographyH1>Edit Campus</TypographyH1>
      <GenericForm
        isEdit={true}
        autosave
        entityId={id}
        entityName="Campus"
        apiUrl="campuses"
        schema={CampusCreateEditSchema}
        groups={campusEditGroups}
        fieldConfig={{
          is_default: { autosave: false },
        }}
        shouldAutosaveField={(name) =>
          !(HIGH_RISK_CAMPUS_FIELDS as readonly string[]).includes(name)
        }
        explicitSaveFields={[...HIGH_RISK_CAMPUS_FIELDS]}
        explicitSaveLabel="Save default campus"
      ></GenericForm>
      <DeleteZone
        validate_input="delete Campus"
        entityName="Campus"
        entityId={id}
        deleteApiUrl="campuses"
        redirectUrl="/campuses"
      ></DeleteZone>
    </PageContainer>
  );
};

export default CampusUpdatePage;

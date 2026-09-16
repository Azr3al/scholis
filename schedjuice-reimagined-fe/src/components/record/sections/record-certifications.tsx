"use client";

import { RecordSection } from "@/components/record/record-section";
import { RecordPublicProfile } from "@/components/record/sections/record-public-profile";
import { UserCertificationsSection } from "@/components/users/user-certifications-section";
import { canEditUser } from "@/helpers/authorization";
import type { FormConfigField } from "@/types/form-config";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

type RecordCertificationsProps = {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  recordQueryKey: unknown[];
  editConfigFields: FormConfigField[];
};

export function RecordCertifications({
  subject,
  viewer,
  tenant,
  recordQueryKey,
  editConfigFields,
}: RecordCertificationsProps) {
  const canEdit = canEditUser(viewer, subject.id);

  return (
    <div className="sj-root flex flex-col gap-8">
      <RecordSection title="Certifications">
        <UserCertificationsSection userId={subject.id} canEdit={canEdit} />
      </RecordSection>

      <RecordPublicProfile
        subject={subject}
        viewer={viewer}
        tenant={tenant}
        recordQueryKey={recordQueryKey}
        configFields={editConfigFields}
      />
    </div>
  );
}

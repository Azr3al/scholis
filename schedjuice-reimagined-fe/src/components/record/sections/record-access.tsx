"use client";

import { RolesEditor } from "@/components/record/roles-editor";
import { CourseOversightScopeEditor } from "@/components/record/course-oversight-scope-editor";
import type { accountType } from "@/types/user";

export function RecordAccess({
  subject,
  viewer,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  recordQueryKey: unknown[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="sj-root">
        <RolesEditor
          subject={subject}
          viewer={viewer}
          recordQueryKey={recordQueryKey}
        />
      </div>

      <CourseOversightScopeEditor
        subject={subject}
        recordQueryKey={recordQueryKey}
      />
    </div>
  );
}

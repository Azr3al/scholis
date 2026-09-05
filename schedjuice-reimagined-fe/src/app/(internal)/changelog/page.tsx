"use client";

import { PageContainer } from "@/components/layout/page-container";
import { ChangelogFeed } from "@/components/changelog/changelog-feed";
import { TypographyH1 } from "@/components/typography/h1";
import { useUser } from "@/hooks/useUser";
import { isStudent } from "@/helpers/authorization";

export default function ChangelogPage() {
  const { user } = useUser();
  const viewerIsStudent = isStudent(user);

  return (
    <PageContainer width="default" className="space-y-8">
      <header className="max-w-2xl space-y-3">
        <TypographyH1>What&apos;s new</TypographyH1>
        <p className="text-base leading-relaxed text-text-muted">
          {viewerIsStudent
            ? "Recent updates that may affect your classes, assignments, and account."
            : "Recent improvements to Schedjuice for your school — written for founders, admins, teachers, and staff."}
        </p>
      </header>
      <ChangelogFeed />
    </PageContainer>
  );
}

import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";

interface AcademicPageHeaderProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}

/** Academic route-family header — delegates to shared PageHeader contract. */
export function AcademicPageHeader({
  title,
  description,
  eyebrow = "Academic",
  actions,
}: AcademicPageHeaderProps) {
  return (
    <PageHeader
      title={title}
      description={description}
      eyebrow={eyebrow}
      actions={actions}
    />
  );
}

"use client";

import type { ReactNode } from "react";

export function OrgSectionPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="font-serif text-2xl text-text-primary">{title}</h2>
        {description ? (
          <p className="text-sm text-text-muted">{description}</p>
        ) : null}
      </header>
      {children}
      {footer}
    </div>
  );
}

export function OrgPropagationNote() {
  return (
    <p className="text-sm text-text-muted">
      Note: changes can take up to 4 hours to show everywhere in your
      organization.
    </p>
  );
}

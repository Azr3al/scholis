"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { NavArrowLeft } from "iconoir-react";
import { WorkspaceLogo, type WorkspaceName } from "@/components/workspaces/workspace-logo";

export type RecordRailParent = {
  label: string;
  href: string;
};

/** Back link plus optional compact identity for every context rail. */
export function RecordRailHeader({
  parent,
  children,
}: {
  parent: RecordRailParent;
  children?: ReactNode;
}) {
  return (
    <>
      <Link
        href={parent.href}
        className="flex items-center gap-1.5 px-3 py-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <NavArrowLeft width={15} height={15} aria-hidden />
        {parent.label}
      </Link>
      {children ? <div className="px-3 pb-3">{children}</div> : null}
    </>
  );
}

/** Compact workspace mark under the Home back link. */
export function RecordRailWorkspaceIdentity({
  name,
  label,
}: {
  name: WorkspaceName;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <WorkspaceLogo
        name={name}
        size={32}
        className="pointer-events-none"
        aria-hidden
      />
      <p className="truncate text-sm font-medium text-text-primary">{label}</p>
    </div>
  );
}

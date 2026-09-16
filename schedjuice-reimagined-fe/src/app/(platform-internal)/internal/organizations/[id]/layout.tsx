"use client";

import { fetchEntity } from "@/app/client-api/utils";
import {
  OrgRecordNavigationProvider,
  useOrgRecordNavigation,
} from "@/components/org/record/org-record-navigation-context";
import { useOrgRecordPageHeader } from "@/components/org/record/use-org-record-page-header";
import { useOrgRecordRail } from "@/components/org/record/use-org-record-rail";
import { useOrgSection } from "@/components/org/record/use-org-section";
import type { OrgSectionId } from "@/config/org-record-sections";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { useQuery } from "@tanstack/react-query";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useMemo, type ReactNode } from "react";

function deriveActiveSection(
  pathname: string,
  orgId: string,
  section: OrgSectionId,
): OrgSectionId | null {
  if (pathname.endsWith("/admins/create")) {
    return null;
  }
  if (
    pathname === `/internal/organizations/${orgId}` ||
    pathname === `/internal/organizations/${orgId}/`
  ) {
    return section;
  }
  return null;
}

function OrganizationIdLayoutInner({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { user } = useUser();
  const { tenant } = useTenant();
  const navigation = useOrgRecordNavigation();

  const orgRecordCtx = useMemo(
    () =>
      user
        ? {
            mode: "platform" as const,
            viewer: user,
            tenant,
          }
        : null,
    [user, tenant],
  );

  const { section } = useOrgSection(orgRecordCtx);
  const highlightedSection = navigation?.activeSection ?? section;

  const orgQuery = useQuery({
    queryKey: ["getOrganization", id],
    queryFn: () => fetchEntity("organizations", id),
    enabled: Boolean(id),
  });

  const org = orgQuery.data?.data.data;
  const activeSection =
    deriveActiveSection(pathname, id, highlightedSection) ?? highlightedSection;
  const headerSection =
    navigation?.activeSection ??
    (pathname.endsWith("/admins/create") ? "admins" : section);

  const onSelect = useCallback(
    (nextSection: OrgSectionId) => {
      navigation?.navigateToSection(nextSection);
    },
    [navigation],
  );

  useOrgRecordRail({
    mode: "platform",
    orgId: id,
    activeSection,
    org: org ?? null,
    ctx: orgRecordCtx,
    isLoading: orgQuery.isLoading,
    onSelect,
  });

  useOrgRecordPageHeader({
    org: org ?? null,
    mode: "platform",
    section: headerSection,
  });

  return children;
}

function OrganizationIdLayoutWithSection({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { tenant } = useTenant();
  const orgRecordCtx = useMemo(
    () =>
      user
        ? {
            mode: "platform" as const,
            viewer: user,
            tenant,
          }
        : null,
    [user, tenant],
  );
  const { section } = useOrgSection(orgRecordCtx);

  return (
    <OrgRecordNavigationProvider initialSection={section}>
      <OrganizationIdLayoutInner>{children}</OrganizationIdLayoutInner>
    </OrgRecordNavigationProvider>
  );
}

export default function OrganizationIdLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <OrganizationIdLayoutWithSection>{children}</OrganizationIdLayoutWithSection>;
}

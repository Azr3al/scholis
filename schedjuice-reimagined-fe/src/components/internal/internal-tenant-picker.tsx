"use client";

import { useGetAllEntitiesQuery } from "@/components/form/entity-combobox";
import { EntityComboboxList } from "@/components/form/entity-combobox-list";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import {
  buildInternalOrgRecordHref,
  parseInternalOrgRecordId,
} from "@/lib/internal-route-access";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

type OrganizationRow = {
  id: number;
  name: string;
  is_admin?: boolean;
};

const ORG_QUERY_PARAMS = { fields: ["id", "name", "is_admin"] };

type InternalTenantPickerProps = {
  variant?: "default" | "header";
};

export function InternalTenantPicker({
  variant = "default",
}: InternalTenantPickerProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgRecordId = parseInternalOrgRecordId(pathname);
  const { tenantId, setTenantId } = useInternalTenant();
  const query = useGetAllEntitiesQuery("organizations", ORG_QUERY_PARAMS);

  const options = useMemo(() => {
    return ((query.data?.data?.data as OrganizationRow[] | undefined) ?? [])
      .filter(
        (c) =>
          c != null &&
          c.id != null &&
          isValidApiEntityIdParam(String(c.id)),
      )
      .map((c) => ({
        value: String(c.id),
        label: c.name,
      }));
  }, [query.data]);

  const value = orgRecordId ?? tenantId ?? "";

  return (
    <EntityComboboxList
      label="Tenant"
      isLoading={query.isLoading}
      value={value}
      onChange={(id) => {
        if (!id) {
          if (orgRecordId) return;
          setTenantId(null);
          return;
        }
        if (orgRecordId) {
          router.push(buildInternalOrgRecordHref(id, searchParams));
          return;
        }
        setTenantId(id);
      }}
      options={options}
      triggerClassName={
        variant === "header"
          ? "w-[min(16rem,40vw)] min-w-40"
          : "w-full min-w-56"
      }
    />
  );
}

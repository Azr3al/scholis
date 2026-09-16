"use client";

import EntityCombobox from "@/components/form/entity-combobox";
import { listToApiArray } from "@/helpers/filter-params";
import { searchOrganizationUsers } from "@/sdk/resources/organization-users";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

const ADMIN_ROLE_FILTER = {
  filter_params: [
    {
      field_name: "roles",
      operator: operatorEnum.contained_by,
      value: listToApiArray([role.superadmin, role.admin, role.manager]),
    },
  ],
};

type StudentDmContactPickerProps = {
  orgId: string | number | undefined;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
};

export function StudentDmContactPicker({
  orgId,
  value,
  onChange,
}: StudentDmContactPickerProps) {
  const contactUserId = value != null ? Number(value) : null;

  const selectedLabelQuery = useQuery({
    queryKey: ["organizationUsers", orgId, "contact", contactUserId],
    queryFn: async () => {
      const { rows } = await searchOrganizationUsers({
        orgId: orgId!,
        page: 1,
        pageSize: 1,
        sorts: ["name"],
        q: "",
        fields: ["id", "name", "email"],
        filterParams: {
          filter_params: [
            {
              field_name: "id",
              operator: operatorEnum.in,
              value: String(contactUserId),
            },
          ],
        },
      });
      const row = rows[0];
      return row ? row.name || row.email || String(row.id) : undefined;
    },
    enabled:
      orgId != null &&
      contactUserId != null &&
      Number.isFinite(contactUserId),
  });

  const fetchOptions = useCallback(
    async (searchValue: string) => {
      if (orgId == null) return [];
      const { rows } = await searchOrganizationUsers({
        orgId,
        page: 1,
        pageSize: 50,
        sorts: ["name"],
        q: searchValue,
        fields: ["id", "name", "email"],
        filterParams: ADMIN_ROLE_FILTER,
      });
      return rows.map((row) => ({
        value: String(row.id),
        label: row.name || row.email || String(row.id),
      }));
    },
    [orgId],
  );

  return (
    <EntityCombobox
      label=""
      value={contactUserId != null ? String(contactUserId) : ""}
      onChange={(v) => onChange(v ? Number(v) : null)}
      comboboxPlaceholder="Search administrators"
      fetchOptions={fetchOptions}
      debounceMilliseconds={300}
      selectedLabel={selectedLabelQuery.data}
    />
  );
}

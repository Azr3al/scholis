"use client";

import EntityCombobox from "@/components/form/entity-combobox";
import { STAFF_ROLE_FILTER } from "@/components/finances/payment-info-form-fields";
import { bindNamedPerson } from "@/lib/image-template/named-person-bind";
import type { Layer } from "@/lib/image-template/types";

export function NamedPersonInspector({
  layer,
  onChange,
}: {
  layer: Extract<Layer, { type: "named_person" }>;
  onChange: (next: Layer) => void;
}) {
  return (
    <EntityCombobox
      label="Staff"
      entity="users"
      displayFunction={(user) =>
        user.email ? `${user.name} (${user.email})` : String(user.name ?? "")
      }
      value={layer.user_id ? String(layer.user_id) : ""}
      onChange={(next) => onChange(bindNamedPerson(layer, Number(next) || 0))}
      allowDeselect
      comboboxPlaceholder="Search staff…"
      queryParams={{
        fields: ["id", "name", "email"],
        sorts: ["name"],
      }}
      filterParams={STAFF_ROLE_FILTER}
    />
  );
}

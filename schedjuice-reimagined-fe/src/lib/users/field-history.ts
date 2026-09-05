export type UserFieldChangeRow = {
  id: number;
  field_key: string;
  old_value: string | null;
  new_value: string | null;
  source: string;
  created_at: string;
  actor_id: number | null;
  actor_name: string | null;
};

export type MergedPeopleHistoryEntry = {
  key: string;
  created_at: string;
  label: string;
  actor_name: string | null;
  old_value: string | null;
  new_value: string | null;
};

export function mergePeopleHistoryEntries(
  fieldChanges: UserFieldChangeRow[],
  idImages: Array<{
    id: number;
    created_at: string;
    uploaded_by: { id: number; name: string } | null;
  }>,
  fieldLabel: (fieldKey: string) => string,
): MergedPeopleHistoryEntry[] {
  const fieldEntries: MergedPeopleHistoryEntry[] = fieldChanges.map((row) => ({
    key: `field-${row.id}`,
    created_at: row.created_at,
    label: fieldLabel(row.field_key),
    actor_name: row.actor_name,
    old_value: row.old_value,
    new_value: row.new_value,
  }));
  const imageEntries: MergedPeopleHistoryEntry[] = idImages.map((row) => ({
    key: `id-image-${row.id}`,
    created_at: row.created_at,
    label: "ID photo",
    actor_name: row.uploaded_by?.name ?? null,
    old_value: null,
    new_value: "(replaced)",
  }));
  return [...fieldEntries, ...imageEntries].sort((a, b) => {
    if (a.created_at === b.created_at) return a.key < b.key ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

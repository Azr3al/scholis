import type { EntityComboboxOption } from "./entity-combobox-list";

export function filterComboboxOptionsByQuery(
  options: EntityComboboxOption[],
  query: string,
): EntityComboboxOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) =>
    (option.searchText ?? option.label).toLowerCase().includes(normalized),
  );
}

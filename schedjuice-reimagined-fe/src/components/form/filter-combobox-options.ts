import type { EntityComboboxOption } from "./entity-combobox-list";

export function filterComboboxOptionsByQuery(
  options: EntityComboboxOption[],
  query: string,
): EntityComboboxOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;

  const pinned: EntityComboboxOption[] = [];
  const rest: EntityComboboxOption[] = [];
  for (const option of options) {
    if (option.value === "") pinned.push(option);
    else rest.push(option);
  }

  const matched = rest.filter((option) =>
    (option.searchText ?? option.label).toLowerCase().includes(normalized),
  );
  return [...pinned, ...matched];
}

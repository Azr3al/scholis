export function formatMatchedUserChipLabel(entityRef?: {
  label: string;
  email?: string;
}): string | undefined {
  if (!entityRef?.label) return undefined;
  return entityRef.email
    ? `${entityRef.label} (${entityRef.email})`
    : entityRef.label;
}

type UserComboboxSearchFields = {
  name?: string | null;
  alternative_name?: string | null;
  email?: string | null;
};

export function formatUserComboboxSearchText(user: UserComboboxSearchFields): string {
  return [user.name, user.alternative_name, user.email]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(" ");
}

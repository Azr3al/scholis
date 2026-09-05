type StaffUserSearchLineInput = {
  alternative_name?: string | null;
  email?: string | null;
};

export function formatStaffUserSecondaryLine(user: StaffUserSearchLineInput): string {
  return [user.alternative_name, user.email].filter(Boolean).join(" · ");
}

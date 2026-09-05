export type UserHubTab = "staff" | "students";

export type UserHubViewMode = "grid" | "list";

export interface UserHubFilterSet {
  tab: UserHubTab;
  q: string;
  page: number;
  includeInactive: boolean;
  incomplete: boolean;
  view: UserHubViewMode;
}

export type HubUserRow = {
  id: number;
  name: string;
  alternative_name?: string | null;
  email: string;
  phone_number?: string;
  roles: string[];
  is_active: boolean;
  profile_image?: string | null;
  profile_completeness?: number;
  created_at?: string;
};

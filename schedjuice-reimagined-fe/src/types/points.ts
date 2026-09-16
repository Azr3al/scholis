export type PointType = {
  id: number;
  name: string;
  color: string;
  description: string;
  is_active: boolean;
  sort_order: number;
};

export type PointTransaction = {
  id: number;
  subject: number;
  point_type: PointType;
  delta: number;
  note: string;
  actor: number | null;
  actor_name: string | null;
  created_at: string;
};

export type StaffPointsSheetRow = {
  id: number;
  name: string;
  email: string;
  roles: string[];
  balances: Record<string, number>;
};

export type StaffPointsSheetResponse = {
  point_types: PointType[];
  rows: StaffPointsSheetRow[];
};

export type UserPointsResponse = {
  balances: Record<string, number>;
  point_types: PointType[];
  transactions: PointTransaction[];
};

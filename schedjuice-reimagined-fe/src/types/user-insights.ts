export type DuplicateMatchReason = {
  field: "phone" | "communication_email" | "emergency_phone";
  label: string;
  normalized_value: string;
  user_ids: number[];
  possible_sibling: boolean;
};

export type DuplicateClusterUser = {
  id: number;
  name: string;
  email: string;
  communication_email: string;
  phone_number: string;
  emergency_contact_phone_number: string;
  microsoft_id: string | null;
  is_active: boolean;
};

export type DuplicateCluster = {
  cluster_id: string;
  possible_siblings: boolean;
  user_ids: number[];
  users: DuplicateClusterUser[];
  match_reasons: DuplicateMatchReason[];
};

export type DuplicateSearchSummary = {
  cluster_count: number;
  sibling_flagged_count: number;
  student_count: number;
};

export type DuplicateSearchResponse = {
  data: {
    summary: DuplicateSearchSummary;
    results: DuplicateCluster[];
  };
  page: number;
  size: number;
  count: number;
};

export type MsSignInEntry = {
  last_sign_in: string | null;
  error?: string;
};

export type MsSignInActivityResponse = {
  data: Record<string, MsSignInEntry>;
};

export type MergePreviewResponse = {
  data: {
    survivor_user_id: number;
    absorbed_user_ids: number[];
    reassignments: Record<string, number>;
    enrollment_conflicts: Array<{
      course_id: number;
      course_title: string;
      resolution: string;
    }>;
    scalar_backfills: string[];
    warnings: string[];
  };
};

export type MergeApplyResponse = {
  data: {
    survivor_user_id: number;
    absorbed_user_ids: number[];
    scalar_backfills: string[];
    enrollment_conflicts: Array<{
      course_id: number;
      course_title: string;
      resolution: string;
    }>;
  };
};

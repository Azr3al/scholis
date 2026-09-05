export type ValidationState = {
  valid: boolean;
  validation_error?: string | null;
};

export type DemoArtifactSource = {
  format: string;
  content: string;
};

export type DemoArtifactHub = {
  counts: {
    blueprints: number;
    briefs: number;
    briefs_with_generated_script: number;
    scenario_packs: number;
    use_cases: number;
    imports: number;
  };
  briefs: Array<{
    slug: string;
    school_name: string;
    has_generated_script: boolean;
  }>;
};

export type DemoStop = {
  order: number;
  route?: string;
  role?: string;
  talk_track?: string;
  look_for?: string[];
  use_case?: string;
};

export type ArtifactListItem = ValidationState & {
  id: string;
  label?: string;
  school_name?: string;
  niche?: string;
  demo_date?: string;
  has_generated_script?: boolean;
  use_case_count?: number;
  default_pack_count?: number;
  demo_stop_count?: number;
  description?: string;
  filename?: string;
  linked_briefs?: string[];
};

export type ArtifactDetail = ValidationState & {
  artifact_type: string;
  id: string;
  relative_path: string;
  summary: Record<string, unknown>;
  source?: DemoArtifactSource;
  resolved?: {
    domain_url: string;
    schema_name: string;
    scenario_pack_ids: string[];
    demo_stops: DemoStop[];
    terminology: Record<string, string>;
    org_toggles: Record<string, unknown>;
  };
  generated_script?: {
    available: boolean;
    partial?: boolean;
    json?: { stops: DemoStop[] };
    markdown?: string;
  };
  csv_preview?: {
    headers: string[];
    rows: string[][];
    truncated: boolean;
    total_rows: number;
  };
  mapping_source?: DemoArtifactSource;
};

export type BriefDetail = ArtifactDetail & {
  artifact_type: "brief";
  summary: {
    school_name: string;
    slug: string;
    niche: string;
    demo_date: string;
    timezone?: string;
    pain_points: string[];
    import?: { file: string; mode: string };
  };
};

export type DemoProvisionActiveJob = {
  id: number;
  brief_slug: string;
  blueprint_id: string;
  reset: boolean;
  status: "pending" | "running" | "succeeded" | "failed";
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
};

export type DemoCredentials = {
  password: string;
  accounts: Array<{ email: string; role: string; name?: string }>;
  dev_tenant_domain_hint: string;
};

export type DemoProvisionStatus = {
  provision_ui_enabled: boolean;
  tenant_exists: boolean;
  is_demo: boolean;
  domain_url: string;
  schema_name: string;
  has_generated_script: boolean;
  credentials: DemoCredentials | null;
  active_job: DemoProvisionActiveJob | null;
};

export type DemoProvisionJobResult = {
  school_name: string;
  domain_url: string;
  schema_name: string;
  dev_tenant_domain_hint: string;
  password: string;
  accounts: Array<{ email: string; role: string }>;
  scripts: { markdown_path: string; json_path: string };
};

export type DemoProvisionJob = DemoProvisionActiveJob & {
  result: DemoProvisionJobResult | null;
};

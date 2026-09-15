"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { axiosClient } from "@/lib/api";
import EntityCombobox from "@/components/form/entity-combobox";
import { useInternalTenantSchema } from "@/hooks/useInternalTenantSchema";
import { getCookie } from "cookies-next";
import { Badge } from "@/app/_chrome/badge";
import { Play, Terminal } from "iconoir-react";
import { useEffect, useState } from "react";

type ParamDef = {
  key: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  default?: string;
  description: string;
};

type CommandDef = {
  name: string;
  description: string;
  method?: "GET" | "POST";
  params: ParamDef[];
  category: string;
  /** When true, show a Microsoft pill (for Microsoft-enabled / Graph–related tenants). */
  teamsEnabledTenant?: boolean;
};

const MICROSOFT_PILL_CLASS =
  "shrink-0 font-normal text-[9px] px-1.5 py-0 h-4 border-0 bg-[#6264A7] text-white hover:bg-[#6264A7]";

function CommandMethodBadge({ method }: { method?: "GET" | "POST" }) {
  const m = method ?? "POST";
  return (
    <Badge
      variant="outline"
      className="font-mono font-normal text-[10px] px-1.5 py-0 h-5 shrink-0"
    >
      {m}
    </Badge>
  );
}

function getCommandGroups(commands: CommandDef[]): { category: string; commands: CommandDef[] }[] {
  const byCategory = new Map<string, CommandDef[]>();
  for (const cmd of commands) {
    const list = byCategory.get(cmd.category) ?? [];
    list.push(cmd);
    byCategory.set(cmd.category, list);
  }
  byCategory.forEach((list) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
  });
  return Array.from(byCategory.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((category) => ({ category, commands: byCategory.get(category)! }));
}

const COMMANDS: CommandDef[] = [
  {
    name: "backfill-user-attendance-hourly-rates",
    category: "Attendance",
    teamsEnabledTenant: true,
    description:
      "Backfill hourly_rate_at_creation on UserAttendance where missing but session has positive duration. Uses same rate resolution as Teams sync. By default only Microsoft-enabled orgs.",
    params: [
      {
        key: "schema_name",
        type: "string",
        default: "all",
        description: "Process only this tenant; omit for all Microsoft-enabled orgs",
      },
      { key: "dry_run", type: "boolean", default: "false", description: "If true, print counts only; do not write to the database" },
      {
        key: "all_organizations",
        type: "boolean",
        default: "false",
        description: "If true, include every tenant, not only Microsoft-enabled orgs",
      },
    ],
  },
  {
    name: "sync-meeting-attendance",
    category: "Attendance",
    teamsEnabledTenant: true,
    description:
      "Sync Teams and/or Zoom meeting attendance into UserAttendance (canonical). Teams: channel_meeting for channel meetings. Zoom: when platform is Zoom and S2S credentials are set, syncs courses with zoom_meeting_id. Deprecated aliases: sync-video-attendance, sync-teams-attendance.",
    params: [
      { key: "schema_name", type: "string", default: "all orgs", description: "Required with course_id for single-course sync only. Bulk sync uses current tenant (X-Tenant header)." },
      { key: "course_id", type: "number", default: "all", description: "Sync single course (requires schema_name)" },
      {
        key: "channel_meeting",
        type: "boolean",
        default: "false",
        description:
          "Teams only: match reports to event windows; GET .../attendanceReports/{id}/attendanceRecords (requires course events)",
      },
      { key: "sync", type: "boolean", default: "false", description: "Run synchronously" },
      { key: "reprocess", type: "boolean", default: "false", description: "Clear processed meeting attendance markers and re-fetch" },
    ],
  },
  {
    name: "fetch-meeting-info",
    category: "Meetings",
    teamsEnabledTenant: true,
    description:
      "Fetch meeting info (policies, participants, join URL, meeting join ID, passcode). Graph uses application auth (same as update-meeting-policies) so GET can target the course’s resolved organizer; optional use_staffy_organizer to force staffy. Async by default.",
    params: [
      { key: "schema", type: "string", required: true, description: "Tenant schema name" },
      { key: "course_id", type: "number", default: "all", description: "Fetch single course; omit for all" },
      { key: "json", type: "boolean", default: "false", description: "Return JSON output (only applies when sync: true)" },
      { key: "backfill", type: "boolean", default: "false", description: "Save meeting_join_id and meeting_passcode to each course (existing meetings)" },
      {
        key: "use_staffy_organizer",
        type: "boolean",
        default: "false",
        description:
          "If true, force STAFFY_AZURE_OBJECT_ID for every GET. If false, default path uses the course’s resolved organizer (then org default owner) — use true only for meetings created as staffy in Graph",
      },
      { key: "sync", type: "boolean", default: "false", description: "Run synchronously" },
    ],
  },
  {
    name: "send-meeting-link-to-channel",
    category: "Meetings",
    teamsEnabledTenant: true,
    description: "Post meeting link to course Teams channel. Async by default.",
    params: [
      { key: "course_id", type: "number", required: true, description: "Course ID" },
      { key: "schema", type: "string", required: true, description: "Tenant schema name" },
      { key: "sync", type: "boolean", default: "false", description: "Run synchronously" },
    ],
  },
  {
    name: "update-meeting-policies",
    category: "Meetings",
    teamsEnabledTenant: true,
    description: "Update policy settings (lobby, breakout rooms, presenters) or participants (teachers as co-organizers). Use participant_update for participants only; separate calls required. Async by default.",
    params: [
      { key: "schema", type: "string", required: true, description: "Tenant schema name" },
      { key: "course_id", type: "number", default: "all", description: "Update single course; omit for all courses with meetings" },
      { key: "participant_update", type: "boolean", default: "false", description: "If true, only update participants (teachers as co-organizers). If false/omitted, only update policy settings (lobby, breakout rooms, presenters)" },
      { key: "use_staffy_organizer", type: "boolean", default: "false", description: "If true, PATCH uses staffy's Entra object id as Graph user (meetings created under staffy when roster differs)" },
      { key: "sync", type: "boolean", default: "false", description: "Run synchronously" },
    ],
  },
  {
    name: "cleanup-duplicate-payment-assignments",
    category: "Payment assignments",
    teamsEnabledTenant: true,
    description:
      "Find and delete orphaned duplicate Teams payment assignments (Teams only; DB rows kept). Run dry-run first. Async per course by default; use sync for a single course.",
    params: [
      { key: "schema", type: "string", default: "all", description: "Single tenant; omit for all Microsoft-enabled orgs" },
      { key: "course_id", type: "number", default: "all", description: "Limit to a single course" },
      { key: "month", type: "number", default: "—", description: "Limit to payment month 1–12 (use with year)" },
      { key: "year", type: "number", default: "—", description: "Limit to payment year (use with month)" },
      { key: "dry_run", type: "boolean", default: "false", description: "List duplicates without deleting (always sync)" },
      { key: "sync", type: "boolean", default: "false", description: "Run inline instead of queuing per course" },
    ],
  },
  {
    name: "cleanup-ineligible-payment-assignments",
    category: "Payment assignments",
    teamsEnabledTenant: true,
    description: "Delete payment assignments for courses whose category.is_payment_assignment_eligible is False. Cleans up accidentally-created assignments. Deletes from MS Teams and local DB. Async by default.",
    params: [
      { key: "schema", type: "string", default: "all", description: "Single tenant; omit for all Microsoft-enabled orgs" },
      { key: "dry_run", type: "boolean", default: "false", description: "If true, list ineligible without deleting" },
      { key: "sync", type: "boolean", default: "false", description: "Run synchronously" },
    ],
  },
  {
    name: "create-payment-assignments",
    category: "Payment assignments",
    teamsEnabledTenant: true,
    description: "Create Teams payment assignments (monthly screenshots). Async by default.",
    params: [
      { key: "schema", type: "string", default: "all", description: "Single tenant; omit for all Microsoft-enabled orgs" },
      { key: "course_id", type: "number", default: "all", description: "Single course; omit for all eligible" },
      { key: "month", type: "number", default: "current", description: "Target month 1–12" },
      { key: "year", type: "number", default: "current", description: "Target year" },
      { key: "sync", type: "boolean", default: "false", description: "Run synchronously" },
    ],
  },
  {
    name: "delete-payment-assignments",
    category: "Payment assignments",
    teamsEnabledTenant: true,
    description: "Delete Teams payment assignments from MS Teams and local DB (by course and/or month). Async by default.",
    params: [
      { key: "schema", type: "string", default: "all", description: "Single tenant; omit for all Microsoft-enabled orgs" },
      { key: "course_id", type: "number", default: "all", description: "Target a specific course only" },
      { key: "month", type: "number", default: "—", description: "Target month 1–12 (use with year)" },
      { key: "year", type: "number", default: "—", description: "Target year (use with month)" },
      { key: "dry_run", type: "boolean", default: "false", description: "List assignments that would be deleted without making changes" },
      { key: "sync", type: "boolean", default: "false", description: "Run deletions synchronously" },
    ],
  },
  {
    name: "ensure-payment-assignments",
    category: "Payment assignments",
    teamsEnabledTenant: true,
    description: "Ensure payment assignments exist for current + next month (within 10 days). Same logic as daily cron. Async by default.",
    params: [
      {
        key: "schema_name",
        type: "string",
        default: "all",
        description: "Single tenant; omit for all Microsoft-enabled orgs",
      },
      { key: "sync", type: "boolean", default: "false", description: "Run synchronously" },
    ],
  },
  {
    name: "sync-payment-submissions",
    category: "Payment assignments",
    teamsEnabledTenant: true,
    description: "Sync new submissions from Teams payment assignments to UserPayment. Async by default.",
    params: [
      {
        key: "schema_name",
        type: "string",
        default: "all",
        description: "Single tenant; omit for all Microsoft-enabled orgs",
      },
      { key: "course_id", type: "number", default: "all", description: "Sync only payment assignments for this course; omit for all eligible courses" },
      { key: "sync", type: "boolean", default: "false", description: "Run synchronously" },
    ],
  },
  {
    name: "update-payment-assignments",
    category: "Payment assignments",
    teamsEnabledTenant: true,
    description: "Update display names (FM/HM) and due dates for existing payment assignments. Use sync: true if async only updates the first assignment.",
    params: [
      { key: "schema", type: "string", default: "all", description: "Single tenant; omit for all Microsoft-enabled orgs" },
      { key: "course_id", type: "number", default: "all", description: "Single course; omit for all eligible" },
      { key: "month", type: "number", default: "current", description: "Target month 1–12 (ignored if all is true)" },
      { key: "year", type: "number", default: "current", description: "Target year (ignored if all is true)" },
      { key: "all", type: "boolean", default: "false", description: "If true, process all months that have assignments" },
      { key: "dry_run", type: "boolean", default: "false", description: "List assignments that would be updated without making changes" },
      { key: "sync", type: "boolean", default: "false", description: "Run updates synchronously" },
    ],
  },
  {
    name: "send-expo-test-notification",
    category: "Push notifications",
    description:
      "Send a test Expo push for devices in the tenant. Specify exactly one of push_token, user_email, or user_id. Default mode queues Celery; sync: true runs in-process (no worker).",
    params: [
      { key: "schema", type: "string", required: true, description: "Tenant schema name" },
      {
        key: "push_token",
        type: "string",
        default: "",
        description: "Single device: ExponentPushToken[...] or ExpoPushToken[...] (leave empty if using user_email or user_id)",
      },
      {
        key: "user_email",
        type: "string",
        default: "",
        description: "All matching devices for this user email (leave empty if using push_token or user_id)",
      },
      {
        key: "user_id",
        type: "number",
        default: "",
        description: "All matching devices for this user id (leave empty if using push_token or user_email)",
      },
      { key: "title", type: "string", default: "Schedjuice test", description: "Notification title" },
      {
        key: "body",
        type: "string",
        default: "",
        description: "Notification body (omit for server default timestamp message)",
      },
      { key: "sync", type: "boolean", default: "false", description: "true: send immediately without Celery" },
      {
        key: "include_inactive",
        type: "boolean",
        default: "false",
        description: "Include devices with is_active false",
      },
    ],
  },
  {
    name: "backfill-id-photo-thumbs",
    category: "Users",
    description:
      "Generate id_photo_thumb for users who have id_photo but no thumb yet. Safe to re-run.",
    params: [
      {
        key: "schema_name",
        type: "string",
        default: "all",
        description: "Single tenant; omit for all",
      },
      {
        key: "dry_run",
        type: "boolean",
        default: "false",
        description: "Count only; do not write",
      },
      {
        key: "limit",
        type: "number",
        default: "",
        description: "Max users to process (optional)",
      },
    ],
  },
  {
    name: "reset-payment-receipt-numbering",
    category: "Finance",
    description:
      "Renumber verified payments to receipt #1..N (by verified_at), reset the counter to verified count + 1, and fix PDF receipt numbers. Use dry run first.",
    params: [
      {
        key: "schema_name",
        type: "string",
        required: true,
        description: "Tenant schema name",
      },
      {
        key: "dry_run",
        type: "boolean",
        default: "true",
        description: "Preview only; no database writes",
      },
    ],
  },
  {
    name: "backfill-multi-course-payment-coverage",
    category: "Finance",
    description:
      "For multi-course payments missing covered-month rows, assign the full course calendar range and align issued_at. Use dry run first.",
    params: [
      {
        key: "schema_name",
        type: "string",
        required: true,
        description: "Tenant schema name",
      },
      {
        key: "dry_run",
        type: "boolean",
        default: "true",
        description: "Preview only; no database writes",
      },
    ],
  },
  {
    name: "backfill-late-joiner-billing",
    category: "Finance",
    description:
      "Set billing_cycle_anchor_date for late-joining students and delete pending invoices issued before their anchor. Tenant-wide; dry run first.",
    params: [
      {
        key: "schema_name",
        type: "string",
        required: true,
        description: "Tenant schema name",
      },
      {
        key: "dry_run",
        type: "boolean",
        default: "true",
        description: "Preview only; no database writes",
      },
      {
        key: "apply",
        type: "boolean",
        default: "false",
        description: "Persist anchors and delete pre-anchor pending invoices",
      },
      {
        key: "course_id",
        type: "number",
        description: "Limit to one course (optional)",
      },
      {
        key: "force",
        type: "boolean",
        default: "false",
        description: "Recompute anchors even when already set",
      },
    ],
  },
  {
    name: "backfill-late-joiner-billing",
    category: "Finance",
    description:
      "Set billing_cycle_anchor_date for late-joining students and delete pending invoices issued before their anchor. Tenant-wide; dry run first.",
    params: [
      {
        key: "schema_name",
        type: "string",
        required: true,
        description: "Tenant schema name",
      },
      {
        key: "dry_run",
        type: "boolean",
        default: "true",
        description: "Preview only; no database writes",
      },
      {
        key: "apply",
        type: "boolean",
        default: "false",
        description: "Persist anchors and delete pre-anchor pending invoices",
      },
      {
        key: "course_id",
        type: "number",
        description: "Limit to one course (optional)",
      },
      {
        key: "force",
        type: "boolean",
        default: "false",
        description: "Recompute anchors even when already set",
      },
    ],
  },
  {
    name: "backfill-late-joiner-billing",
    category: "Finance",
    description:
      "Set billing_cycle_anchor_date for late-joining students and delete pending invoices issued before their anchor. Tenant-wide; dry run first.",
    params: [
      {
        key: "schema_name",
        type: "string",
        required: true,
        description: "Tenant schema name",
      },
      {
        key: "dry_run",
        type: "boolean",
        default: "true",
        description: "Preview only; no database writes",
      },
      {
        key: "apply",
        type: "boolean",
        default: "false",
        description: "Persist anchors and delete pre-anchor pending invoices",
      },
      {
        key: "course_id",
        type: "number",
        description: "Limit to one course (optional)",
      },
      {
        key: "force",
        type: "boolean",
        default: "false",
        description: "Recompute anchors even when already set",
      },
    ],
  },
  {
    name: "backfill-user-codes",
    category: "Users",
    description:
      "Assign year-scoped User.code (9-digit IDs) for users with null code. Uses created_at year and separate staff/student counters. Safe to dry-run first.",
    params: [
      {
        key: "schema_name",
        type: "string",
        default: "all",
        description: "Single tenant; omit for all non-public schemas",
      },
      {
        key: "dry_run",
        type: "boolean",
        default: "true",
        description: "If true, print planned assignments without writing",
      },
      {
        key: "limit",
        type: "number",
        default: "",
        description: "Max users to process per schema (optional)",
      },
    ],
  },
  {
    name: "backfill-course-teams-organizers",
    category: "Teams setup",
    teamsEnabledTenant: true,
    description:
      "Backfill Course.microsoft_meeting_organizer_id from main-teacher resolution (MT → AT → any teacher with microsoft_id).",
    params: [
      { key: "schema_name", type: "string", default: "all", description: "Limit to one tenant" },
      { key: "course_id", type: "number", default: "all", description: "Single course only (requires schema_name)" },
    ],
  },
  {
    name: "backfill_teams_announcements",
    category: "Teams setup",
    teamsEnabledTenant: true,
    description:
      "Re-enqueue Teams delivery for course feed posts marked send_to_microsoft but never recorded a Teams message id (includes failed). Dry-run by default; set commit=true to enqueue.",
    params: [
      {
        key: "schema_name",
        type: "string",
        default: "all",
        description: "Limit to one tenant; omit for all Microsoft-enabled orgs",
      },
      {
        key: "course",
        type: "number",
        default: "",
        description: "Only announcements for this course id (optional)",
      },
      {
        key: "since",
        type: "string",
        default: "",
        description: "Only announcements created on or after YYYY-MM-DD (e.g. 2026-07-29)",
      },
      {
        key: "limit",
        type: "number",
        default: "100",
        description: "Max announcements to enqueue per tenant (default 100)",
      },
      {
        key: "commit",
        type: "boolean",
        default: "false",
        description: "If true, enqueue Teams sync tasks; if false, dry-run count only",
      },
    ],
  },
];

const COMMAND_GROUPS = getCommandGroups(COMMANDS);
const DEFAULT_SELECTED_COMMAND_NAME =
  COMMAND_GROUPS[0]?.commands[0]?.name ?? COMMANDS[0]?.name ?? "";

type ApiResponse = {
  isError: boolean;
  message: string;
  output?: string;
  stderr?: string;
  details?: string;
  progress?: unknown[];
};

const SCHEMA_PARAM_KEYS = ["schema", "schema_name"] as const;

function parseValue(val: string, type: ParamDef["type"]): unknown {
  if (val === "" || val === null || val === undefined) return undefined;
  if (type === "number") return Number(val);
  if (type === "boolean") return val === "true" || val === "1";
  return val;
}

function getEffectiveValue(
  key: string,
  params: Record<string, string>,
  defaultSchema: string
): string {
  if (params[key] !== undefined) return params[key];
  if (SCHEMA_PARAM_KEYS.includes(key as (typeof SCHEMA_PARAM_KEYS)[number]) && defaultSchema)
    return defaultSchema;
  return "";
}

export default function ManagementCommandsPage() {
  const [selected, setSelected] = useState<string>(DEFAULT_SELECTED_COMMAND_NAME);
  const [params, setParams] = useState<Record<string, string>>({});
  const [defaultSchema, setDefaultSchema] = useState<string>(
    () => String(getCookie("schema") ?? "")
  );
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const { schemaName } = useInternalTenantSchema();

  const cmd = COMMANDS.find((c) => c.name === selected)!;

  useEffect(() => {
    if (schemaName) {
      setDefaultSchema(schemaName);
    }
  }, [schemaName]);

  const commandRequiresSchema = cmd.params.some(
    (p) =>
      p.required &&
      SCHEMA_PARAM_KEYS.includes(p.key as (typeof SCHEMA_PARAM_KEYS)[number]),
  );
  const schemaReady =
    !commandRequiresSchema ||
    Boolean(getEffectiveValue("schema", params, defaultSchema)) ||
    Boolean(getEffectiveValue("schema_name", params, defaultSchema));

  const runCommand = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const payload: Record<string, unknown> = {};
      cmd.params.forEach((p) => {
        const raw = getEffectiveValue(p.key, params, defaultSchema);
        const v = parseValue(raw, p.type);
        if (v !== undefined && v !== "") payload[p.key] = v;
      });

      const isGet = cmd.method === "GET";
      const { data } = isGet
        ? await axiosClient.get<ApiResponse>(`management/${cmd.name}`, {
            params: payload,
          })
        : await axiosClient.post<ApiResponse>(
            `management/${cmd.name}`,
            Object.keys(payload).length ? payload : {}
          );
      setResponse(data);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: ApiResponse } };
      setResponse(
        ax.response?.data ?? {
          isError: true,
          message: "Request failed",
          details: String(err),
        }
      );
    } finally {
      setLoading(false);
    }
  };

  const schema = getCookie("schema");
  const token = getCookie("access");

  return  (
<PageContainer width="wide" className="font-mono text-sm min-h-[70vh]">
      {/* Header */}
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Terminal className="h-4 w-4" />
          <span>DEBUG / MANAGEMENT COMMANDS</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          POST /api/v1/management/&lt;command-name&gt;
        </h1>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Auth: allowlisted accounts only (403 otherwise). Send X-Tenant or Tenant when applicable.
          Responses: isError, message, output, stderr, details. Status: 200 ok, 403/404/500 as in API.
          Commands are async by default; use sync: true to run synchronously where supported.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <label className="text-muted-foreground shrink-0">Default schema:</label>
            <input
              type="text"
              value={defaultSchema}
              onChange={(e) => setDefaultSchema(e.target.value)}
              placeholder="e.g. xteachersu"
              className="bg-background border border-border px-3 py-1.5 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">
              Prefills from header tenant picker; auto-fills schema / schema_name when empty
            </span>
          </div>
        </div>
        {commandRequiresSchema && !schemaReady ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Select a tenant (or enter a schema) before running this school-targeting
            command.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Command list */}
        <div className="border border-border flex flex-col min-h-0 max-h-[calc(100vh-12rem)] lg:max-h-[min(70vh,900px)]">
          <div className="border-b border-border px-4 py-2 bg-muted/30 shrink-0">
            <span className="text-muted-foreground">COMMANDS</span>
          </div>
          <div className="overflow-y-auto flex-1">
            {COMMAND_GROUPS.map((group) => (
              <div key={group.category}>
                <div
                  role="presentation"
                  className="border-b border-border px-4 py-2.5 bg-muted text-[10px] uppercase leading-normal tracking-wide text-muted-foreground"
                >
                  {group.category}
                </div>
                <div className="divide-y divide-border">
                  {group.commands.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => {
                        setSelected(c.name);
                        setParams({});
                        setResponse(null);
                      }}
                      className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors ${
                        selected === c.name ? "bg-muted/50 border-l-2 border-l-foreground -ml-px pl-[15px]" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{c.name}</span>
                        {c.teamsEnabledTenant ? (
                          <Badge className={MICROSOFT_PILL_CLASS} aria-hidden>
                            Microsoft
                          </Badge>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Params + Execute */}
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-border">
            <div className="border-b border-border px-4 py-3 bg-muted/30 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold tracking-tight">
                  {cmd.name}
                </span>
                {cmd.teamsEnabledTenant ? (
                  <Badge className={MICROSOFT_PILL_CLASS}>Microsoft</Badge>
                ) : null}
                <CommandMethodBadge method={cmd.method} />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {cmd.description}
              </p>
            </div>
            <div className="p-4 space-y-0">
              {cmd.params.length === 0 ? (
                <p className="text-muted-foreground text-xs py-1">
                  No parameters. {cmd.method === "GET" ? "Query: empty." : "Body: {}"}
                </p>
              ) : (
                cmd.params.map((p, idx) => {
                  const isSchemaParam = SCHEMA_PARAM_KEYS.includes(p.key as (typeof SCHEMA_PARAM_KEYS)[number]);
                  const isCourseIdParam = p.key === "course_id";
                  const isLast = idx === cmd.params.length - 1;
                  return (
                  <div
                    key={p.key}
                    className={`grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3 py-3 ${!isLast ? "border-b border-border" : ""}`}
                  >
                    <div className="flex flex-col gap-0.5 sm:min-w-0">
                      <label className="text-muted-foreground text-xs">
                        {p.key}
                        {p.required && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <span className="text-[10px] uppercase tracking-wide">
                        {p.required ? (
                          <span className="text-destructive/80">Required</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Optional{p.default ? ` · default: ${p.default}` : ""}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="sm:col-span-2 flex gap-2 items-center">
                      <input
                        type={p.type === "number" ? "number" : p.type === "boolean" ? "text" : "text"}
                        placeholder={p.type === "boolean" ? "true | false" : "e.g. xteachersu"}
                        value={getEffectiveValue(p.key, params, defaultSchema)}
                        onChange={(e) =>
                          setParams((prev) => ({ ...prev, [p.key]: e.target.value }))
                        }
                        className={`bg-background border border-border px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${isCourseIdParam ? "w-20 shrink-0" : "flex-1 min-w-0"}`}
                      />
                      {isCourseIdParam && (
                        <EntityCombobox
                          entity="courses"
                          value={params[p.key] || undefined}
                          onChange={(v) => setParams((prev) => ({ ...prev, [p.key]: v }))}
                          label=""
                          displayFunction={(co) => co.title}
                          queryParams={{ fields: ["id", "title"], sorts: ["title"] }}
                          containerClassName="flex-1 min-w-0"
                        />
                      )}
                    </div>
                    <span className="col-span-1 sm:col-span-3 text-xs text-muted-foreground">
                      {p.description}
                      {isSchemaParam && defaultSchema && params[p.key] === undefined && (
                        <span className="ml-1 text-green-600 dark:text-green-400">(uses default)</span>
                      )}
                    </span>
                  </div>
                );})
              )}
              <div className="pt-2 border-t border-border space-y-2">
                <div className="text-xs text-muted-foreground">
                  <span className="block mb-1">{cmd.method === "GET" ? "Query params:" : "Request body:"}</span>
                  <pre className="p-2 bg-muted/30 border border-border overflow-x-auto">
                    {JSON.stringify(
                      (() => {
                        const b: Record<string, unknown> = {};
                        cmd.params.forEach((p) => {
                          const raw = getEffectiveValue(p.key, params, defaultSchema);
                          const v = parseValue(raw, p.type);
                          if (v !== undefined && v !== "") b[p.key] = v;
                        });
                        return Object.keys(b).length ? b : {};
                      })(),
                      null,
                      2
                    )}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={runCommand}
                  disabled={loading || !token || !schemaReady}
                  className="flex items-center gap-2 px-4 py-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <Spinner className="h-4 w-4 " />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span>EXECUTE</span>
                </button>
                {schema && (
                  <span className="ml-3 text-xs text-muted-foreground">
                    X-Tenant: {String(schema)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Response */}
          {response && (
            <div className="border border-border">
              <div
                className={`border-b border-border px-4 py-2 ${
                  response.isError ? "bg-destructive/20" : "bg-green-500/10"
                }`}
              >
                <span className="text-muted-foreground">
                  RESPONSE {response.isError ? "· ERROR" : "· OK"}
                </span>
              </div>
              <div className="p-4 space-y-2 overflow-x-auto">
                {response.message && (
                  <div>
                    <span className="text-muted-foreground">message: </span>
                    <span>{response.message}</span>
                  </div>
                )}
                {response.details && (
                  <div>
                    <span className="text-muted-foreground">details: </span>
                    <span className="text-destructive">{response.details}</span>
                  </div>
                )}
                {response.output && (
                  <pre className="mt-2 p-3 bg-muted/50 border border-border text-xs whitespace-pre-wrap break-all">
                    {response.output}
                  </pre>
                )}
                {response.stderr && (
                  <pre className="mt-2 p-3 bg-destructive/10 border border-destructive/30 text-xs whitespace-pre-wrap break-all">
                    {response.stderr}
                  </pre>
                )}
                {response.progress &&
                  response.progress.length > 0 && (
                    <pre className="mt-2 p-3 bg-muted/50 border border-border text-xs whitespace-pre-wrap break-all">
                      {JSON.stringify(response.progress, null, 2)}
                    </pre>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
);
}

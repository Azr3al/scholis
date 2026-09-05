import type { NavPermissionChecker } from "@/components/nav/nav-visibility";
import { visibleFinanceRecordEntries } from "@/config/finance-record-nav";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type WorkspaceId =
  | "finance"
  | "studio"
  | "crm"
  | "hr"
  | "admissions";
export type WorkspaceStatus = "enterable" | "coming_soon";

export type WorkspaceCard = {
  id: WorkspaceId;
  label: string;
  logo: WorkspaceId;
  status: WorkspaceStatus;
  homeHref?: string;
};

export const WORKSPACE_ORDER: WorkspaceId[] = [
  "finance",
  "studio",
  "crm",
  "hr",
  "admissions",
];

const WORKSPACE_LABEL: Record<WorkspaceId, string> = {
  finance: "Finance",
  studio: "Studio",
  crm: "CRM",
  hr: "HR",
  admissions: "Admissions",
};

const ENTERABLE_HOME: Record<
  Extract<WorkspaceId, "finance" | "studio" | "crm" | "admissions">,
  string
> = {
  finance: "/finances",
  studio: "/studio",
  crm: "/crm/leads",
  admissions: "/admissions",
};

export function isFinanceWorkspaceEnterable(args: {
  checker: NavPermissionChecker;
  tenant: organizationType | null | undefined;
  user: accountType | undefined;
}): boolean {
  return (
    visibleFinanceRecordEntries(
      args.user,
      args.tenant ?? null,
      args.checker.canAny,
    ).length > 0
  );
}

export function isStudioWorkspaceEnterable(
  checker: NavPermissionChecker,
): boolean {
  return (
    checker.canAny(["document_template.manage"]) ||
    checker.canAny(["award_title.manage"])
  );
}

export function isAdmissionsWorkspaceEnterable(
  checker: NavPermissionChecker,
): boolean {
  return checker.canAny(["admissions.view"]);
}

export function isCrmWorkspaceEnterable(args: {
  checker: NavPermissionChecker;
  tenant: organizationType | null | undefined;
}): boolean {
  if (!args.tenant?.is_crm_enabled) return false;
  return (
    args.checker.canAny(["lead.view"]) || args.checker.canAny(["issue.view"])
  );
}

export function crmWorkspaceHomeHref(checker: NavPermissionChecker): string {
  if (checker.canAny(["lead.view"])) return "/crm/leads";
  return "/crm/issues";
}

export function buildVisibleWorkspaces(args: {
  checker: NavPermissionChecker;
  tenant: organizationType | null | undefined;
  user: accountType | undefined;
}): WorkspaceCard[] {
  const finance = isFinanceWorkspaceEnterable(args);
  const studio = isStudioWorkspaceEnterable(args.checker);
  const crm = isCrmWorkspaceEnterable(args);
  const admissions = isAdmissionsWorkspaceEnterable(args.checker);
  if (!finance && !studio && !crm && !admissions) return [];

  return WORKSPACE_ORDER.flatMap((id): WorkspaceCard[] => {
    if (id === "hr") {
      return [
        {
          id,
          label: WORKSPACE_LABEL[id],
          logo: id,
          status: "coming_soon" as const,
        },
      ];
    }
    if (id === "admissions") {
      if (!admissions) return [];
      return [
        {
          id,
          label: WORKSPACE_LABEL[id],
          logo: id,
          status: "enterable" as const,
          homeHref: ENTERABLE_HOME.admissions,
        },
      ];
    }
    if (id === "crm") {
      if (!crm) return [];
      return [
        {
          id,
          label: WORKSPACE_LABEL[id],
          logo: id,
          status: "enterable" as const,
          homeHref: crmWorkspaceHomeHref(args.checker),
        },
      ];
    }
    if (id === "finance" && !finance) return [];
    if (id === "studio" && !studio) return [];
    return [
      {
        id,
        label: WORKSPACE_LABEL[id],
        logo: id,
        status: "enterable" as const,
        homeHref: ENTERABLE_HOME[id],
      },
    ];
  });
}

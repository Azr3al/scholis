"use client";
import { Select } from "@/components/primitives";

import { useMemo, useState } from "react";
import { useCatalog, useRoles } from "@/api/rbac";
import { synthesizePolicy } from "@/lib/rbac/synthesize-policy";
import { cn } from "@/lib/utils";
import { PolicyExportActions } from "./policy-export";
import {
  policyBreadthSummary,
  policyHasOrgWideScope,
} from "./policy-overview-utils";
import {
  PEOPLE_DATA_POLICY_HEADING,
  PEOPLE_DATA_POLICY_PARAGRAPHS,
} from "@/lib/rbac/people-data-policy";

function PeopleDataPolicyBlock() {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{PEOPLE_DATA_POLICY_HEADING}</h3>
      <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        {PEOPLE_DATA_POLICY_PARAGRAPHS.map((paragraph) => (
          <li key={paragraph}>{paragraph}</li>
        ))}
      </ul>
    </section>
  );
}

export function PolicyOverview() {
  const { data: catalog = [], isLoading: catalogLoading } = useCatalog();
  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  const selectedRole = useMemo(
    () => roles.find((role) => String(role.id) === selectedRoleId) ?? roles[0],
    [roles, selectedRoleId],
  );

  const policy = useMemo(() => {
    if (!selectedRole || catalog.length === 0) return null;
    return synthesizePolicy(selectedRole.codes, catalog);
  }, [selectedRole, catalog]);

  const isLoading = catalogLoading || rolesLoading;

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground" aria-busy="true">
        Loading policy overview…
      </div>
    );
  }

  if (!roles.length) {
    return (
      <div className="space-y-6">
        <PeopleDataPolicyBlock />
        <p className="text-sm text-muted-foreground">
          No assignable roles are configured yet.
        </p>
      </div>
    );
  }

  const activeRoleId = String(selectedRole?.id ?? roles[0]?.id ?? "");

  return (
    <div className="space-y-6">
      <PeopleDataPolicyBlock />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Role</p>
          <Select
            value={activeRoleId}
            onValueChange={setSelectedRoleId}
            placeholder="Select a role"
            className="w-[280px]"
            items={roles.map((role) => ({
              value: String(role.id),
              label: `${role.display_name}${role.is_system ? " (System)" : " (Custom)"}`,
            }))}
          />
        </div>
        {selectedRole && policy ? (
          <PolicyExportActions
            roleName={selectedRole.display_name}
            policy={policy}
          />
        ) : null}
      </div>

      {!policy || selectedRole?.codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This role has no permissions assigned yet.
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">At a glance</h3>
            <div className="flex flex-wrap gap-2">
              {policy.dataClasses.map((dataClass) => (
                <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary" key={dataClass} >
                  {dataClass}
                </span>
              ))}
              <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary" >{policyBreadthSummary(policy)}</span>
              {policyHasOrgWideScope(policy) ? (
                <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary" >Org-wide scope</span>
              ) : null}
              {policy.canGrantRoles ? (
                <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary" >Can grant permissions to others</span>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">What this role can do</h3>
            <div className="divide-y rounded-md border">
              {policy.can.map((group) => (
                <div key={group.domain} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium capitalize">{group.domain}</span>
                    {group.dataClasses.map((dataClass) => (
                      <span
                        key={`${group.domain}-${dataClass}`}
                        className={cn("inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary", 
                          dataClass === "Financial" &&
                            "border-amber-500/50 text-amber-800 dark:text-amber-200",
                        )}
                      >
                        {dataClass}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">{group.text}</p>
                </div>
              ))}
            </div>
          </section>

          {policy.cannot.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">What this role cannot do</h3>
              <p className="text-sm text-muted-foreground">
                Sensitive capabilities this role does not hold:
              </p>
              <div className="divide-y rounded-md border">
                {policy.cannot.map((item) => (
                  <div key={item.code} className="space-y-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{item.code}</span>
                      <span
                        className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("border-amber-500/50 text-amber-800 dark:text-amber-200")}
                      >
                        {item.data_class}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.sentence}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

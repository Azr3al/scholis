"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { UserMergeSheet } from "@/components/user-insights/user-merge-sheet";
import {
  formatMatchReasonBadgeText,
  isClusterLikelyFalsePositive,
  matchReasonIsSuspicious,
} from "@/helpers/duplicate-cluster-display";
import { formatMsLastSignIn } from "@/helpers/user-insights";
import {
  isSuspiciousContact,
  type SuspiciousContactField,
} from "@/helpers/suspicious-contact";
import type { DuplicateCluster, MsSignInEntry } from "@/types/user-insights";
import { NavArrowDown as ChevronDown, NavArrowRight as ChevronRight } from "iconoir-react";
import Link from "next/link";
import { Fragment, useState } from "react";

type DuplicateClustersTableProps = {
  rows: DuplicateCluster[];
  signInByUserId: Record<string, MsSignInEntry>;
  canMerge: boolean;
  onMerged: () => void;
};

function ContactValue({
  value,
  field,
}: {
  value: string;
  field: SuspiciousContactField;
}) {
  if (!value.trim()) {
    return <span className="text-muted-foreground">—</span>;
  }
  const suspicious = isSuspiciousContact(value, field);
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={
          suspicious ? "text-amber-700 dark:text-amber-300" : undefined
        }
      >
        {value}
      </span>
      {suspicious ? (
        <span className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("bg-amber-500/15 text-amber-900 hover:bg-amber-500/15 dark:text-amber-100")}>
          Placeholder
        </span>
      ) : null}
    </span>
  );
}

export function DuplicateClustersTable({
  rows,
  signInByUserId,
  canMerge,
  onMerged,
}: DuplicateClustersTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mergeTarget, setMergeTarget] = useState<DuplicateCluster | null>(null);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border py-10 text-center text-sm text-muted-foreground">
        No duplicate clusters match the selected filters.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto sj-scroll rounded-xl border">
        <table>
          <thead>
            <tr>
              <th className="w-8" />
              <th>Students</th>
              <th>Match reasons</th>
              <th>Siblings</th>
              {canMerge ? <th className="w-[140px]">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((cluster) => {
              const isOpen = expanded[cluster.cluster_id] ?? false;
              return (
                <Fragment key={cluster.cluster_id}>
                  <tr>
                    <td>
                      <button
                        type="button"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [cluster.cluster_id]: !isOpen,
                          }))
                        }
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td>
                      <span className="font-medium">{cluster.users.length}</span>
                      <span className="ml-2 text-muted-foreground">
                        {cluster.users.map((u) => u.name).join(", ")}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {cluster.match_reasons.map((reason) => (
                          <span
                            key={`${reason.field}-${reason.normalized_value}`}
                            className={
                              matchReasonIsSuspicious(reason)
                                ? "border-amber-500/50 text-amber-900 dark:text-amber-100"
                                : undefined
                            }
                          >
                            {formatMatchReasonBadgeText(reason)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {cluster.possible_siblings ? (
                        <span className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("bg-amber-500/15 text-amber-900 hover:bg-amber-500/15 dark:text-amber-100")}>
                          Possible siblings
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {canMerge ? (
                      <td>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary" onClick={() => setMergeTarget(cluster)}
                        >
                          Review merge
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                  {isOpen ? (
                    <tr>
                      <td colSpan={canMerge ? 5 : 4}>
                        <div className="space-y-3 py-2">
                          {isClusterLikelyFalsePositive(cluster) ? (
                            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                              <span className="font-medium">Likely false positive</span>
                              {" — "}
                              this cluster is linked only by placeholder contact data.
                              Consider correcting the source data rather than merging
                              accounts.
                            </div>
                          ) : null}
                          <div className="overflow-x-auto sj-scroll rounded-lg border">
                            <table>
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Primary email</th>
                                  <th>Phone</th>
                                  <th>Comms email</th>
                                  <th>Emergency phone</th>
                                  <th>MS sign-in</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cluster.users.map((user) => (
                                  <tr key={user.id}>
                                    <td>
                                      <span className="inline-flex items-center gap-2">
                                        <Link
                                          href={`/users/${user.id}`}
                                          className="font-medium hover:underline"
                                        >
                                          {user.name}
                                        </Link>
                                        {!user.is_active ? (
                                          <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary" >Inactive</span>
                                        ) : null}
                                      </span>
                                    </td>
                                    <td className="text-muted-foreground">
                                      {user.email || "—"}
                                    </td>
                                    <td>
                                      <ContactValue
                                        value={user.phone_number}
                                        field="phone"
                                      />
                                    </td>
                                    <td>
                                      <ContactValue
                                        value={user.communication_email}
                                        field="communication_email"
                                      />
                                    </td>
                                    <td>
                                      <ContactValue
                                        value={user.emergency_contact_phone_number ?? ""}
                                        field="emergency_phone"
                                      />
                                    </td>
                                    <td>
                                      {formatMsLastSignIn(
                                        signInByUserId[String(user.id)]
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <UserMergeSheet
        cluster={mergeTarget}
        signInByUserId={signInByUserId}
        open={mergeTarget != null}
        onOpenChange={(open) => {
          if (!open) setMergeTarget(null);
        }}
        onMerged={onMerged}
      />
    </>
  );
}

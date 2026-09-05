"use client";

import { motion } from "motion/react";
import { Avatar } from "@/components/primitives/avatar";
import {
  ORG_GROUP_LABELS,
  ORG_GROUP_ORDER,
  visibleOrgSections,
  type OrgRecordContext,
  type OrgSectionGroup,
  type OrgSectionId,
} from "@/config/org-record-sections";
import { RecordRailHeader } from "@/components/shell/record-rail-header";
import { transition, staggerItem, staggerList } from "@/lib/sj/motion";
import { playClick } from "@/lib/sound/click-sound";
import {
  RecordRailGroupHeader,
  RecordRailGroupItems,
} from "@/components/shell/record-rail-nav-group";
import { cn } from "@/lib/utils";
import type { organizationType } from "@/types/organization";

export type OrgContextParent = { label: string; href: string };

export function OrgSectionRail({
  org,
  ctx,
  section,
  activeSection,
  onSelect,
  contextParent,
  isLoading,
}: {
  org: organizationType | null | undefined;
  ctx: OrgRecordContext;
  section: OrgSectionId;
  activeSection?: OrgSectionId | null;
  onSelect: (s: OrgSectionId) => void;
  contextParent: OrgContextParent;
  isLoading?: boolean;
}) {
  const sections = visibleOrgSections(ctx);
  const highlightedSection =
    activeSection !== undefined ? activeSection : section;

  const sectionsByGroup = ORG_GROUP_ORDER.reduce(
    (acc, group) => {
      acc[group] = sections.filter((s) => s.group === group);
      return acc;
    },
    {} as Record<Exclude<OrgSectionGroup, "top">, typeof sections>,
  );

  const topSections = sections.filter((s) => s.group === "top");

  return (
    <motion.aside
      initial={{ width: 0 }}
      animate={{ width: 208 }}
      exit={{ width: 0 }}
      transition={transition.panelWipe}
      className="sj-root relative h-full shrink-0 overflow-hidden bg-surface-sunken"
    >
      <motion.div
        variants={staggerList}
        initial="hidden"
        animate="show"
        className="flex h-full w-52 flex-col overflow-y-auto no-scrollbar"
      >
        <motion.div variants={staggerItem}>
          <RecordRailHeader parent={contextParent}>
            <div className="flex items-center gap-2.5">
              {org && !isLoading ? (
                <>
                  <Avatar
                    src={org.logo ?? undefined}
                    name={org.name ?? "?"}
                    className="size-9 rounded-md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {org.name}
                    </p>
                    {org.domain_url ? (
                      <p className="truncate text-xs text-text-muted">
                        {org.domain_url}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div
                    aria-hidden
                    className="size-9 shrink-0 animate-pulse rounded-md bg-surface-skeleton"
                  />
                  <div
                    className="min-w-0 flex-1 space-y-1.5"
                    aria-busy="true"
                    aria-label="Loading organization"
                  >
                    <div className="h-3.5 w-24 animate-pulse rounded bg-surface-skeleton" />
                    <div className="h-3 w-16 animate-pulse rounded bg-surface-skeleton" />
                  </div>
                </>
              )}
            </div>
          </RecordRailHeader>
        </motion.div>

        <nav className="flex flex-col gap-4 px-2 py-2 pb-4">
          {topSections.map((s) => (
            <OrgSectionButton
              key={s.id}
              section={s.id}
              label={s.label}
              active={highlightedSection !== null && highlightedSection === s.id}
              onSelect={onSelect}
            />
          ))}

          {ORG_GROUP_ORDER.map((group) => {
            const groupSections = sectionsByGroup[group];
            if (!groupSections.length) return null;
            return (
              <div key={group}>
                <RecordRailGroupHeader>{ORG_GROUP_LABELS[group]}</RecordRailGroupHeader>
                <RecordRailGroupItems>
                  {groupSections.map((s) => (
                    <OrgSectionButton
                      key={s.id}
                      section={s.id}
                      label={s.label}
                      active={
                        highlightedSection !== null &&
                        highlightedSection === s.id
                      }
                      onSelect={onSelect}
                    />
                  ))}
                </RecordRailGroupItems>
              </div>
            );
          })}
        </nav>
      </motion.div>
    </motion.aside>
  );
}

function OrgSectionButton({
  section,
  label,
  active,
  onSelect,
}: {
  section: OrgSectionId;
  label: string;
  active: boolean;
  onSelect: (s: OrgSectionId) => void;
}) {
  return (
    <motion.button
      variants={staggerItem}
      type="button"
      onClick={() => {
        if (!active) playClick();
        onSelect(section);
      }}
      aria-current={active ? "page" : undefined}
      data-org-section={section}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-left text-sm transition-colors duration-[var(--duration-fast)]",
        active
          ? "bg-surface-active font-medium text-text-primary"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
      )}
    >
      {label}
    </motion.button>
  );
}

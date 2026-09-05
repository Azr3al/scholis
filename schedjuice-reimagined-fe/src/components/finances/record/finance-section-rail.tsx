"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  financeRecordNavActive,
  visibleFinanceRecordNavSections,
  type FinanceRecordNavEntry,
} from "@/config/finance-record-nav";
import { SCHOOL_HOME } from "@/config/school-home";
import {
  RecordRailHeader,
  RecordRailWorkspaceIdentity,
} from "@/components/shell/record-rail-header";
import { transition, staggerItem, staggerList } from "@/lib/sj/motion";
import { playClick } from "@/lib/sound/click-sound";
import {
  RecordRailGroupHeader,
  RecordRailGroupItems,
} from "@/components/shell/record-rail-nav-group";
import { cn } from "@/lib/utils";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

function FinanceNavLink({
  entry,
  pathname,
  onNavigate,
}: {
  entry: FinanceRecordNavEntry;
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  const active = financeRecordNavActive(entry, pathname);

  return (
    <motion.div variants={staggerItem}>
      <Link
        href={entry.href}
        onClick={(e) => {
          if (!active) {
            playClick();
            if (!e.metaKey && !e.ctrlKey && e.button === 0) {
              onNavigate(entry.href);
            }
          }
        }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "block rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
          active
            ? "bg-surface-active font-medium text-text-primary"
            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        {entry.label}
      </Link>
    </motion.div>
  );
}

export function FinanceSectionRail({
  pathname,
  user,
  tenant,
  canAny,
}: {
  pathname: string;
  user: accountType | undefined;
  tenant: organizationType | null;
  canAny: (codes: string[]) => boolean;
}) {
  const router = useRouter();
  const sections = visibleFinanceRecordNavSections(user, tenant, canAny);

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
        className="flex h-full w-52 flex-col"
      >
        <motion.div variants={staggerItem}>
          <RecordRailHeader parent={SCHOOL_HOME}>
            <RecordRailWorkspaceIdentity name="finance" label="Finance" />
          </RecordRailHeader>
        </motion.div>

        <motion.nav
          variants={staggerList}
          initial="hidden"
          animate="show"
          aria-label="Finance sections"
          className="flex flex-col gap-4 px-2 py-2 pb-4"
        >
          {sections.overview ? (
            <FinanceNavLink
              entry={sections.overview}
              pathname={pathname}
              onNavigate={router.push}
            />
          ) : null}

          {sections.groups.map((group) => (
            <div key={group.id}>
              <motion.div variants={staggerItem}>
                <RecordRailGroupHeader>{group.label}</RecordRailGroupHeader>
              </motion.div>
              <RecordRailGroupItems>
                {group.entries.map((entry) => (
                  <FinanceNavLink
                    key={entry.id}
                    entry={entry}
                    pathname={pathname}
                    onNavigate={router.push}
                  />
                ))}
              </RecordRailGroupItems>
            </div>
          ))}
        </motion.nav>
      </motion.div>
    </motion.aside>
  );
}

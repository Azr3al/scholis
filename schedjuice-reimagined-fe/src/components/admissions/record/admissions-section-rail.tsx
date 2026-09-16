"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ADMISSIONS_RECORD_NAV_ENTRIES,
  admissionsRecordNavActive,
} from "@/config/admissions-record-nav";
import { SCHOOL_HOME } from "@/config/school-home";
import {
  RecordRailHeader,
  RecordRailWorkspaceIdentity,
} from "@/components/shell/record-rail-header";
import { transition, staggerItem, staggerList } from "@/lib/sj/motion";
import { playClick } from "@/lib/sound/click-sound";
import { cn } from "@/lib/utils";

type NavEntry = (typeof ADMISSIONS_RECORD_NAV_ENTRIES)[number];

function AdmissionsNavLink({
  entry,
  pathname,
  onNavigate,
}: {
  entry: NavEntry;
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  const active = admissionsRecordNavActive(entry, pathname);
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

export function AdmissionsSectionRail({ pathname }: { pathname: string }) {
  const router = useRouter();

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
            <RecordRailWorkspaceIdentity name="admissions" label="Admissions" />
          </RecordRailHeader>
        </motion.div>
        <motion.nav
          variants={staggerList}
          initial="hidden"
          animate="show"
          aria-label="Admissions sections"
          className="flex flex-col gap-1 px-2 py-2 pb-4"
        >
          {ADMISSIONS_RECORD_NAV_ENTRIES.map((entry) => (
            <AdmissionsNavLink
              key={entry.id}
              entry={entry}
              pathname={pathname}
              onNavigate={router.push}
            />
          ))}
        </motion.nav>
      </motion.div>
    </motion.aside>
  );
}

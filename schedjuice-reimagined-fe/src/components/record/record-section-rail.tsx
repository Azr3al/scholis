"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { LogOut } from "iconoir-react";
import { Avatar } from "@/components/primitives/avatar";
import { AlertDialog } from "@/components/primitives/alert-dialog";
import { Button } from "@/components/primitives/button";
import { transition, staggerList, staggerItem } from "@/lib/sj/motion";
import { playClick } from "@/lib/sound/click-sound";
import {
  RecordRailGroupHeader,
  RecordRailGroupItems,
} from "@/components/shell/record-rail-nav-group";
import { RecordRailHeader } from "@/components/shell/record-rail-header";
import { logout } from "@/helpers/auth";
import { visibleRecordRailLinks } from "./record-rail-links";
import { RECORD_SECTIONS, visibleSections, type RecordSectionId } from "./record-sections";
import { cn } from "@/lib/utils";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

const railItemClassName = (active: boolean) =>
  cn(
    "block rounded-md px-2.5 py-1.5 text-left text-sm transition-colors duration-[var(--duration-fast)]",
    active
      ? "bg-surface-active font-medium text-text-primary"
      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  );

function RecordSectionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      variants={staggerItem}
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={railItemClassName(active)}
    >
      {label}
    </motion.button>
  );
}

function RecordRailLinkButton({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={railItemClassName(active)}
      onClick={() => {
        if (!active) playClick();
      }}
    >
      {label}
    </Link>
  );
}

/** Record-scoped rail registered into the shell's context-rail slot (desktop). */
export function RecordSectionRail({
  subject,
  viewer,
  tenant,
  section,
  onSelect,
}: {
  subject?: accountType | null;
  viewer?: accountType | null;
  tenant?: organizationType | null;
  section: RecordSectionId;
  onSelect: (s: RecordSectionId) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pathname = usePathname();

  const allSections =
    subject && viewer
      ? visibleSections({ tenant, subject, viewer })
      : RECORD_SECTIONS.filter((s) => s.id !== "points" && s.id !== "settings");

  const mainSections = allSections.filter((s) => s.id !== "settings");
  const settingsSection = allSections.find((s) => s.id === "settings");
  const isOwnProfile = Boolean(subject && viewer && subject.id === viewer.id);

  const recordContext =
    subject && viewer ? { tenant, subject, viewer } : null;

  const isProfileSubRoute = Boolean(
    subject &&
      pathname.startsWith(`/users/${subject.id}/`) &&
      pathname !== `/users/${subject.id}/`,
  );

  const railLinks =
    recordContext != null ? visibleRecordRailLinks(recordContext) : [];

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
          <RecordRailHeader parent={{ label: "Users", href: "/users" }}>
            <div className="flex items-center gap-2.5">
              {subject ? (
                <>
                  <Avatar src={subject.profile_image} name={subject.name ?? "?"} className="size-9" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{subject.name}</p>
                    <p className="truncate text-xs text-text-muted">{(subject.roles ?? [])[0] ?? ""}</p>
                  </div>
                </>
              ) : (
                <>
                  <div
                    aria-hidden
                    className="size-9 shrink-0 animate-pulse rounded-full bg-surface-skeleton"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5" aria-busy="true" aria-label="Loading profile">
                    <div className="h-3.5 w-24 animate-pulse rounded bg-surface-skeleton" />
                    <div className="h-3 w-16 animate-pulse rounded bg-surface-skeleton" />
                  </div>
                </>
              )}
            </div>
          </RecordRailHeader>
        </motion.div>

        <nav className="flex min-h-0 flex-1 flex-col px-2 py-2">
          <div className="flex flex-col gap-0.5">
            {mainSections.map((s) => (
              <div key={s.id} className="flex flex-col gap-0.5">
                <RecordSectionButton
                  label={s.label}
                  active={!isProfileSubRoute && section === s.id}
                  onClick={() => {
                    if (s.id !== section) playClick();
                    onSelect(s.id);
                  }}
                />
                {s.id === "academic" && subject && railLinks.length > 0 ? (
                  <RecordRailGroupItems>
                    {railLinks.map((link) => {
                      const href = `/users/${subject.id}/${link.pathSuffix}`;
                      return (
                        <RecordRailLinkButton
                          key={link.pathSuffix}
                          href={href}
                          label={link.label(recordContext!)}
                          active={
                            pathname === href || pathname.startsWith(`${href}/`)
                          }
                        />
                      );
                    })}
                  </RecordRailGroupItems>
                ) : null}
              </div>
            ))}
          </div>

          {settingsSection ? (
            <div className="mt-4">
              <RecordRailGroupHeader>Account</RecordRailGroupHeader>
              <RecordRailGroupItems>
                <RecordSectionButton
                  label={settingsSection.label}
                  active={!isProfileSubRoute && section === "settings"}
                  onClick={() => {
                    if (section !== "settings") playClick();
                    onSelect("settings");
                  }}
                />
              </RecordRailGroupItems>
            </div>
          ) : null}

          {isOwnProfile ? (
            <>
              <div className="flex-1" />
              <div className="border-t border-border px-2 py-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-danger transition-colors hover:bg-surface-hover"
                >
                  <LogOut width={16} height={16} aria-hidden />
                  Log out
                </button>
              </div>
            </>
          ) : null}
        </nav>
      </motion.div>

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Log out?</AlertDialog.Title>
            <AlertDialog.Description>You will be returned to the sign-in screen.</AlertDialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button variant="danger" onClick={() => logout()}>
                Log out
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </motion.aside>
  );
}

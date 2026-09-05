"use client";

// P2b brainstorming mockup — NOT production. Renders in the .sj-root design world
// (inherited from the /components layout) using real tokens + primitives so we can
// react to the user-record redesign visually. Delete once P2b is specced.

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Home,
  GraduationCap,
  Group,
  Wallet,
  AppWindow,
  NavArrowLeft,
  MoreHoriz,
  Lock,
  Check,
  EditPencil,
  Calendar,
  Clock,
  Plus,
} from "iconoir-react";
import { Avatar } from "@/components/primitives/avatar";
import { Button } from "@/components/primitives/button";
import { Menu } from "@/components/primitives/menu";
import {
  transition,
  crossfade,
  staggerList,
  staggerItem,
  savedTick,
} from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

const GLOBAL_NAV = [
  { icon: Home, label: "Home" },
  { icon: GraduationCap, label: "Courses" },
  { icon: Group, label: "People", active: true },
  { icon: Wallet, label: "Finance" },
  { icon: AppWindow, label: "CRM" },
];

const RECORD_SECTIONS = ["Overview", "Academic", "Finance", "Records", "Activity"];

export default function UserRecordMockup() {
  const [mode, setMode] = useState<"global" | "record">("record");

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="font-hand text-hand text-brand">P2b — visual mockup</p>
        <h1 className="font-serif text-3xl text-text-primary">User record &amp; contextual sidebar</h1>
        <p className="max-w-2xl text-text-secondary">
          A clickable sketch of the redesign for reactions only. Toggle the shell between global
          navigation and the record-scoped rail. Below, close-ups of inline editing and the
          activity timeline. Sample data, not wired to the API.
        </p>
      </header>

      {/* ---- Hero: the contextual swap ---- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-text-primary">1 · The sidebar swap</h2>
          <div className="inline-flex rounded-full border border-border bg-surface-elevated p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("global")}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                mode === "global" ? "bg-accent text-accent-foreground" : "text-text-muted hover:text-text-primary",
              )}
            >
              Global
            </button>
            <button
              type="button"
              onClick={() => setMode("record")}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                mode === "record" ? "bg-accent text-accent-foreground" : "text-text-muted hover:text-text-primary",
              )}
            >
              In a record
            </button>
          </div>
        </div>

        <div className="flex h-[560px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {/* Rail zone — one persistent rail that morphs width; the section rail wipes
              out from behind it so nothing pops in from nowhere. */}
          <LeftRail mode={mode} />
          <AnimatePresence>{mode === "record" && <SectionRail key="srail" />}</AnimatePresence>

          {/* Content zone */}
          <div className="flex min-w-0 flex-1 flex-col p-3">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated">
              <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={mode}
                    variants={crossfade}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="font-serif text-base text-text-primary"
                  >
                    {mode === "global" ? "People · Users" : "Aung Zeya"}
                  </motion.p>
                </AnimatePresence>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={mode}
                    variants={crossfade}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {mode === "global" ? <UsersListContent /> : <RecordContent />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Inline editing close-up ---- */}
      <section className="space-y-3">
        <h2 className="font-serif text-2xl text-text-primary">2 · Inline editing — two commit modes</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface-elevated p-5">
            <p className="mb-3 text-sm font-medium text-text-muted">Auto-save (low-risk scalars)</p>
            <div className="divide-y divide-border">
              <AutoSaveRow label="Full name" initial="Aung Zeya" />
              <AutoSaveRow label="Phone" initial="+95 9 7788 1234" />
              <LockedRow label="Primary email" value="aung.zeya@school.edu" />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-elevated p-5">
            <p className="mb-3 text-sm font-medium text-text-muted">Explicit save (free text &amp; consequential)</p>
            <ExplicitSaveRow label="Notes" initial="Prefers morning sessions. Strong in algebra." />
            <RolesRow />
          </div>
        </div>
      </section>

      {/* ---- Activity close-up ---- */}
      <section className="space-y-3">
        <h2 className="font-serif text-2xl text-text-primary">3 · Activity (report-type log, re-skinned)</h2>
        <ActivityPreview />
        <p className="max-w-2xl text-sm text-text-muted">
          Pills are colored from each report type (backend today). “Fact/Opinion”, corrections and
          retractions would need backend work — out of P2b unless we pull it in.
        </p>
      </section>
    </div>
  );
}

/* ----------------------------- Rails ----------------------------- */

/** Persistent left rail: morphs 240↔56, labels fade as it narrows into an icon rail. */
function LeftRail({ mode }: { mode: "global" | "record" }) {
  const expanded = mode === "global";
  return (
    <motion.aside
      animate={{ width: expanded ? 240 : 56 }}
      transition={transition.railMorph}
      className="flex shrink-0 flex-col overflow-hidden bg-surface"
    >
      <div className="flex h-16 items-center gap-2 px-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">
          SJ
        </div>
        <motion.span
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={transition.fadeFast}
          className="whitespace-nowrap font-serif text-lg text-text-primary"
        >
          Sunflower
        </motion.span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {GLOBAL_NAV.map(({ icon: Icon, label, active }) => (
          <div
            key={label}
            title={label}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
              active ? "bg-surface-active font-medium text-text-primary" : "text-text-secondary",
            )}
          >
            <Icon width={18} height={18} className="shrink-0" />
            <motion.span
              animate={{ opacity: expanded ? 1 : 0 }}
              transition={transition.fadeFast}
              className="whitespace-nowrap"
            >
              {label}
            </motion.span>
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-2.5 border-t border-border p-3">
        <Avatar name="Daw Mya" className="size-8 shrink-0" />
        <motion.span
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={transition.fadeFast}
          className="whitespace-nowrap text-sm text-text-secondary"
        >
          Daw Mya
        </motion.span>
      </div>
    </motion.aside>
  );
}

/** Record section rail: width wipes 0→200 from behind the icon rail; contents stagger in. */
function SectionRail() {
  return (
    <motion.aside
      initial={{ width: 0 }}
      animate={{ width: 200 }}
      exit={{ width: 0 }}
      transition={transition.panelWipe}
      className="shrink-0 overflow-hidden border-l border-border bg-surface"
    >
      {/* fixed inner width so content doesn't reflow while the rail wipes open */}
      <motion.div
        variants={staggerList}
        initial="hidden"
        animate="show"
        exit="exit"
        className="flex h-full w-[200px] flex-col"
      >
        <motion.button
          variants={staggerItem}
          className="flex items-center gap-1.5 px-3 py-3 text-sm text-text-secondary hover:text-text-primary"
        >
          <NavArrowLeft width={15} height={15} />
          Users
        </motion.button>
        <motion.div
          variants={staggerItem}
          className="flex items-center gap-2.5 border-b border-border px-3 pb-3"
        >
          <Avatar name="Aung Zeya" className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">Aung Zeya</p>
            <p className="truncate text-xs text-text-muted">Student</p>
          </div>
        </motion.div>
        <nav className="flex flex-col gap-0.5 px-2 py-2">
          {RECORD_SECTIONS.map((s, i) => (
            <motion.div
              key={s}
              variants={staggerItem}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm",
                i === 0 ? "bg-surface-active font-medium text-text-primary" : "text-text-secondary",
              )}
            >
              {s}
            </motion.div>
          ))}
        </nav>
      </motion.div>
    </motion.aside>
  );
}

/* --------------------------- Content --------------------------- */

function UsersListContent() {
  const rows = ["Aung Zeya", "Su Su Hlaing", "Kyaw Min", "မြတ်နိုး အောင်", "Daniel Pak"];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
          <th className="px-4 py-3 font-medium">Name</th>
          <th className="px-4 py-3 font-medium">Role</th>
          <th className="px-4 py-3 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r} className="border-b border-border/60">
            <td className="px-4 py-3 text-text-primary">{r}</td>
            <td className="px-4 py-3 text-text-secondary">Student</td>
            <td className="px-4 py-3"><span className="text-success">Active</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecordContent() {
  return (
    <div className="space-y-6 p-5">
      {/* identity strip */}
      <div className="flex items-start gap-4">
        <Avatar name="Aung Zeya" className="size-16" />
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-3xl text-text-primary">Aung Zeya</h3>
          <p className="text-text-muted">aung.zeya@school.edu</p>
          <span className="mt-1 inline-block rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-medium text-accent">
            Student
          </span>
        </div>
        <Menu.Root>
          <Menu.Trigger
            className="inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover"
            aria-label="More actions"
          >
            <MoreHoriz width={18} height={18} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end">
              <Menu.Popup>
                <Menu.Item>Re-send welcome email</Menu.Item>
                <Menu.Item>Mark as resigned</Menu.Item>
                <Menu.Separator />
                <Menu.Item className="text-danger data-[highlighted]:bg-danger data-[highlighted]:text-white">
                  Disable user
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {/* metric tiles */}
      <div className="grid grid-cols-3 gap-3">
        <Metric icon={GraduationCap} label="Courses" value="4" />
        <Metric icon={Calendar} label="Joined" value="Jan 2024" />
        <Metric icon={Clock} label="Status" value="Active" />
      </div>

      {/* profile fields */}
      <div>
        <p className="mb-1 font-serif text-xl text-text-primary">Profile</p>
        <div className="divide-y divide-border rounded-lg border border-border bg-surface-elevated px-4">
          <AutoSaveRow label="Full name" initial="Aung Zeya" />
          <AutoSaveRow label="Phone" initial="+95 9 7788 1234" />
          <LockedRow label="Primary email" value="aung.zeya@school.edu" />
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GraduationCap;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-3">
      <div className="mb-1 flex items-center gap-1.5 text-text-muted">
        <Icon width={14} height={14} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="font-serif text-2xl text-text-primary">{value}</p>
    </div>
  );
}

/* ------------------------ Inline edit rows ------------------------ */

function AutoSaveRow({ label, initial }: { label: string; initial: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);

  function commit() {
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="group flex items-center justify-between gap-4 py-3">
      <span className="w-32 shrink-0 text-sm text-text-muted">{label}</span>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="flex-1 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex flex-1 items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
        >
          <span>{value}</span>
          <span className="flex items-center gap-1 text-xs">
            <AnimatePresence>
              {saved && (
                <motion.span
                  variants={savedTick}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex items-center gap-1 text-success"
                >
                  <Check width={13} height={13} /> Saved
                </motion.span>
              )}
            </AnimatePresence>
            <EditPencil
              width={14}
              height={14}
              className="text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
            />
          </span>
        </button>
      )}
    </div>
  );
}

function LockedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="w-32 shrink-0 text-sm text-text-muted">{label}</span>
      <div className="flex flex-1 items-center justify-between px-2.5 py-1.5 text-sm text-text-secondary">
        <span>{value}</span>
        <span className="flex items-center gap-1 text-xs text-text-muted">
          <Lock width={12} height={12} /> Managed elsewhere
        </span>
      </div>
    </div>
  );
}

function ExplicitSaveRow({ label, initial }: { label: string; initial: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [draft, setDraft] = useState(initial);

  return (
    <div className="py-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-text-muted">{label}</span>
        {!editing && (
          <button
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
          >
            <EditPencil width={13} height={13} /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setValue(draft);
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-md px-1 text-sm text-text-primary">{value}</p>
      )}
    </div>
  );
}

function RolesRow() {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-text-muted">Roles &amp; school team</span>
        <span className="flex items-center gap-1 text-xs text-warning-foreground">
          <Lock width={12} height={12} /> Confirm required
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["Student"].map((r) => (
          <span key={r} className="rounded-full bg-surface-active px-2.5 py-0.5 text-xs text-text-primary">
            {r}
          </span>
        ))}
        <button className="rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-xs text-text-muted hover:text-text-primary">
          + Add
        </button>
      </div>
    </div>
  );
}

/* --------------------------- Activity --------------------------- */

const ENTRIES = [
  { who: "Daw Mya", role: "Teacher", type: "Note", color: "var(--data-green)", when: "2h ago", body: "Submitted Quiz 4 — strong work on factoring." },
  { who: "U Hla", role: "Admin", type: "Payment", color: "var(--warning)", when: "Yesterday", body: "March tuition received and verified." },
  { who: "System", role: "", type: "Attendance", color: "var(--circuit-board)", when: "Mon", body: "Checked in to Algebra II at 9:02." },
];

function ActivityPreview() {
  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface-elevated p-5">
      {/* composer */}
      <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2">
        <Plus width={16} height={16} className="text-text-muted" />
        <span className="text-sm text-text-muted">Add an observation about Aung Zeya…</span>
      </div>
      {/* filter chips */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {["All", "Notes", "Payments", "Attendance"].map((c, i) => (
          <span
            key={c}
            className={cn(
              "rounded-full px-2.5 py-1",
              i === 0 ? "bg-accent text-accent-foreground" : "bg-surface-hover text-text-secondary",
            )}
          >
            {c}
          </span>
        ))}
      </div>
      {/* timeline */}
      <div className="space-y-4">
        {ENTRIES.map((e, i) => (
          <div key={i} className="flex gap-3">
            <Avatar name={e.who} className="size-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-text-primary">{e.who}</span>
                {e.role && <span className="text-xs text-text-muted">{e.role}</span>}
                <span
                  className="rounded-full px-2 py-0.5 text-xs text-white"
                  style={{ backgroundColor: e.color }}
                >
                  {e.type}
                </span>
                <span className="ml-auto text-xs text-text-muted">{e.when}</span>
              </div>
              <p className="text-sm text-text-secondary">{e.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

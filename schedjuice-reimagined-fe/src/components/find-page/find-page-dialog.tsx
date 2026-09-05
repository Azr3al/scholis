"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  DURATION,
  findPageExtendTransition,
  transition,
} from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import type { FindPageItem } from "@/config/find-page-items";
import {
  FIND_PAGE_DESC_ID,
  FIND_PAGE_TITLE_ID,
  FindPageIsland,
  FindPageNotchSkirt,
} from "./find-page-island";
import {
  canUseWebGL,
  FindPageMetaball,
  METABALL_DROP,
  METABALL_PAD,
} from "./find-page-metaball";
import { FindPageTipsLink } from "./find-page-tips-link";
import { useFindPage } from "./use-find-page";
import { useFindPageOpenAnimation } from "./use-find-page-open-animation";
import { getFindPageShortcutLabel } from "@/lib/find-page-shortcut-label";
import { useSidebar } from "@/components/shell/sidebar-context";
import { isCourseRecordRoute } from "@/lib/is-course-record-route";
import { isAdmissionsRecordRoute } from "@/lib/is-admissions-record-route";
import { isFinanceRecordRoute } from "@/lib/is-finance-record-route";
import { isStudioRecordRoute } from "@/lib/is-studio-record-route";
import { useGlobalOverlayActive } from "@/lib/ui/global-overlay-registry";

const GROUP_LABEL: Record<FindPageItem["group"], string> = {
  pages: "Pages",
  shortcuts: "Shortcuts",
};

function groupItems(items: FindPageItem[]) {
  const pages = items.filter((i) => i.group === "pages");
  const shortcuts = items.filter((i) => i.group === "shortcuts");
  return { pages, shortcuts };
}

const inkBorder = "border-[color-mix(in_srgb,var(--find-page-ink-text)_12%,transparent)]";
const inkMuted = "text-[var(--find-page-ink-text)]/60";
const inkText = "text-[var(--find-page-ink-text)]";
const inkTextSoft = "text-[var(--find-page-ink-text)]/75";

export function FindPageDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const { recordMode } = useSidebar();
  const overlayActive = useGlobalOverlayActive();
  const hideDock =
    (recordMode &&
      (isCourseRecordRoute(pathname) ||
        isFinanceRecordRoute(pathname) ||
        isStudioRecordRoute(pathname) ||
        isAdmissionsRecordRoute(pathname))) ||
    overlayActive;
  const { open, setOpen, items, panelRect, triggerRef } = useFindPage();
  const reduced = useReducedMotion();
  // Once per session; false during SSR, re-evaluated on client hydration.
  const [webgl] = useState(() => canUseWebGL());
  // No notch to drip from on record routes; reduced motion skips the goo.
  const skip = Boolean(reduced) || hideDock || !webgl;
  const phase = useFindPageOpenAnimation(open, skip);
  const wasOpenRef = useRef(false);
  const dialogBoxRef = useRef<HTMLDivElement>(null);
  const measureDialogHeight = useCallback(
    () => dialogBoxRef.current?.offsetHeight ?? null,
    [],
  );
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");
  // Spotlight-style: the bar opens as just the search input; results extend
  // below it while a query is typed. Cleared on every open.
  const [query, setQuery] = useState("");

  useEffect(() => {
    setShortcutLabel(getFindPageShortcutLabel());
  }, []);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const grouped = useMemo(() => groupItems(items), [items]);

  const onSelect = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen],
  );

  useEffect(() => {
    if (phase !== "open") return;
    const id = requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>("[data-find-page-input]")
        ?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    const id = requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!panelRect) return null;
  if (overlayActive) return null;

  // Mirrors the open island's `min-w-[min(448px,calc(100vw-48px))]`.
  const dialogWidth =
    typeof window === "undefined" ? 448 : Math.min(448, window.innerWidth - 48);

  // While the goo canvas runs, the shader owns the notch silhouette (it sags,
  // stretches and jiggles); the DOM notch goes transparent so only its liquid
  // twin shows, and the label/kbd hide so text doesn't sit on a wobbling blob.
  const liquid = phase === "opening" || phase === "closing";

  const searchContent = (
    <>
      <h2 id={FIND_PAGE_TITLE_ID} className="sr-only">
        Find a page
      </h2>
      <p id={FIND_PAGE_DESC_ID} className="sr-only">
        Search app pages and shortcut tools
      </p>

      <Command
        className={cn("relative z-10 flex flex-col bg-transparent", inkText)}
        filter={(value, search) => {
          if (!search) return 1;
          return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
        }}
      >
        <div className="px-1">
          <Command.Input
            data-find-page-input
            value={query}
            onValueChange={setQuery}
            placeholder="Type to search…"
            className={cn(
              "h-12 w-full bg-transparent text-base outline-none",
              inkText,
              "placeholder:text-[var(--find-page-ink-text)]/50",
            )}
          />
        </div>
        {/* Results extend the bar downward only while typing (Spotlight /
            Dynamic Island); at rest the dialog is just the search input. */}
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{ height: query ? "auto" : 0 }}
          transition={reduced ? { duration: 0 } : findPageExtendTransition}
        >
          <Command.List
            className={cn(
              "max-h-[min(20rem,50vh)] overflow-y-auto border-t p-1",
              inkBorder,
            )}
          >
          <Command.Empty className={cn("py-8 text-center text-sm", inkMuted)}>
            No pages match that search.
          </Command.Empty>

          {(["pages", "shortcuts"] as const).map((groupKey) => {
            const rows =
              groupKey === "pages" ? grouped.pages : grouped.shortcuts;
            if (rows.length === 0) return null;
            return (
              <Command.Group
                key={groupKey}
                heading={
                  <span
                    className={cn(
                      "block px-2 py-1.5 text-xs font-medium tracking-wide",
                      inkMuted,
                    )}
                  >
                    {GROUP_LABEL[groupKey]}
                  </span>
                }
              >
                {rows.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.title} ${item.description ?? ""}`}
                    onSelect={() => onSelect(item.href)}
                    className={cn(
                      "cursor-default rounded-md px-3 py-2.5 outline-none select-none",
                      "data-[selected=true]:bg-[color-mix(in_srgb,var(--find-page-ink-text)_14%,transparent)]",
                      "data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-[color-mix(in_srgb,var(--find-page-ink-text)_22%,transparent)]",
                    )}
                  >
                    <div className={cn("text-base", inkText)}>{item.title}</div>
                    {item.description ? (
                      <div className={cn("mt-0.5 line-clamp-1 text-sm", inkTextSoft)}>
                        {item.description}
                      </div>
                    ) : null}
                  </Command.Item>
                ))}
              </Command.Group>
            );
          })}
          </Command.List>
        </motion.div>
      </Command>
    </>
  );

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="find-page-backdrop"
            // sj-root scopes --terminal; without it the dim resolves to transparent.
            className="sj-root fixed inset-0 z-modal-backdrop bg-[color-mix(in_srgb,var(--terminal)_52%,transparent)]"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={reduced ? { duration: 0 } : transition.crossfade}
            onClick={() => setOpen(false)}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {/* Shoulder grooves only exist while the notch is truly docked — the
            liquid phases melt the notch into a blob these wouldn't fit. */}
        {phase === "idle" && !hideDock ? (
          <motion.div
            key="find-page-skirt"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: DURATION.fast }}
          >
            <FindPageNotchSkirt panelRect={panelRect} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {open || !hideDock ? (
      <div
        className="fixed z-modal-content"
        style={{
          left: panelRect.centerX,
          top: panelRect.top,
        }}
      >
        <AnimatePresence initial={false}>
          {/* Liquid layer — painted below the notch so the DOM notch (text,
              border) stays crisp while the shader's matching ink merges the
              neck into its underside. */}
          {phase === "opening" ? (
            <motion.div
              key="find-page-goo-open"
              className="absolute left-0"
              style={{ x: "-50%", top: -METABALL_PAD }}
              exit={{ opacity: 0, transition: transition.fadeFast }}
            >
              <FindPageMetaball
                mode="open"
                dialogWidth={dialogWidth}
                measureDialogHeight={measureDialogHeight}
              />
            </motion.div>
          ) : null}
          {phase === "closing" ? (
            <motion.div
              key="find-page-goo-close"
              className="absolute left-0"
              style={{ x: "-50%", top: -METABALL_PAD }}
              exit={{ opacity: 0, transition: transition.fadeFast }}
            >
              <FindPageMetaball
                mode="close"
                dialogWidth={dialogWidth}
                measureDialogHeight={measureDialogHeight}
              />
            </motion.div>
          ) : null}

          {phase !== "open" ? (
            <motion.div
              key="find-page-notch"
              className="absolute left-0 top-0"
              style={{ x: "-50%" }}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              // Fades as the bloom hands off to the dialog crossfade.
              exit={{ opacity: 0, transition: transition.fadeFast }}
              transition={reduced ? { duration: 0 } : transition.fadeFast}
            >
              <FindPageIsland
                open={false}
                layout={false}
                className={cn(
                  "transition-colors duration-150",
                  liquid &&
                    "border-transparent bg-transparent shadow-none ring-transparent",
                )}
              >
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={() => setOpen(true)}
                  aria-label={`Find a page (${shortcutLabel})`}
                  className={cn(
                    "group flex h-full min-h-[34px] w-full items-center justify-center",
                    "transition-[min-height] duration-[var(--duration-normal)] ease-[var(--ease-paper)]",
                    !liquid && "hover:min-h-[40px]",
                    "outline-none focus-visible:outline-none",
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-2 transition-opacity duration-150",
                      liquid && "opacity-0",
                    )}
                  >
                    <span className="font-sans text-sm text-[var(--find-page-ink-text)]">
                      find a page
                    </span>
                    <kbd
                      className={cn(
                        "shrink-0 rounded border border-[var(--find-page-ink-border)]",
                        "bg-[color-mix(in_srgb,var(--find-page-ink-text)_10%,transparent)]",
                        "px-1.5 py-0.5 font-sans text-[10px] leading-none",
                        "text-[var(--find-page-ink-text)]/65",
                      )}
                      aria-hidden
                    >
                      {shortcutLabel}
                    </kbd>
                  </span>
                </button>
              </FindPageIsland>
              <div
                className={cn(
                  "absolute left-full top-0 ml-2 flex h-[34px] items-center",
                  "transition-opacity duration-150",
                  liquid && "pointer-events-none opacity-0",
                )}
              >
                <FindPageTipsLink />
              </div>
            </motion.div>
          ) : null}

          {/* Mounted (hidden) from `opening` so the shader can measure its
              height for the bloom target; crossfades in at `open`. */}
          {phase !== "idle" ? (
            <motion.div
              key="find-page-dialog"
              ref={dialogBoxRef}
              className="absolute left-0"
              style={{
                x: "-50%",
                top: METABALL_DROP,
                pointerEvents: phase === "open" ? undefined : "none",
              }}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: phase === "open" ? 1 : 0 }}
              exit={
                reduced
                  ? undefined
                  : { opacity: 0, transition: transition.fadeFast }
              }
              transition={
                reduced
                  ? { duration: 0 }
                  : phase === "open"
                    ? transition.crossfade
                    : transition.fadeFast
              }
            >
              <FindPageIsland open layout={false}>
                <div className="relative flex min-h-0 flex-col">
                  {searchContent}
                </div>
              </FindPageIsland>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      ) : null}
    </>
  );
}

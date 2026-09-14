"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { useHomeMotionVariants } from "@/components/home/home-motion";
import { WorkspaceLogo } from "@/components/workspaces/workspace-logo";
import { useWorkspaces } from "@/components/workspaces/use-workspaces";
import { cn } from "@/lib/utils";

export function WorkspacesStrip() {
  const { crossfade } = useHomeMotionVariants();
  const { workspaces } = useWorkspaces();
  const enterable = workspaces.filter(
    (w) => w.status === "enterable" && w.homeHref,
  );

  return (
    <AnimatePresence initial={false}>
      {enterable.length > 0 ? (
        <motion.section
          key="workspaces"
          className="mt-10 space-y-4 border-t border-rule pt-8"
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
            Workspaces
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {workspaces.map((ws) => {
              const comingSoon = ws.status === "coming_soon";
              const body = (
                <>
                  <WorkspaceLogo
                    name={ws.logo}
                    size={48}
                    aria-hidden
                    className={comingSoon ? "opacity-50" : undefined}
                  />
                  <span
                    className={cn(
                      "w-full truncate text-sm",
                      comingSoon ? "text-text-muted" : "text-text-primary",
                    )}
                  >
                    {ws.label}
                  </span>
                  {comingSoon ? (
                    <span className="text-xs text-text-muted">Coming soon</span>
                  ) : null}
                </>
              );

              if (comingSoon || !ws.homeHref) {
                return (
                  <div
                    key={ws.id}
                    className="flex flex-col items-center gap-2 rounded-lg border border-rule px-3 py-4 text-center opacity-70"
                  >
                    {body}
                  </div>
                );
              }

              return (
                <Link
                  key={ws.id}
                  href={ws.homeHref}
                  className="sj-workspace-tile flex flex-col items-center gap-2 rounded-lg border border-rule px-3 py-4 text-center transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)] hover:border-text-muted"
                >
                  {body}
                </Link>
              );
            })}
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

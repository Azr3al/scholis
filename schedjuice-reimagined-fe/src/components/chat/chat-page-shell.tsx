"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EmptyCopy } from "@/components/primitives/empty/empty-copy";
import { ChatInboxView } from "@/components/chat/chat-inbox-view";
import { dmChatCopy } from "@/messages/dm-chat";
import {
  crossfade,
  crossfadeInstant,
  crossfadeOpacity,
  transition,
} from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

function ChatThreadEmptyPane() {
  const copy = dmChatCopy.selectConversationEmpty;
  return (
    <div className="flex min-h-[min(32rem,70vh)] flex-1 items-center justify-center px-6 py-12">
      <EmptyCopy
        enBefore={copy.enBefore}
        enHighlight={copy.enHighlight}
        enAfter={copy.enAfter}
        myBefore={copy.myBefore}
        myHighlight={copy.myHighlight}
        myAfter={copy.myAfter}
        className="max-w-sm text-center"
      />
    </div>
  );
}

export function ChatPageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const isThreadRoute = pathname.startsWith("/chat/threads/");
  const paneVariants = reducedMotion ? crossfadeInstant : crossfade;
  const threadVariants = reducedMotion ? crossfadeInstant : crossfadeOpacity;

  const activeThreadKey = useMemo(() => {
    if (!isThreadRoute) {
      return "inbox-empty";
    }
    return pathname;
  }, [isThreadRoute, pathname]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <motion.aside
          initial={false}
          animate={{ width: "auto" }}
          transition={transition.panelWipe}
          className={cn(
            "flex min-h-0 min-w-0 flex-col overflow-hidden border-[var(--border-chrome)] bg-surface-sunken lg:border-r",
            isThreadRoute ? "hidden lg:flex" : "flex flex-1 lg:flex-none",
          )}
        >
          <div className="flex h-full min-h-[min(32rem,70vh)] w-full min-w-0 flex-col lg:w-[min(360px,100%)]">
            <ChatInboxView
              onNavigate={(href) => router.push(href)}
              activePathname={pathname}
            />
          </div>
        </motion.aside>

        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-elevated",
            isThreadRoute ? "flex" : "hidden lg:flex",
          )}
          aria-label="Conversation"
        >
          <AnimatePresence mode="wait" initial={false}>
            {isThreadRoute ? (
              <motion.div
                key={activeThreadKey}
                variants={threadVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                {children}
              </motion.div>
            ) : (
              <motion.div
                key="inbox-empty"
                variants={paneVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex min-h-0 flex-1 flex-col"
              >
                <ChatThreadEmptyPane />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

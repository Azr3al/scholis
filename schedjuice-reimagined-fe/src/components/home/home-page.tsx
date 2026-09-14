"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";

import { DatetimeLine } from "@/components/home/datetime-line";
import { EarningsStrip } from "@/components/home/earnings-strip";
import { FactsStrip } from "@/components/home/facts-strip";
import { useHomeMotionVariants } from "@/components/home/home-motion";
import { ScheduleSection } from "@/components/home/schedule-section";
import { WorkspacesStrip } from "@/components/home/workspaces-strip";
import { InkBleedDefs } from "@/components/primitives/decoration/ink-bleed";
import { containsMyanmar } from "@/lib/sj/script";
import { composeGreeting } from "@/lib/home/compose-greeting";
import { composeHomeLede } from "@/lib/home/compose-home-lede";
import { useHomeSchedule } from "@/lib/home/use-home-schedule";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";

function Stop() {
  return <span className="sj-stop">.</span>;
}

export function HomePage() {
  const { user } = useUser();
  const { tenant } = useTenant();
  const { staggerList, staggerItem, crossfade } = useHomeMotionVariants();
  const timeZone = tenant?.timezone ?? "UTC";
  const { sessionCount, isLoading, events, formatClock } = useHomeSchedule();

  const greeting = useMemo(
    () => composeGreeting(user?.name, new Date(), timeZone),
    [user?.name, timeZone],
  );
  const ledeClauses = useMemo(() => {
    if (isLoading) return [];
    return composeHomeLede(sessionCount);
  }, [isLoading, sessionCount]);
  const greetingMyanmar = containsMyanmar(greeting);

  return (
    <div className="sj-root">
      <InkBleedDefs />
      <motion.div variants={staggerList} initial="hidden" animate="show">
        <motion.div variants={staggerItem}>
          <DatetimeLine />
        </motion.div>

        <motion.header variants={staggerItem} className="mt-8">
          <h1
            className={
              greetingMyanmar
                ? "sj-display text-[1.75rem] leading-tight text-text-primary"
                : "font-serif text-[1.75rem] leading-tight text-text-primary"
            }
          >
            {greeting}
            <Stop />
          </h1>
          <AnimatePresence initial={false}>
            {ledeClauses.length > 0 ? (
              <motion.p
                key="home-lede"
                className="sj-lede mt-4 max-w-[36ch] text-base text-text-muted"
                variants={crossfade}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {ledeClauses.map((clause) => (
                  <span key={clause}>{clause}</span>
                ))}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </motion.header>

        <motion.div variants={staggerItem}>
          <ScheduleSection
            events={events}
            isLoading={isLoading}
            formatClock={formatClock}
          />
        </motion.div>

        <motion.div variants={staggerItem}>
          <EarningsStrip />
        </motion.div>

        <motion.div variants={staggerItem}>
          <FactsStrip />
        </motion.div>

        <motion.div variants={staggerItem}>
          <WorkspacesStrip />
        </motion.div>
      </motion.div>
    </div>
  );
}

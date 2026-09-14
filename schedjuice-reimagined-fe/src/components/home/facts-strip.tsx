"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";

import { useHomeMotionVariants } from "@/components/home/home-motion";
import { StatCardsSkeleton } from "@/components/loading/structured-skeletons";
import { permissionsFor } from "@/helpers/authorization";
import { fetchHomeFacts } from "@/lib/home/home-facts-api";
import { useUser } from "@/hooks/useUser";

function FactCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-2xl tabular-nums text-text-primary">
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}

function FactsSkeleton() {
  return (
    <section
      className="mt-10 space-y-6 border-t border-rule pt-8"
      aria-busy="true"
      aria-label="Loading school facts"
    >
      <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
        School facts
      </h2>
      <StatCardsSkeleton count={4} className="grid-cols-2 sm:grid-cols-4" />
    </section>
  );
}

export function FactsStrip() {
  const { crossfade } = useHomeMotionVariants();
  const { user, isOnlyTeacher } = useUser();
  const canView =
    !!user &&
    !isOnlyTeacher &&
    permissionsFor(user).can("user.view_all") &&
    permissionsFor(user).can("course.view_all");

  const factsQuery = useQuery({
    queryKey: ["home-facts"],
    queryFn: fetchHomeFacts,
    enabled: canView,
    staleTime: 60_000,
  });

  if (!canView) return null;

  const data = factsQuery.data;
  const hasRow1 =
    data != null &&
    (data.staff != null ||
      data.students != null ||
      data.courses != null ||
      data.sessions_today != null);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {factsQuery.isLoading ? (
        <motion.div
          key="facts-loading"
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <FactsSkeleton />
        </motion.div>
      ) : factsQuery.isError || !hasRow1 ? null : (
        <motion.section
          key="facts-ready"
          className="mt-10 space-y-6 border-t border-rule pt-8"
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
            School facts
          </h2>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {data!.staff != null ? (
              <FactCell value={data!.staff} label="staff" />
            ) : null}
            {data!.students != null ? (
              <FactCell value={data!.students} label="students" />
            ) : null}
            {data!.courses != null ? (
              <FactCell value={data!.courses} label="courses" />
            ) : null}
            {data!.sessions_today != null ? (
              <FactCell value={data!.sessions_today} label="sessions today" />
            ) : null}
          </div>
          {data!.checked_in_today != null && data!.expected_staff_today != null ? (
            <div className="space-y-1">
              <div className="font-mono text-2xl tabular-nums text-text-primary">
                {data!.checked_in_today} / {data!.expected_staff_today}
              </div>
              <div className="text-xs text-text-muted">checked in today</div>
            </div>
          ) : null}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

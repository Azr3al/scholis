"use client";
import { Suspense } from "react";
import { motion } from "motion/react";
import { usePermissions } from "@/hooks/usePermissions";
import { visibleWidgets } from "./widget-registry";

export function getVisibleWidgetIds(
  canAny: (codes: string[]) => boolean
): string[] {
  return visibleWidgets(canAny).map((w) => w.id);
}

export function HomeDashboard() {
  const { canAny } = usePermissions();
  const widgets = visibleWidgets(canAny);
  return (
    <motion.div
      className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-12"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
    >
      {widgets.map(({ id, Component }) => (
        <motion.div
          key={id}
          className="contents"
          variants={{
            hidden: { opacity: 0, y: 12 },
            show: {
              opacity: 1,
              y: 0,
              transition: { type: "spring", stiffness: 120, damping: 18 },
            },
          }}
        >
          <Suspense fallback={null}>
            <Component />
          </Suspense>
        </motion.div>
      ))}
    </motion.div>
  );
}

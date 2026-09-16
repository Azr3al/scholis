"use client";

import { motion, useReducedMotion } from "motion/react";

import { Skeleton } from "@/components/primitives";
import {
  crossfadeInstant,
  staggerItem,
  staggerList,
} from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

import type { CourseRoleOption } from "./types";
import { roleNeedsSessionSelection } from "./types";

const SENIORITY_LABEL: Record<CourseRoleOption["seniority"], string> = {
  MAIN_TEACHER: "Main teacher",
  ASSISTANT_TEACHER: "Assistant teacher",
  OTHER: "Other",
};

export type CourseRoleStepProps = {
  roles: CourseRoleOption[];
  selectedRoleId: number | null;
  onSelectRole: (role: CourseRoleOption) => void;
  isLoading: boolean;
};

export function CourseRoleStep({
  roles,
  selectedRoleId,
  onSelectRole,
  isLoading,
}: CourseRoleStepProps) {
  const reduced = useReducedMotion();
  const listVariants = reduced ? crossfadeInstant : staggerList;
  const itemVariants = reduced ? crossfadeInstant : staggerItem;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
        No course roles are configured for this school yet. Create one in Course
        roles before assigning teachers.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="font-serif text-lg text-text-primary">Course role</h3>
        <p className="text-sm text-text-secondary">
          Pick how this teacher is assigned to the course.
        </p>
      </div>
      <motion.div
        role="radiogroup"
        aria-label="Course role"
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        variants={listVariants}
        initial="hidden"
        animate="show"
      >
        {roles.map((role) => {
          const selected = role.id === selectedRoleId;
          return (
            <motion.div key={role.id} variants={itemVariants}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelectRole(role)}
                className={cn(
                  "flex min-h-[52px] w-full flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
                  selected
                    ? "border-[var(--action,var(--data-green-strong))] bg-accent"
                    : "border-border bg-surface hover:bg-accent/40",
                )}
              >
                <span className="text-sm text-text-primary">{role.name}</span>
                <span className="text-xs text-text-muted">
                  {SENIORITY_LABEL[role.seniority]}
                </span>
                {role.isSubstitute ? (
                  <span className="mt-1 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                    Substitute
                  </span>
                ) : null}
                {!roleNeedsSessionSelection(role) ? (
                  <span className="text-xs text-text-muted">
                    Course-wide — no sessions to pick
                  </span>
                ) : null}
              </button>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

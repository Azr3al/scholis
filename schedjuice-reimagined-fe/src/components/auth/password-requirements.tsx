"use client";

import {
  evaluatePasswordRequirements,
  PASSWORD_REQUIREMENT_RULES,
} from "@/lib/password-requirements";
import {
  crossfadeInstant,
  revealBar,
  staggerItem,
  staggerList,
} from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { Check } from "iconoir-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type PasswordRequirementsListProps = {
  password: string;
  className?: string;
  /** When true, use motion.ul + motion.li for stagger (client only). */
  animated?: boolean;
};

export function PasswordRequirementsList({
  password,
  className,
  animated = false,
}: PasswordRequirementsListProps) {
  const result = evaluatePasswordRequirements(password);
  const listClassName = cn("flex flex-col gap-1.5 py-1", className);

  const rows = PASSWORD_REQUIREMENT_RULES.map((rule) => {
    const met = result[rule.id];
    const rowClassName = cn(
      "flex items-center gap-2 text-sm transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)]",
      met ? "text-success" : "text-text-secondary",
    );
    const ariaLabel = `${rule.label}: ${met ? "met" : "not met"}`;
    const content = (
      <>
        {met ? (
          <Check width={14} height={14} className="shrink-0" aria-hidden />
        ) : (
          <span
            className="size-3.5 shrink-0 rounded-full border border-current opacity-70"
            aria-hidden
          />
        )}
        <span>{rule.label}</span>
      </>
    );

    if (animated) {
      return (
        <motion.li
          key={rule.id}
          variants={staggerItem}
          className={rowClassName}
          aria-label={ariaLabel}
        >
          {content}
        </motion.li>
      );
    }

    return (
      <li key={rule.id} className={rowClassName} aria-label={ariaLabel}>
        {content}
      </li>
    );
  });

  if (animated) {
    return (
      <motion.ul
        className={listClassName}
        data-password-requirements-list
        variants={staggerList}
        initial="hidden"
        animate="show"
      >
        {rows}
      </motion.ul>
    );
  }

  return (
    <ul className={listClassName} data-password-requirements-list>
      {rows}
    </ul>
  );
}

export type PasswordRequirementsProps = {
  password: string;
  visible: boolean;
  className?: string;
};

export function PasswordRequirements({
  password,
  visible,
  className,
}: PasswordRequirementsProps) {
  const reduced = useReducedMotion();
  const panelVariants = reduced ? crossfadeInstant : revealBar;

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="password-requirements"
          data-password-requirements
          role="status"
          aria-live="polite"
          variants={panelVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className={cn("overflow-hidden", className)}
          // Keep the password field focused when the user clicks the checklist
          // (spec: stay visible if interaction moves into the panel).
          onMouseDown={(e) => e.preventDefault()}
        >
          <PasswordRequirementsList
            password={password}
            animated={!reduced}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

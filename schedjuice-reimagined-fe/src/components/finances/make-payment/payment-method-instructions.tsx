"use client";

import { RoughDivider } from "@/components/primitives/decoration/rough-divider";
import { Button, useToast } from "@/components/primitives";
import { restoreMainContentViewportAnchor } from "@/lib/main-content-scroll";
import { staggerItem, staggerList } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { NavArrowDown, NavArrowUp } from "iconoir-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type PaymentMethodInstruction = {
  id: number;
  name: string;
  payment_bank: string;
  bank_account_number?: string | null;
  description?: string | null;
};

export const MOBILE_PAYMENT_METHODS_INITIAL_VISIBLE_COUNT = 2;

function accountNumberFromDescription(description?: string | null): string | null {
  if (!description?.trim()) return null;
  const digits = description.replace(/\s/g, "");
  if (digits.length >= 6 && /^[\d-]+$/.test(digits.replace(/-/g, ""))) {
    return description.trim();
  }
  return description.trim();
}

export function resolveAccountNumber(method: {
  bank_account_number?: string | null;
  description?: string | null;
}): string | null {
  const fromField = method.bank_account_number?.trim();
  if (fromField) return fromField;
  return accountNumberFromDescription(method.description);
}

function shouldSpanFullWidth(index: number, total: number): boolean {
  return total >= 3 && total % 2 === 1 && index === total - 1;
}

export function getPaymentMethodsForDisplay(
  methods: PaymentMethodInstruction[],
  options: {
    isNarrowViewport: boolean;
    showAll: boolean;
    initialVisibleCount?: number;
  },
): {
  visibleMethods: PaymentMethodInstruction[];
  canExpand: boolean;
  hiddenCount: number;
} {
  const initialVisibleCount =
    options.initialVisibleCount ?? MOBILE_PAYMENT_METHODS_INITIAL_VISIBLE_COUNT;
  const canExpand =
    options.isNarrowViewport && methods.length > initialVisibleCount;

  if (!canExpand || options.showAll) {
    return { visibleMethods: methods, canExpand, hiddenCount: 0 };
  }

  return {
    visibleMethods: methods.slice(0, initialVisibleCount),
    canExpand,
    hiddenCount: methods.length - initialVisibleCount,
  };
}

function useIsNarrowViewport() {
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const onChange = () => {
      setIsNarrowViewport(mql.matches);
    };
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isNarrowViewport;
}

type PaymentMethodInstructionsProps = {
  methods: PaymentMethodInstruction[];
};

export function PaymentMethodInstructions({
  methods,
}: PaymentMethodInstructionsProps) {
  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const isNarrowViewport = useIsNarrowViewport();
  const [showAllMethods, setShowAllMethods] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const expandedAnchorTopRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (showAllMethods) return;
    if (expandedAnchorTopRef.current == null) return;
    if (!sectionRef.current) return;

    restoreMainContentViewportAnchor(
      expandedAnchorTopRef.current,
      sectionRef.current,
    );
    expandedAnchorTopRef.current = null;
  }, [showAllMethods]);

  const handleToggleShowAll = () => {
    if (showAllMethods) {
      setShowAllMethods(false);
      return;
    }

    if (sectionRef.current) {
      expandedAnchorTopRef.current =
        sectionRef.current.getBoundingClientRect().top;
    }
    setShowAllMethods(true);
  };

  if (!methods.length) return null;

  const { visibleMethods, canExpand, hiddenCount } = getPaymentMethodsForDisplay(
    methods,
    { isNarrowViewport, showAll: showAllMethods },
  );

  return (
    <div ref={sectionRef} className="space-y-3">
      <div>
        <p className="font-serif text-xl text-text-primary">
          Transfer to one of these accounts
        </p>
        <p className="mt-1 text-sm text-text-muted">
          Send your payment, then upload a screenshot of the transfer below.
        </p>
      </div>
      <RoughDivider />
      <motion.div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        variants={reducedMotion ? undefined : staggerList}
        initial={reducedMotion ? false : "hidden"}
        animate={reducedMotion ? undefined : "show"}
      >
        {visibleMethods.map((method, index) => {
          const account = resolveAccountNumber(method);
          const description = method.description?.trim() || null;
          const showDescription =
            description != null &&
            description !== account &&
            description !== method.bank_account_number?.trim();

          return (
            <motion.article
              key={method.id}
              variants={reducedMotion ? undefined : staggerItem}
              className={cn(
                "flex min-h-28 flex-col gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-4",
                shouldSpanFullWidth(index, visibleMethods.length) && "sm:col-span-2",
              )}
            >
              <div className="space-y-1">
                <p className="font-serif text-lg text-text-primary">{method.name}</p>
                <p className="text-sm text-text-secondary">{method.payment_bank}</p>
              </div>

              {account ? (
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <p className="font-mono text-base text-text-primary">{account}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(account);
                        toast.add({ description: "Account copied." });
                      } catch {
                        toast.add({ description: "Could not copy account." });
                      }
                    }}
                  >
                    Copy
                  </Button>
                </div>
              ) : (
                <p className="mt-auto text-sm text-text-muted">
                  Account number not available
                </p>
              )}

              {showDescription ? (
                <p className="text-sm text-text-muted">{description}</p>
              ) : null}
            </motion.article>
          );
        })}
      </motion.div>
      {canExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full gap-2 text-text-secondary"
          onClick={handleToggleShowAll}
        >
          {showAllMethods ? (
            <>
              Show fewer accounts
              <NavArrowUp className="size-4" aria-hidden />
            </>
          ) : (
            <>
              Show {hiddenCount} more account{hiddenCount === 1 ? "" : "s"}
              <NavArrowDown className="size-4" aria-hidden />
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}

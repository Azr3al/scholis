# Live password requirement ticks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable live five-rule password checklist (show on focus, DESIGN.md motion) under new-password fields on password reset and student registration, and disable submit until all rules pass and passwords match.

**Architecture:** Pure `evaluatePasswordRequirements` in `src/lib/password-requirements.ts` (bit-identical to `passwordRegex`), presentational `PasswordRequirements` with `revealBar` + `staggerList`/`staggerItem`, then thin wiring on reset + registration (custom AutoForm password `fieldType`).

**Tech Stack:** Next.js App Router, React, Vitest, `motion/react`, `@/lib/sj/motion`, Iconoir, Tailwind semantic tokens (`text-text-secondary`, `text-success`), existing `passwordRegex` in `src/types/user.ts`.

**Spec:** `docs/superpowers/specs/2026-07-10-live-password-requirement-ticks-design.md`

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/password-requirements.ts` | Create | Rule defs + `evaluatePasswordRequirements` |
| `src/lib/password-requirements.test.ts` | Create | Unit tests + parity with `passwordRegex` |
| `src/components/auth/password-requirements.tsx` | Create | `PasswordRequirementsList` (SSR-testable) + motion wrapper |
| `src/components/auth/password-requirements.test.tsx` | Create | `renderToStaticMarkup` tests for met/unmet rows |
| `src/app/(public)/(auth)/reset-password/page.tsx` | Modify | Focus visibility, checklist, disable Submit |
| `src/components/registration/info-step.tsx` | Modify | Custom password field + disable Register |

---

### Task 1: Password requirements helper (TDD)

**Files:**
- Create: `src/lib/password-requirements.ts`
- Test: `src/lib/password-requirements.test.ts`

- [ ] **Step 1: Write the failing unit tests**

```ts
import { describe, expect, it } from "vitest";
import { passwordRegex } from "@/types/user";
import {
  evaluatePasswordRequirements,
  PASSWORD_REQUIREMENT_RULES,
} from "./password-requirements";

describe("PASSWORD_REQUIREMENT_RULES", () => {
  it("exposes five stable rule ids in order", () => {
    expect(PASSWORD_REQUIREMENT_RULES.map((r) => r.id)).toEqual([
      "minLength",
      "number",
      "lowercase",
      "uppercase",
      "special",
    ]);
  });
});

describe("evaluatePasswordRequirements", () => {
  it("marks all unmet for empty string", () => {
    const r = evaluatePasswordRequirements("");
    expect(r).toEqual({
      minLength: false,
      number: false,
      lowercase: false,
      uppercase: false,
      special: false,
      allMet: false,
    });
  });

  it("detects each rule independently", () => {
    expect(evaluatePasswordRequirements("abcdefgh").minLength).toBe(true);
    expect(evaluatePasswordRequirements("1").number).toBe(true);
    expect(evaluatePasswordRequirements("a").lowercase).toBe(true);
    expect(evaluatePasswordRequirements("A").uppercase).toBe(true);
    expect(evaluatePasswordRequirements("#").special).toBe(true);
    expect(evaluatePasswordRequirements("_").special).toBe(false);
  });

  it("sets allMet only when every rule passes", () => {
    const valid = "Abcdef1#";
    const r = evaluatePasswordRequirements(valid);
    expect(r.allMet).toBe(true);
    expect(passwordRegex.test(valid)).toBe(true);
  });

  it("stays in parity with passwordRegex for representative cases", () => {
    const samples = [
      "",
      "short",
      "abcdefgh",
      "Abcdefgh",
      "Abcdefg1",
      "abcdef1#",
      "ABCDEF1#",
      "Abcdef1_",
      "Abcdef1#",
      "Password123$",
    ];
    for (const sample of samples) {
      const { allMet } = evaluatePasswordRequirements(sample);
      expect(allMet).toBe(passwordRegex.test(sample));
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/password-requirements.test.ts
```

Expected: FAIL (module not found / export missing).

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/password-requirements.ts

export const PASSWORD_SPECIAL_CHAR_CLASS = "#?!@$%^&*-";

export type PasswordRequirementId =
  | "minLength"
  | "number"
  | "lowercase"
  | "uppercase"
  | "special";

export type PasswordRequirementRule = {
  id: PasswordRequirementId;
  label: string;
};

export const PASSWORD_REQUIREMENT_RULES: readonly PasswordRequirementRule[] = [
  { id: "minLength", label: "At least 8 characters" },
  { id: "number", label: "Contains a number" },
  { id: "lowercase", label: "One lowercase letter" },
  { id: "uppercase", label: "One uppercase letter" },
  { id: "special", label: "One special character" },
] as const;

export type PasswordRequirementResult = Record<PasswordRequirementId, boolean> & {
  allMet: boolean;
};

const SPECIAL_RE = /[#?!@$%^&*-]/;

export function evaluatePasswordRequirements(
  password: string,
): PasswordRequirementResult {
  const minLength = password.length >= 8;
  const number = /[0-9]/.test(password);
  const lowercase = /[a-z]/.test(password);
  const uppercase = /[A-Z]/.test(password);
  const special = SPECIAL_RE.test(password);
  const allMet = minLength && number && lowercase && uppercase && special;
  return { minLength, number, lowercase, uppercase, special, allMet };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- src/lib/password-requirements.test.ts
```

Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/password-requirements.ts src/lib/password-requirements.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add password requirement evaluator

EOF
)"
```

---

### Task 2: `PasswordRequirements` UI component (TDD)

**Files:**
- Create: `src/components/auth/password-requirements.tsx`
- Test: `src/components/auth/password-requirements.test.tsx`

This package has **no** `@testing-library/react`. Follow the existing pattern in `src/components/auto-form/__tests__/auto-form-skeleton.test.tsx`: `createElement` + `renderToStaticMarkup`. Keep motion in the client wrapper; put SSR-testable markup in a pure `PasswordRequirementsList`.

- [ ] **Step 1: Write the failing list markup tests**

```tsx
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordRequirementsList } from "./password-requirements";

describe("PasswordRequirementsList", () => {
  it("renders five rules and marks only lowercase met for 'a'", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordRequirementsList, { password: "a" }),
    );
    expect(html).toContain("At least 8 characters");
    expect(html).toContain("Contains a number");
    expect(html).toContain("One lowercase letter");
    expect(html).toContain("One uppercase letter");
    expect(html).toContain("One special character");
    expect(html).toContain('aria-label="One lowercase letter: met"');
    expect(html).toContain('aria-label="At least 8 characters: not met"');
    expect(html).toContain("text-success");
    expect(html).toContain("text-text-secondary");
  });

  it("marks all met for a valid password", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordRequirementsList, { password: "Abcdef1#" }),
    );
    for (const label of [
      "At least 8 characters",
      "Contains a number",
      "One lowercase letter",
      "One uppercase letter",
      "One special character",
    ]) {
      expect(html).toContain(`aria-label="${label}: met"`);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- src/components/auth/password-requirements.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement list + motion wrapper**

```tsx
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
  /** When true, wrap rows in motion.li for stagger (client only). */
  animated?: boolean;
};

export function PasswordRequirementsList({
  password,
  className,
  animated = false,
}: PasswordRequirementsListProps) {
  const result = evaluatePasswordRequirements(password);
  const Row = animated ? motion.li : "li";

  return (
    <ul
      className={cn("flex flex-col gap-1.5 py-1", className)}
      data-password-requirements-list
    >
      {PASSWORD_REQUIREMENT_RULES.map((rule) => {
        const met = result[rule.id];
        return (
          <Row
            key={rule.id}
            {...(animated ? { variants: staggerItem } : {})}
            className={cn(
              "flex items-center gap-2 text-sm transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)]",
              met ? "text-success" : "text-text-secondary",
            )}
            aria-label={`${rule.label}: ${met ? "met" : "not met"}`}
          >
            {met ? (
              <Check width={14} height={14} className="shrink-0" aria-hidden />
            ) : (
              <span
                className="size-3.5 shrink-0 rounded-full border border-current opacity-70"
                aria-hidden
              />
            )}
            <span>{rule.label}</span>
          </Row>
        );
      })}
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
        >
          {reduced ? (
            <PasswordRequirementsList password={password} />
          ) : (
            <motion.div
              variants={staggerList}
              initial="hidden"
              animate="show"
            >
              <PasswordRequirementsList password={password} animated />
            </motion.div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

Notes:
- Prefer the empty CSS ring for unmet (avoids Iconoir `Circle` ambiguity); Iconoir `Check` for met.
- Do **not** hand-type Motion durations/easings; only import from `@/lib/sj/motion`.
- If `animated` + `motion.li` typing is awkward, keep a single `PasswordRequirementsList` that always uses plain `<li>` and apply `staggerItem` only on a wrapping `motion.div` per row instead — same visual result.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- src/components/auth/password-requirements.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/password-requirements.tsx src/components/auth/password-requirements.test.tsx
git commit -m "$(cat <<'EOF'
feat(auth): add PasswordRequirements checklist UI

EOF
)"
```

---

### Task 3: Wire password reset page

**Files:**
- Modify: `src/app/(public)/(auth)/reset-password/page.tsx`

- [ ] **Step 1: Add imports, focus state, and derived `canSubmit`**

Replace the current imports/state block so the suspense component has:

```tsx
"use client";

import { makePostRequest } from "@/app/client-api/utils";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { Button, Input, useToast } from "@/components/primitives";
import { logout } from "@/helpers/auth";
import { evaluatePasswordRequirements } from "@/lib/password-requirements";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const PasswordResetSuspence = () => {
  const searchParams = useSearchParams();
  const toast = useToast();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);

  const { allMet } = evaluatePasswordRequirements(password);
  const canSubmit =
    allMet && password.length > 0 && password === confirmPassword;

  // ... mutation unchanged except onSubmit below
```

- [ ] **Step 2: Simplify `onSubmit` and wire the form UI**

```tsx
  const onSubmit = () => {
    if (!canSubmit) return;
    passwordResetMutation.mutate();
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex w-96 flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold text-text-primary">
          Password Reset
        </h1>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary">
              Enter a new password
            </label>
            <Input
              onChange={(e) => setPassword(e.target.value)}
              value={password}
              type="password"
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              autoComplete="new-password"
            />
            <PasswordRequirements
              password={password}
              visible={passwordFocused}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary">
              Confirm your password
            </label>
            <Input
              onChange={(e) => setConfirmPassword(e.target.value)}
              value={confirmPassword}
              type="password"
              autoComplete="new-password"
            />
          </div>
          <Button
            onClick={onSubmit}
            isLoading={passwordResetMutation.isPending}
            disabled={!canSubmit || passwordResetMutation.isPending}
          >
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
};
```

Remove unused `passwordRegex` / `passwordRegexMessage` imports and the strength/mismatch toast branches (disable-gate makes them unreachable). Keep success + API-failure toasts.

- [ ] **Step 3: Manual smoke (local)**

1. Open `/reset-password?token=test` (or any token).
2. Focus new password → checklist appears with motion.
3. Type until all five met; confirm mismatch → Submit still disabled.
4. Match confirm → Submit enabled.
5. Blur new password → checklist exits.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(public\)/\(auth\)/reset-password/page.tsx
git commit -m "$(cat <<'EOF'
feat(auth): live password requirements on reset form

EOF
)"
```

---

### Task 4: Wire student registration info step

**Files:**
- Modify: `src/components/registration/info-step.tsx`

- [ ] **Step 1: Update imports**

Remove `passwordRegexMessage`. Add:

```tsx
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { evaluatePasswordRequirements } from "@/lib/password-requirements";
import { Input } from "@/components/primitives";
import { useMemo, useState } from "react";
```

(`Field` is already imported; keep it.)

- [ ] **Step 2: Watch password fields and derive `canSubmitPassword`**

Inside `RegistrationInfoForm`, after `useForm`:

```tsx
  const [passwordFocused, setPasswordFocused] = useState(false);
  const passwordValue = form.watch("password") ?? "";
  const confirmValue = form.watch("confirm_password") ?? "";
  const passwordReady = useMemo(() => {
    const { allMet } = evaluatePasswordRequirements(passwordValue);
    return allMet && passwordValue === confirmValue && passwordValue.length > 0;
  }, [passwordValue, confirmValue]);
```

- [ ] **Step 3: Replace password `fieldConfig` with a custom `fieldType`**

Replace the `password` entry (remove static description) with a custom control that mirrors `AutoFormTextControl` layout and mounts the checklist under the input:

```tsx
        password: {
          fieldType: ({
            label,
            isRequired,
            fieldProps,
            error,
          }: AutoFormInputComponentProps) => {
            const { value, onChange, onBlur, name, ref, ...rest } = fieldProps;
            return (
              <Field.Root
                className="w-full max-w-xl"
                name={name}
                invalid={Boolean(error)}
              >
                <Field.Label>
                  {label}
                  {!isRequired ? (
                    <span className="text-text-secondary"> (optional)</span>
                  ) : null}
                </Field.Label>
                <Input
                  ref={ref}
                  name={name}
                  value={value ?? ""}
                  onChange={onChange}
                  onBlur={(e) => {
                    onBlur?.(e);
                    setPasswordFocused(false);
                  }}
                  onFocus={() => setPasswordFocused(true)}
                  type="password"
                  autoComplete="new-password"
                  {...rest}
                />
                <PasswordRequirements
                  password={typeof value === "string" ? value : ""}
                  visible={passwordFocused}
                />
                <div className="min-h-5">
                  {error ? (
                    <p className="text-sm text-danger" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              </Field.Root>
            );
          },
        },
        confirm_password: {
          inputProps: {
            type: "password",
            autoComplete: "new-password",
          },
        },
```

Use the same optional-label pattern as AutoForm (`OptionalLabelSuffix`) if importing it is easy; otherwise keep a simple required label without inventing a new “(optional)” suffix for a required password field — password is required, so prefer:

```tsx
                <Field.Label>{label}</Field.Label>
```

and drop the optional suffix entirely for this field.

- [ ] **Step 4: Disable Register until password is ready**

```tsx
      <Button
        isLoading={submitMutation.isPending}
        type="submit"
        className="w-full mt-3"
        disabled={!passwordReady || submitMutation.isPending}
      >
        Register
      </Button>
```

Keep Zod `passwordRegex` + match refine as the final schema gate.

- [ ] **Step 5: Manual smoke**

1. Open student registration → info step.
2. Focus password → quiet checklist; no static long description.
3. Register stays disabled until all five rules + confirm match.
4. Blur password → checklist hides.

- [ ] **Step 6: Commit**

```bash
git add src/components/registration/info-step.tsx
git commit -m "$(cat <<'EOF'
feat(auth): live password requirements on registration

EOF
)"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run unit tests for new files**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/password-requirements.test.ts src/components/auth/password-requirements.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Spec checklist (manual)**

Confirm against the design spec:

- [ ] Shared helper + component exist and are importable
- [ ] Reset: focus show / blur hide / disable Submit / no strength toast
- [ ] Registration: static description removed / checklist on focus / Register disabled until ready
- [ ] Motion uses `@/lib/sj/motion` only; reduced-motion path uses `crossfadeInstant` / no stagger slide
- [ ] Five labels match the spec table exactly

- [ ] **Step 3: Commit any leftover fixes** (only if Step 2 found issues)

```bash
git add -A
git status
# commit only if there are intentional fixes
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Pure evaluator bit-identical to `passwordRegex` | Task 1 |
| Quiet checklist UI + Iconoir + a11y labels | Task 2 |
| `revealBar` + stagger + reduced motion | Task 2 |
| Reset wiring, disable Submit, drop strength toast | Task 3 |
| Registration replace static description + disable Register | Task 4 |
| Unit + light component tests | Tasks 1–2, 5 |
| Backend reset validation | Out of scope (spec §8) |
| Match as sixth checklist row | Out of scope (locked decision) |

## Placeholder / consistency check

- No TBD steps; helper path locked to `src/lib/password-requirements.ts`.
- Types: `PasswordRequirementId`, `evaluatePasswordRequirements`, `PasswordRequirements` props used consistently across tasks.
- Special set `#?!@$%^&*-` matches `passwordRegex` in `src/types/user.ts`.

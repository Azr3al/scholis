# Live password requirement ticks — Design Spec

> Add a reusable live checklist under “new password” fields so users see which strength rules are met as they type, instead of discovering failures only after submit.

**Status:** Draft (awaiting user review)
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — tokens, type-led layout, motion §12 (`revealBar`, `staggerList`/`staggerItem`, `useReducedMotion`)
**Date:** 2026-07-10

---

## 1. Problem

Password reset (`src/app/(public)/(auth)/reset-password/page.tsx`) and student registration (`src/components/registration/info-step.tsx`) enforce the same frontend rule via `passwordRegex` / `passwordRegexMessage` in `src/types/user.ts`:

- at least 8 characters
- one number
- one lowercase letter
- one uppercase letter
- one special character from `#?!@$%^&*-`

Today, reset only surfaces failures as a toast after Submit. Registration shows the full message as a **static** field description. Neither gives per-rule live feedback, so users guess which rule failed.

---

## 2. Goals

1. **Live per-rule ticks** under the new-password field for the five strength rules above.
2. **Reusable** shared helper + UI so any future password-create surface can adopt the same checklist.
3. **Show on focus** of the new-password field, with DESIGN.md motion entrance/exit.
4. **Disable Submit** until all five rules pass **and** password === confirm password.
5. Keep `passwordRegex` as the canonical submit/Zod gate; the checklist is a breakdown of that same rule set.

### Non-goals

- Backend `validate_password` on the password-reset endpoint (known gap; out of scope).
- A sixth “passwords match” row in the checklist (mismatch stays submit-time / disable-gate only).
- Strength meter / score / entropy UI.
- Changing the special-character set or minimum length.
- Settings “change password” email flow (no password fields on that pane).

---

## 3. Locked decisions (brainstorming)

| Topic | Decision |
| --- | --- |
| Scope | Shared component for **anywhere** a password is created/changed (ship first on reset + registration) |
| Visibility | Show when new-password field is **focused**; hide on blur (unless focus moves into the checklist) |
| Motion | Animated entry/exit via `@/lib/sj/motion` only — `revealBar` for panel, `staggerList`/`staggerItem` for rows; `useReducedMotion()` → opacity-only / no slide |
| Match row | **Not** in checklist — only the five strength rules |
| Submit | **Disabled** until all five rules pass **and** passwords match |
| Visual | **Quiet checklist** — muted unmet rows, green check when met, no bordered card, no pill chips |
| Approach | Pure `evaluatePasswordRequirements` helper + presentational `PasswordRequirements` component |

---

## 4. Architecture

```
password string
    → evaluatePasswordRequirements(password)
    → { minLength, number, lowercase, uppercase, special, allMet }
    → PasswordRequirements (visible when focused)
    → consumers: reset page, registration info step
    → canSubmit = allMet && password === confirmPassword
```

### 4.1 Pure helper

- Location: **`src/lib/password-requirements.ts`** (UI/Zod stay decoupled from the rule breakdown).
- Export:
  - `PASSWORD_REQUIREMENT_RULES` — stable `id` + user-facing `label` for the five rows
  - `evaluatePasswordRequirements(password: string)` returning per-rule booleans + `allMet`
- Rules must stay **bit-identical** to `passwordRegex` (same length, same character classes, same special set). Add a unit assertion that every `allMet` password also matches `passwordRegex`, and vice versa for representative cases.
- Keep exporting `passwordRegex` / `passwordRegexMessage` from `src/types/user.ts` for Zod and any remaining copy needs; do not fork a second regex for submit.

### 4.2 `PasswordRequirements` component

- Props: `password: string`, `visible: boolean` (controlled by consumer focus state).
- Renders five rows: empty circle (unmet) / check (met), muted vs success text color via semantic tokens (`text-text-secondary` / success token already used in the app).
- Icons: Iconoir (consistent with DESIGN.md), not emoji.
- Motion:
  - Panel: `AnimatePresence` + `revealBar` (or reduced-motion opacity variant)
  - Rows: `staggerList` / `staggerItem` on enter
  - Met/unmet icon/color: CSS transition with `--duration-fast` / `--ease-quiet` — no layout shift
- A11y: region with `aria-live="polite"`; each row’s state available as text (e.g. “met” / “not met”), not color alone.

### 4.3 Consumers

**Password reset** (`reset-password/page.tsx`):

- Track focus on the new-password `Input`.
- Render `PasswordRequirements` directly under that field.
- `canSubmit = allMet && password === confirmPassword`.
- Disable Submit when `!canSubmit || mutation.isPending`.
- Remove the unreachable “Password does not meet requirements” toast path once disable-gate is in place; keep API-failure and success toasts. Mismatch toast becomes unreachable while disabled — optional to keep as a defensive guard.

**Registration** (`info-step.tsx`):

- Remove static `description: passwordRegexMessage` on the password field.
- Watch RHF password value; attach `onFocus` / `onBlur` via password `inputProps` (and checklist `onMouseDown`/`tabIndex` pattern so blur-into-checklist does not hide it).
- Prefer rendering `PasswordRequirements` in the info-step layout **adjacent to** the password field (e.g. after AutoForm or via a thin field slot) without rewriting AutoForm internals. If AutoForm cannot host it cleanly, a small optional `fieldAddon` / post-field render prop is acceptable — do not duplicate the whole form.
- Disable the step’s continue/submit when password rules fail or confirm does not match (in addition to existing Zod validation).

---

## 5. UI copy (exact rows)

| Rule id | Label |
| --- | --- |
| `minLength` | At least 8 characters |
| `number` | Contains a number |
| `lowercase` | One lowercase letter |
| `uppercase` | One uppercase letter |
| `special` | One special character |

Special characters remain those in `passwordRegex`: `#?!@$%^&*-`.

Visual: quiet vertical list, no “Requirements” header box, no chips.

---

## 6. Error handling & edge cases

| Case | Behavior |
| --- | --- |
| Empty password, field focused | Checklist visible; all five unmet |
| Blur to confirm field | Checklist hides (animated exit) |
| Focus moves into checklist | Stay visible |
| Partial password | Only matching rows met |
| Valid password, confirm empty/mismatch | Checklist all met; Submit still disabled |
| `prefers-reduced-motion` | Opacity-only show/hide; no stagger slide |
| Future password field | Import helper + component; same focus + disable pattern |

---

## 7. Testing

1. **Unit:** `evaluatePasswordRequirements` — empty; each rule alone; full valid string; special chars outside the allowed set do not satisfy `special`.
2. **Component (light):** given `"a"`, only lowercase met; given a string matching `passwordRegex`, `allMet` true and UI shows five checks.
3. **Manual:** reset + registration — focus/blur animation, Submit enable/disable, reduced-motion if easy to toggle.

No backend test changes for this feature.

---

## 8. Out of scope / follow-ups (explicit)

- Enforce Django `validate_password` (or the same frontend regex) on `PasswordResetView`.
- Align backend registration validators with the stricter frontend special-character set if they diverge.
- Admin/account create flows that later add password fields should reuse this component.

---

## 9. Success criteria

- On password reset and registration, focusing the new-password field reveals a quiet five-row checklist with motion from `motion.ts`.
- Rows update live as the user types; Submit stays disabled until all rules pass and confirm matches.
- No new toast for unmet strength rules on reset (gate prevents submit).
- Helper + component are importable for future password surfaces without copy-paste.

# UI token migration policy (R1)

## Authority

[`DESIGN.md`](../DESIGN.md) is the single visual authority.

## Legacy aliases

| Legacy class | DESIGN.md target | Owner |
| --- | --- | --- |
| `text-muted-foreground` | `text-text-muted` | R1 CSS bridge |
| `bg-background` | `bg-surface` | R1 CSS bridge |
| `bg-card` | `bg-surface-elevated` | R1 CSS bridge |
| `bg-destructive` / `text-destructive` | `bg-danger` / `text-danger` | R1 CSS bridge |

Full map: `src/lib/sj/legacy-token-aliases.ts`.

**Gate:** `npm run check:legacy-tokens` — total usage must not increase vs `docs/legacy-token-baseline.json`.

Canonical DESIGN.md tokens (`border-border`, `bg-accent`, `text-accent-foreground`, `ring-ring`, …) are **not** legacy and are excluded from the gate.

### Baseline ratchet

After a migration PR removes legacy usages, ratchet the baseline down:

```bash
npm run check:legacy-tokens -- --update-baseline
```

`--update-baseline` only accepts **monotonic decreases** (per-file and total). It rejects any increase.

To create the baseline file for the first time (intentional, not CI):

```bash
npm run check:legacy-tokens -- --write-baseline
```

CI / `verify-all.sh` require an existing baseline; a missing file fails with exit 1.

## `.sj-content-reset` staged removal

1. Route cohort migrates page to `.sj-root` tokens (no reset wrapper).
2. Remove `sj-content-reset` class from that route's shell insertion point.
3. Regenerate `docs/sj-content-reset-inventory.json`.
4. When inventory lists only `globals.css` definition → schedule CSS deletion in Phase N plan (not R1).

**R1 forbids** deleting the CSS block or shell wrappers.

## Theme convergence

| Layer | Canonical (R1) | Retired when |
| --- | --- | --- |
| `html[data-theme]` + cookie | `applyTheme` in `src/lib/sj/theme.ts` | Never |
| `.dark` on `<html>` | `next-themes` via `use-unified-theme.ts` | Zero `.sj-content-reset` consumers + grep `from "next-themes"` only in bridge files |

New code must not import `useTheme` from `next-themes`.

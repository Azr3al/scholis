# Overlay and portal stack (R2)

Source: `src/lib/ui/overlay-layers.ts`

| Layer | Class | Value |
| --- | --- | --- |
| base | `z-base` | 0 |
| sticky | `z-sticky` | 10 |
| navigation | `z-navigation` | 20 |
| dropdown | `z-dropdown` | 50 |
| banner | `z-banner` | 100 |
| modalBackdrop | `z-modal-backdrop` | 200 |
| modalContent | `z-modal-content` | 210 |
| modalDropdown | `z-modal-dropdown` | 220 |
| toast | `z-toast` | 300 |
| emergency | `z-emergency` | 400 |

## Rules

- Primitives own layer values via `src/lib/ui/overlay-classnames.ts`.
- Consumers must not use ad-hoc z-index utilities (numeric/calc/var bracket forms, or invalid utilities like `z-400`).
- Hidden decorative layers use `pointer-events-none`; interactive children opt in with `pointer-events-auto`.
- Modal content must exceed banner (`210 > 100`).
- Modal dropdowns (select/combobox/popover inside dialog/sheet) must exceed modal content (`220 > 210`).
- Toasts must exceed modal content (`300 > 210`).

## Documented exceptions

- `src/components/find-page/find-page-island.tsx` — `z-[49]` fillet grooves (non-interactive)
- `src/components/primitives/toast.tsx` — `z-[calc(1000-var(--toast-index))]` for intra-viewport toast stacking (each toast offsets within the viewport; base `1000` stays above `z-toast` / `300`)
- `src/components/editor/math-equation-dialog.tsx` — MathLive keyboard uses `OVERLAY_LAYERS.emergency` via inline `--keyboard-zindex` (third-party DOM; not a Tailwind utility)

## Verification

`npm run check:overlay-z-index`

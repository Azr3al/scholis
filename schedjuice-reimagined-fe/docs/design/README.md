# Design documentation index

**Principles and voice:** [`DESIGN.md`](../../DESIGN.md) at the repository root.

This folder holds **UI contracts** (enforceable patterns) and **case studies** (reference implementations). Token values, theme runtime, and motion constants live in code — not here.

## Source of truth (code)

| Concern | Location |
| --- | --- |
| Token hex + AA tests | [`src/lib/sj/palette.ts`](../../src/lib/sj/palette.ts) |
| CSS variables + Tailwind theme | [`src/app/globals.css`](../../src/app/globals.css) |
| Theme persistence / FOUC | [`src/lib/sj/theme.ts`](../../src/lib/sj/theme.ts), [`src/lib/theme-inline-script.ts`](../../src/lib/theme-inline-script.ts) |
| Motion tokens + recipes | [`src/lib/sj/motion.ts`](../../src/lib/sj/motion.ts) |
| UI sounds | [`src/lib/sound/click-sound.ts`](../../src/lib/sound/click-sound.ts), [`src/lib/sound/sound-preference.ts`](../../src/lib/sound/sound-preference.ts) |
| Primitives | [`src/components/primitives/`](../../src/components/primitives/) |
| Legacy token gate | `pnpm run check:legacy-tokens` — see [`docs/UI_TOKEN_MIGRATION.md`](../UI_TOKEN_MIGRATION.md) |

## Living gallery

Superadmin routes under `/components`: [gallery](../../src/app/(design)/components/page.tsx), [type](../../src/app/(design)/components/type/page.tsx), [color](../../src/app/(design)/components/color/page.tsx), [bilingual stress test](../../src/app/(design)/components/bilingual/page.tsx).

## UI contracts

| Contract | Use when |
| --- | --- |
| [page-composition](./ui-contracts/page-composition.md) | PageContainer, PageHeader, three-zone layout |
| [entity-title-chrome](./ui-contracts/entity-title-chrome.md) | Inline entity titles + sticky title bars |
| [table-column-sizing](./ui-contracts/table-column-sizing.md) | ResourceTable column roles |
| [form-control-sizing](./ui-contracts/form-control-sizing.md) | FieldMeasure, ControlSize, reserved feedback |
| [motion](./ui-contracts/motion.md) | Durations, recipes, dialogs vs inline, sound |

## Case studies

| Study | Pattern |
| --- | --- |
| [DVR preview field presence](./case-studies/dvr-preview-field-presence.md) | `listItemPresence` for catalog↔preview toggles |
| [Collapse scroll anchor](./case-studies/collapse-scroll-anchor.md) | Viewport anchor restore in `#main-content` |

## Agent entry

Read [`DESIGN.md`](../../DESIGN.md) before substantive UI work. Run [`docs/VERIFICATION.md`](../VERIFICATION.md) gates before marking UI tasks done.

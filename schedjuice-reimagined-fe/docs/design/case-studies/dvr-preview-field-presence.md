# Case study: DVR create — preview field enter/exit

**Surface:** Create Data Verification Request — field catalog toggles which fields appear in the live preview (`DvrVerifyForm` `mode="preview"`).

**Problem:** Checking/unchecking a field mounted/unmounted preview controls instantly. The list jumped; catalog↔preview relationship was hard to feel.

**Pattern:** Treat each included field as a keyed presence item, not a full-form remount.

1. Keep the preview form mounted while the included set changes (so the last field can finish its exit).
2. Wrap the field list in `<AnimatePresence mode="popLayout" initial={false}>`.
3. Key each row by stable field id (`communication_email`, custom `field_key`, …).
4. Wrap each row in `motion.div` with **`listItemPresence`** (or `resolveListItemPresence`) and `layout` when motion is allowed.
5. Gate with `useReducedMotion()` — opacity-only via `listItemPresenceReduced`; no `y` slide, no `layout`.

**Do:** animate only `opacity` + small `y` (≤8px); exit slightly faster than enter; scope motion to preview mode only.

**Don't:** hand-type durations; remount the whole form on last deselect; use blur/heavy scale; stagger every toggle.

**Reference:** [`src/components/dvr/dvr-verify-form.tsx`](../../../src/components/dvr/dvr-verify-form.tsx) (`DvrPreviewFieldMotion`), recipe in [`src/lib/sj/motion.ts`](../../../src/lib/sj/motion.ts).

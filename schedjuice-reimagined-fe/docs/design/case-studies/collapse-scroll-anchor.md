# Case study: Collapsible content in `#main-content` — scroll anchor on collapse

**Surface:** Student checkout — payment-method instructions (`PaymentMethodInstructions` on `/finances/make-payment`).

**Problem:** On mobile, “Show more accounts” expands a tall list inside the app shell scroll container (`#main-content`, not `window`). Collapsing removes height while `scrollTop` stays unchanged — the browser clamps scroll and the viewport **jumps to the bottom** (screenshot upload / submit).

**Avoid:**

- Collapsing in-flow content taller than ~one viewport without restoring scroll when the scroll root is `#main-content`.
- Assuming `window.scrollTo` fixes it.
- Scrolling to `scrollTop = 0` on collapse — overshoots; users lose their place above the section.

**Pattern:** **Viewport anchor restoration**

1. **On expand** — capture the section root's `getBoundingClientRect().top`.
2. **On collapse** — after React commits shorter DOM (`useLayoutEffect`), scroll `#main-content` by `currentTop - savedTop`.
3. **Motion** — `behavior: "smooth"` unless `prefers-reduced-motion: reduce` (then `"auto"`).
4. **Helpers** — `computeScrollDeltaToRestoreViewportAnchor` + `restoreMainContentViewportAnchor` in [`src/lib/main-content-scroll.ts`](../../../src/lib/main-content-scroll.ts).

**Do:** scope anchor capture to expand only; clear saved anchor after one restore; use `useLayoutEffect`; test at 390px with 4+ items.

**Don't:** restore on initial mount or wide viewports where collapse is unavailable; animate height without anchor restore.

**Reference:** [`src/components/finances/make-payment/payment-method-instructions.tsx`](../../../src/components/finances/make-payment/payment-method-instructions.tsx)

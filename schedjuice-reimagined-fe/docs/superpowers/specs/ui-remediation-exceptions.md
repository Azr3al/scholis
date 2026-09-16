# UI remediation exceptions

This registry contains narrow, evidence-backed exceptions to `DESIGN.md` and the UI remediation contracts. An exception is not permission to expand legacy usage.

Each entry must name the consumer, temporary dependency or violated contract, reason, containment, removal owner, and verification method. A worker must stop and obtain plan-owner approval before adding an unplanned exception.

No exceptions are approved at R1 foundation completion.

## R14 coverage-review bare table

- Consumer: `src/app/(internal)/finances/student-payments/coverage-review/page.tsx`
- Temporary dependency: `@/app/_chrome/table`
- Reason: the page needs semantic native table markup; R3 contracts cover TanStack `ResourceTable` and do not provide a standalone bare-table primitive.
- Containment: the route supplies DESIGN.md text/surface classes and an explicit horizontal-overflow wrapper; no new `_chrome/table` consumers are allowed.
- Removal owner: the first plan that introduces a DESIGN.md standalone bare-table primitive.
- Verification: R14 manual QA plus the R1 legacy-import inventory.

## Award template student preview dialog

- Consumer: `src/components/template-editor/award-preview-dialog.tsx`
- Temporary dependency: `@/components/primitives` `Dialog` (DESIGN.md prefers non-dialog flows)
- Reason: a rare Finder-style course-then-student preview needs a focused overlay over the editor; the product owner approved this exception.
- Containment: this one award-editor dialog only. Certificates and ID-card editors must not add Preview dialogs from this exception.
- Removal owner: a later plan that moves award preview to a dedicated route or pasteboard pane.
- Verification: unit tests in `award-preview-dialog.test.tsx` plus manual Preview → course → student flip.

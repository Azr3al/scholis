# UI Migration Remediation Program — Design Specification

**Date:** 2026-07-12  
**Status:** Approved design; implementation plans ready for review  
**Repository:** `schedjuice-reimagined-fe`  
**Planning baseline:** `05ac447b` on `dev`  
**Design authority:** [`DESIGN.md`](../../../DESIGN.md), with explicit evidence-backed workflow exceptions  
**Predecessors:**
- [`2026-07-09-design-md-chrome-migration-program-design.md`](2026-07-09-design-md-chrome-migration-program-design.md)
- [`2026-07-09-data-table-auto-form-program-design.md`](2026-07-09-data-table-auto-form-program-design.md)

---

## 1. Summary

Repair the UI regressions introduced by the July 9–10 DESIGN.md chrome, data-table, AutoForm, and package-removal migrations. The remediation is a gated, system-first program followed by exhaustive route-family repair cohorts and independent QA.

The program addresses systemic causes before page-level symptoms:

1. Establish a clean verification baseline and browser QA harness.
2. Converge the split design authority, token vocabulary, and theme runtime.
3. Define enforceable overlay, layout, table, form, and page-composition contracts.
4. Assign every product route to exactly one implementation and manual-QA cohort.
5. Give finance and student-payments smaller serialized plans because they combine high-consequence workflows with high-conflict files.
6. Close only after the complete route manifest, automated gates, representative browser matrix, and independent QA pass against the final merged SHA.

This is not a rollback. The pre-migration UI is historical evidence for preserved behavior, not the target visual system.

---

## 2. Evidence and problem statement

The migration was unusually broad and compressed:

- The coordinated migration range changed **1,042 files**, adding approximately 29,855 lines and deleting approximately 32,883 lines.
- Chrome Waves 0–4, table Waves T0–T4, AutoForm Waves F0–F3, and package cleanup PN0–PN5 landed between July 9 evening and July 10 early morning.
- PN5 deleted `src/components/ui/**`; a 205-file build-repair commit followed less than two hours later.
- July 10–12 contains repeated reactive fixes for Field composition, token contrast, table overflow, select stacking, column widths, input widths, student-payments view behavior, and Glide scrolling.

The repository currently shows four cross-cutting failure classes:

### 2.1 Split UI runtime

- `DESIGN.md` defines the warm `.sj-root` system.
- `.sj-content-reset` restores legacy shadcn-era tokens and typography inside the new shell.
- Product code uses both `text-text-muted` / `bg-surface` and `text-muted-foreground` / `bg-card`.
- `docs/AGENT_UI_SYSTEM.md` still describes shadcn and Lucide despite their removal.
- Both cookie/`data-theme` and `next-themes` paths remain active.

### 2.2 Undefined overlay stack

- Dialog, Popover, Combobox, Menu, Tooltip, Select, calendar popovers, banners, shell chrome, global find, toast, and application portals use unrelated z-index values.
- `Select` uses `z-400`, while intentional arbitrary values elsewhere use bracket syntax such as `z-[400]`.
- Invisible panels have previously intercepted pointer events.
- No automated browser test verifies stacking, clipping, focus, or clickability.

### 2.3 Missing sizing and layout contracts

- `ResourceTable` columns have no minimum, preferred, maximum, wrapping, or content-role metadata.
- Editable cells can shrink to `min-w-0`; payment-specific fixes added local width floors after regressions.
- AutoForm applies `max-w-xl` to every mapped control regardless of page context.
- Select, Selector, and Combobox use different fixed defaults.
- Page containers, titles, section spacing, and dashboard compositions vary by route family.

### 2.4 Verification cannot currently gate UI work

At the planning baseline (2026-07-12):

- Full Vitest run: **7 failing files**, 226 passing; 6 failed tests, 1,243 passing.
- `tsc --noEmit`: existing type errors in tests.
- There is no `typecheck` script.
- There is no maintained E2E or visual-regression suite.
- Existing tests mostly validate pure helpers and class strings, not browser geometry.
- Previous migration plans depended on limited manual light/dark smoke checks.

These failures make isolated page fixes unsafe: a subagent can pass its targeted test while breaking another overlay, token context, route role, or viewport.

---

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Coverage | Every product route is assigned to an implementation and manual-QA cohort. |
| Structure | System-first remediation, then exhaustive route-family cohorts. |
| Verification gate | Repair test/typecheck baseline and add browser QA before UI repair waves. |
| Design authority | `DESIGN.md` by default; documented evidence-backed workflow exceptions are allowed. |
| Persona coverage | Targeted admin, teacher, student, and principal matrix by relevant route family. |
| Browser automation | Automate known-broken, high-risk, and representative routes; manually check remaining inventoried routes. |
| Mockups | Lofi text only when needed; no browser-based visual companion flow. |
| Rollback | No broad migration rollback. Use pre-migration behavior only as evidence. |
| Parallelism | Only disjoint file ownership sets may execute concurrently. |
| QA independence | QA subagents verify and report; they do not patch failures. |
| Finance | Shared finance shells and student-payments paths are serialized around overlapping files. |

---

## 4. Goals

1. Remove systemic causes of z-index, clipping, pointer-event, alignment, width, density, and theme inconsistencies.
2. Preserve product behavior while making layout and visual hierarchy conform to `DESIGN.md`.
3. Make UI contracts explicit enough that separate implementation agents cannot invent local substitutes.
4. Give every product route an owner, risk tier, persona, fixture, verification method, and completion state.
5. Make the repository’s full verification baseline clean before route repair begins.
6. Add a small, stable browser suite for high-value geometry and interaction checks.
7. Produce self-contained plans executable by fresh subagents without access to the audit conversation.
8. Require independent, evidence-backed QA before a cohort is complete.

---

## 5. Non-goals

- Reverting the application to the pre-July design system.
- Rewriting backend APIs or business rules solely to simplify UI verification.
- Redesigning successful workflows without evidence of a usability or consistency problem.
- Replacing Glide where spreadsheet-class interaction is still justified.
- Pixel-snapshotting every route, role, theme, and viewport combination.
- Fixing unrelated product features discovered during route inspection.
- Letting route cohorts redefine shared primitives or design contracts locally.
- Treating subjective aesthetic preference alone as a defect.

---

## 6. Program architecture

```text
R0 Verification baseline
   ↓
R1 UI authority + token/theme convergence
   ├── R2 Overlay/portal stack
   ├── R3 Table sizing/layout contracts
   ├── R4 Form/control sizing contracts
   └── R5 Page shell/header/composition standards
              ↓
R6–R14 Route-family implementation cohorts
              ↓
R15 Independent manual-QA cohorts
              ↓
R16 Final integration and manifest closure
```

### 6.1 Gating

- R0 is blocking for every implementation wave.
- R1 is blocking for R2–R5.
- R2–R5 may overlap only where their exact owned files are disjoint.
- Route cohorts start only after their required shared contracts have merged.
- A shared-contract regression stops every dependent cohort.
- A route-local regression returns only to that route cohort.
- Final QA runs against the final integrated SHA, not separate branch SHAs.

### 6.2 Base drift

Every plan records the SHA it was written against. Before execution, the worker compares that SHA with its branch base:

- Documentation-only or unrelated drift: continue after confirming owned files are unchanged.
- Owned shared-file drift: stop and request a refreshed plan.
- Route-local drift: re-read the current route, update evidence, and report whether the plan remains valid before editing.

---

## 7. Route manifest

The route manifest is the program control plane. It must contain every product `page.tsx` route and exclude only explicitly documented design, debug, artifact, or dead routes.

Each entry records:

- route pattern and concrete fixture URL;
- route family and implementation plan;
- implementation owner and independent QA owner;
- relevant personas and required permissions;
- required data/fixture setup;
- primary theme and viewport;
- whether mobile, dark, or alternate-role layout materially differs;
- shared primitives and contracts exercised;
- risk tier and rationale;
- automated, representative, or manual verification mode;
- implementation status, QA status, defect references, and evidence location.

Dynamic routes cannot be marked complete without a usable fixture URL. Missing auth, permissions, or test data is a blocker to report, not a reason to skip the route.

### 7.1 Proposed route families

1. Global shell, authentication, public pages, global find, notifications, and app-wide overlays.
2. Home, dashboards, analytics, and reporting.
3. Administration CRUD: lists, details, create, edit, and settings.
4. Courses, attendance, scheduling, rosters, grading, and record-body routes.
5. Quizzes, docs, announcements, certificates, content, and service routes.
6. Finance and operational routes outside student payments.
7. Student-payments shared shell and filters.
8. Student-payments ResourceTable path.
9. Student-payments Glide path.
10. Payment upload and verification workflows.

The implementation plan may split a family further when file ownership or risk requires it, but every route remains assigned exactly once.

---

## 8. Shared contracts

### 8.1 Design authority and exceptions

- `DESIGN.md` is the single visual authority.
- `README.md`, `AGENTS.md`, and any surviving UI guide point to it without contradictory component guidance.
- Stale references to shadcn, Radix, Lucide, `components/ui`, or retired tokens are removed or clearly marked historical.
- An exception must record:
  - affected route/component;
  - conflicting DESIGN.md rule;
  - workflow evidence;
  - narrowly scoped alternative;
  - owner;
  - review or expiry condition.

### 8.2 Theme and token contract

- Product UI uses one semantic token vocabulary under `.sj-root`.
- `.sj-content-reset` is removed through a measured migration, not deleted before its consumers are converted.
- Legacy token aliases may exist only as temporary migration mappings with tracked consumers.
- Raw palette utilities and component hex values remain banned.
- A static gate prevents new legacy token classes in product code.
- Theme runtime converges on the documented cookie/`data-theme` path; `next-themes` is removed only after all consumers are proven independent.

### 8.3 Overlay and portal contract

Define named layers for:

1. base content;
2. sticky in-flow content;
3. application navigation;
4. dropdowns, selects, comboboxes, tooltips, and popovers;
5. persistent banners;
6. modal backdrop and modal content;
7. toasts;
8. documented emergency surfaces.

Rules:

- Primitives own overlay layer values.
- Consumers do not invent numeric z-index classes.
- Nested overlays follow a documented portal destination and stacking rule.
- Hidden panels must not intercept pointer events.
- Scroll containers must not clip portaled content.
- Modal content must remain above its backdrop and banners.
- Focus containment, escape behavior, and click-outside behavior are verified in a browser.

### 8.4 Page layout contract

- Page width, horizontal inset, top/bottom spacing, and fullscreen behavior come from shared layout helpers.
- One page-title component implements the DESIGN.md serif page-title scale.
- Route-family headers share action alignment, wrapping, and mobile behavior.
- Dense operational routes may use full-width exceptions.
- Exceptions cannot silently reimplement container padding or title scale.

### 8.5 Form and control sizing contract

- Standalone form controls default to the available width inside a deliberate field measure.
- Compact widths are opt-in for toolbars and table cells.
- AutoForm field width is contextual; it does not impose one global `max-w-xl` cap.
- Select, Selector, Combobox, DatePicker, and custom field controls share sizing terminology.
- Labels, descriptions, errors, loading indicators, and saved feedback reserve space where mounting would cause layout shift.
- Component identity remains stable so typing does not remount or unfocus controls.

### 8.6 Table contract

Column definitions support semantic metadata:

- content role;
- minimum width;
- preferred width;
- optional maximum width;
- wrapping/truncation policy;
- alignment;
- editable-control type;
- sticky behavior when justified.

Rules:

- Horizontal scrolling occurs before controls or meaningful text shrink below minimums.
- Numeric, status, action, identifier, person, date, and prose columns receive appropriate defaults.
- Editable controls use consistent vertical alignment and reserve save/error feedback space.
- Row height remains at least the DESIGN.md table minimum unless a documented dense-grid exception applies.
- `ResourceTable` and Glide remain separate interaction classes; shared visual constants do not imply identical behavior.

### 8.7 Composition contract

Every route-family plan identifies:

- the dominant region;
- the supporting region;
- the quiet region;
- primary action;
- secondary actions;
- expected empty/loading/error states.

Nested card stacks, arbitrary icon decoration, competing accents, and decorative controls without workflow meaning are defects. Composition QA uses explicit hierarchy, spacing, alignment, overflow, token, and interaction criteria rather than “looks better” alone.

---

## 9. Verification foundation

R0 must establish working commands for:

1. lint;
2. typecheck;
3. unit tests;
4. production build;
5. authenticated browser tests.

### 9.1 Baseline policy

- Existing failures are repaired before UI waves begin. Environment-dependent tests must be made deterministic; they cannot be skipped or excluded.
- Later plans cannot weaken assertions, exclude failing files, or redefine expected output to manufacture a green baseline.
- If a configured command is obsolete, R0 replaces it with the supported equivalent and updates contributor documentation.

### 9.2 Browser test scope

Automate:

- every known-broken route;
- every high-risk route;
- one representative route per route family;
- one representative for each shared overlay, table, form, and shell pattern.

The automated set uses relevant role, viewport, and theme combinations. Remaining routes receive structured manual verification.

### 9.3 Browser assertions

Where relevant, assert:

- no unintended document-level horizontal overflow;
- popup/listbox geometry relative to its trigger;
- overlays are visible, unclipped, and clickable;
- dialogs remain above banners and trap focus;
- controls meet declared sizing contracts;
- tables scroll before columns violate minimums;
- sticky elements stay inside intended containers;
- loading, save feedback, and mode switches do not cause layout jumps;
- light and dark semantic tokens remain coherent.

### 9.4 Screenshot policy

- Screenshots are required for automated/high-risk routes and UI-changing PRs.
- Passing low-risk manual routes do not require screenshots.
- Any manual defect report includes screenshot or DOM evidence.
- Dynamic regions are stabilized or masked; broad snapshot updates require review.

---

## 10. Independent subagent execution

Each implementation plan is self-contained and includes:

- goal and user impact;
- base SHA and dependencies;
- exact owned files and routes;
- explicitly forbidden files and adjacent work;
- current-state excerpts and evidence;
- contract references;
- ordered implementation steps;
- test-first steps for pure helpers and contract logic;
- exact verification commands and expected results;
- manual checks and screenshot requirements;
- stop conditions and escape hatches;
- commit/PR boundaries;
- independent QA handoff prompt.

### 10.1 Parallelism

Subagents may execute concurrently only when file ownership sets are disjoint. Shared primitive, shell, route-manifest, and finance composition files have one owner at a time.

### 10.2 Independent QA

QA subagents receive:

- acceptance criteria;
- route and fixture list;
- role/permission requirements;
- viewport/theme requirements;
- verification commands;
- expected artifacts.

They do not receive implementation reasoning and do not patch failures. They return pass/fail evidence and identify the likely owning plan.

### 10.3 Failure report

Every failure report includes:

- route;
- role;
- viewport;
- theme;
- reproduction steps;
- screenshot or DOM evidence;
- expected and actual result;
- suspected shared or route-local owner;
- whether the failure blocks one cohort or all dependent cohorts.

---

## 11. Plan portfolio

The implementation-planning stage produces a master orchestration plan and these worker plans:

1. **R0 — Verification baseline and browser harness**
2. **R1 — Design authority, token vocabulary, and theme convergence**
3. **R2 — Overlay, portal, stacking, focus, and hit-testing contracts**
4. **R3 — ResourceTable column sizing, overflow, editor, and alignment contracts**
5. **R4 — Form, Select, Combobox, DatePicker, and AutoForm sizing contracts**
6. **R5 — Page container, header, spacing, and composition standards**
7. **R6 — Global shell, auth, public, and global-interaction routes**
8. **R7 — Home, dashboard, analytics, and reporting routes**
9. **R8 — Administration list/detail/create/edit/settings routes**
10. **R9 — Courses, attendance, scheduling, grading, and record-body routes**
11. **R10 — Quizzes, docs, announcements, certificates, content, and services**
12. **R11 — Finance shared shells and non-payment operations**
13. **R12 — Student-payments ResourceTable path**
14. **R13 — Student-payments Glide path and scroll/preview behavior**
15. **R14 — Payment upload and verification workflows**
16. **R15 — Independent manual-QA cohorts split by route family**
17. **R16 — Final integration, representative browser matrix, and manifest closure**

The writing-plans stage may split R8–R11 further when a route family cannot be given a disjoint, reviewable file inventory. It must not combine R12–R14 around shared finance files without explicit serialization.

---

## 12. Prioritization

Highest leverage:

1. R0 verification foundation.
2. R1 token/theme convergence and authoritative guidance.
3. R2 overlay stack.
4. R3/R4 sizing contracts.
5. R5 page composition.
6. High-risk finance plans.
7. Remaining exhaustive route cohorts.

Highest-confidence initial defects:

- fragmented overlay levels and likely invalid `z-400`;
- table overflow and missing column sizing metadata;
- AutoForm/global control width caps;
- split `.sj-root` / `.sj-content-reset` visual runtime;
- stale UI instructions;
- list/detail/page-title inconsistency;
- student-payments ResourceTable/Glide divergence and scroll/width regressions.

---

## 13. Risks and mitigations

### Risk: foundational changes create another large blast radius

Mitigation: contract tests and representative browser coverage land in R0 before shared changes; shared waves remain small and sequential.

### Risk: exhaustive route coverage becomes superficial

Mitigation: every route has a manifest entry and manual QA owner; high-risk and representative patterns receive deeper automation.

### Risk: browser tests become flaky because of backend data

Mitigation: use stable test fixtures, deterministic selectors, geometry assertions, and masked dynamic content. Missing fixtures block the relevant route rather than encouraging retries or arbitrary waits.

### Risk: role matrix multiplies work without value

Mitigation: roles are required only where permissions or content materially change layout.

### Risk: DESIGN.md conflicts with a proven operational workflow

Mitigation: allow narrow evidence-backed exceptions with owners and review conditions.

### Risk: route cohorts patch shared primitives locally

Mitigation: hard forbidden-file lists, static gates, independent QA, and escalation to the shared-contract owner.

### Risk: finance subagents conflict

Mitigation: serialize shared shell ownership; separate ResourceTable, Glide, upload, and QA plans.

### Risk: old migration plans are treated as current truth

Mitigation: use them as intent and historical evidence only; every worker re-reads current code at its pinned SHA.

---

## 14. Completion criteria

The program is complete only when:

1. Lint, typecheck, unit tests, production build, and browser suite pass from one documented command set.
2. Every product route appears exactly once in the manifest.
3. Every route has passed its required automated or manual verification.
4. Every relevant route family has independent QA evidence.
5. No unresolved blocking shared-contract defect remains.
6. Overlay primitives use the named stacking contract; undocumented consumer z-index overrides are gone.
7. Legacy token/runtime usage is removed or represented by an explicit tracked exception.
8. Table and form controls conform to sizing contracts without unintended overflow or crushing.
9. Page containers, headers, and composition follow shared standards or documented exceptions.
10. High-risk finance workflows pass their complete interaction and role checks.
11. Final representative browser checks and the full verification baseline pass against the final integrated SHA.

---

## 15. Approach record

Three structures were considered:

1. **Chosen:** system-first remediation followed by exhaustive route cohorts.
2. Rejected: route-family vertical slices from the start, because shared primitive and token fixes would be duplicated and conflict.
3. Rejected: broad migration rollback and selective reapplication, because it would revive deleted stacks and discard valid work.

The approved verification model inventories and manually checks every route while concentrating automated browser and screenshot coverage on known-broken, high-risk, and representative routes.

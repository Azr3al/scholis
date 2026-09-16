# Fullscreen Sheet Workspace

**Date:** 2026-06-11
**Status:** Approved design
**Scope:** `schedjuice-reimagined-fe` internal app layout and grid-heavy fullscreen pages, starting with Import review.

## Problem

The app already has a fullscreen toggle, but today's fullscreen behavior only
widens page content. The sidebar, topbar, and other app chrome remain visible,
so dense grid pages still feel like regular app pages with more width rather
than focused spreadsheet workspaces.

The Import review step is the immediate target. It uses Glide Data Grid and
needs a Google Sheets-like mode where users can review many rows, resolve
course links, and run the import with as much useful screen space as possible.

## Decisions

| Question | Decision |
|---|---|
| Eligibility | Explicit page/step opt-in |
| Initial target | Import review step only |
| Fullscreen type | App layout fullscreen, not browser fullscreen |
| Visual direction | Compact Sheet Shell |
| Exit control | Small floating corner button |
| Topbar button | Hidden unless the active page/step opts in |

## Goals

- Hide the app sidebar, topbar, and normal page framing in fullscreen.
- Make eligible grid pages feel like a spreadsheet workspace.
- Keep fullscreen unavailable on ordinary pages.
- Preserve normal page layouts outside fullscreen.
- Reuse existing page state and actions instead of creating a separate workflow.

## Non-Goals

- Do not request real browser fullscreen through the Fullscreen API.
- Do not make fullscreen automatic for every page that renders a Glide grid.
- Do not redesign the entire Import wizard.
- Do not make all list/table pages fullscreen-capable in this first pass.

## Architecture

Fullscreen becomes a page capability, not a global topbar affordance. The
internal layout owns the shared fullscreen state and chrome visibility, while
eligible pages register whether fullscreen is available for their current state.

Suggested structure:

```tsx
<FullscreenProvider>
  <SidebarProvider>
    {!effectiveFullscreen && <AppSidebar />}
    <SidebarInset>
      {!effectiveFullscreen && <AppTopbar />}
      {children}
    </SidebarInset>
    {!effectiveFullscreen && <ChatArea />}
  </SidebarProvider>
</FullscreenProvider>
```

`effectiveFullscreen` is true only when both conditions are true:

1. The URL/app state says fullscreen is active.
2. The current page/step has explicitly enabled fullscreen.

If either condition is false, the normal app shell renders.

## Fullscreen Capability

Add a small client-side capability API under the internal app layout. A page can
register whether fullscreen is available and optionally provide metadata for the
topbar button or fullscreen shell.

The API should support:

- `isFullscreen`: current requested fullscreen state.
- `effectiveFullscreen`: requested fullscreen and currently allowed.
- `isFullscreenAvailable`: whether the active page/step opts in.
- `toggleFullscreen()`: toggles requested fullscreen only when available.
- `exitFullscreen()`: clears requested fullscreen.
- `setFullscreenAvailability(config)`: page-level registration.

The existing `isFullscreen` URL query param can remain as the requested state.
Keeping it avoids unnecessary churn and preserves existing links during the
transition.

## Route And State Guardrails

Fullscreen must not leak between pages or steps.

- `AppTopbar` renders the fullscreen button only when
  `isFullscreenAvailable` is true.
- If a user navigates to a route that does not register fullscreen availability,
  `effectiveFullscreen` becomes false.
- If a page changes state and no longer allows fullscreen, such as Import
  leaving the review step, fullscreen exits or is ignored immediately.
- Manually opening an ineligible page with `?isFullscreen=true` must not hide
  the app chrome.
- The provider should clear stale requested fullscreen on route changes or when
  availability becomes false, so the URL reflects the visible state.

## Compact Sheet Shell

Eligible fullscreen pages render a `SheetFullscreenShell` instead of their
normal page container. This shell fills the viewport inside the app root and
uses sheet-like density rather than app-page spacing.

The shell includes:

- A slim top sheet bar for page context, summary metrics, and primary actions.
- An optional secondary control row for sheet controls such as course scope,
  filters, unresolved counts, or view settings.
- A main workspace region sized to the viewport.
- Optional right-side integrated panels separated by borders instead of card
  shadows.
- A small floating `Exit fullscreen` button in a corner.

The visual language should be quiet and spreadsheet-like: white/zinc surfaces,
1px borders, compact rows, minimal shadows, no decorative gradients, and no
emoji. Data density should increase, but touch targets and readable text sizes
must remain usable.

## Import Review Behavior

The Import page only enables fullscreen when `step === "review"` and the import
has not completed.

Normal mode stays close to today's layout:

- `AcademicPageHeader`
- import summary and `Import` action
- welcome-email toggle
- duplicate email panel if needed
- course scope bar
- grid and right-side resolution panels
- link notice and course picker popover

Fullscreen mode reorganizes the same state and actions:

- Top sheet bar:
  - `Import` label
  - row summary, new/update/enrollment counts, validation state
  - welcome-email control when applicable
  - primary `Import` action
- Secondary control row:
  - course scope controls
  - unresolved course progress
  - duplicate-resolution status when relevant
- Main workspace:
  - Glide Data Grid fills the remaining width and height.
  - right-side validation and needs-attention panels stay visible when useful.
  - popovers and notices anchor to the sheet workspace, not the hidden app
    topbar.

When the import succeeds, fullscreen availability turns off and the page returns
to the normal success state.

## Component Boundaries

The implementation should keep responsibilities small:

- `FullscreenProvider`: shared requested state, availability registration,
  route cleanup, and derived `effectiveFullscreen`.
- `useFullscreen`: public hook for state and actions.
- `FullscreenToggle`: topbar button hidden unless fullscreen is available.
- `FullscreenExitButton`: floating exit control rendered only in fullscreen.
- `SheetFullscreenShell`: reusable layout for grid-heavy fullscreen pages.
- Import review layout components:
  - normal review layout
  - fullscreen review layout
  - shared hooks or props for review data/actions

The Import review should avoid duplicating business logic. The normal and
fullscreen renderers should receive the same computed props and callbacks.

## Data Flow

The existing Import store remains the source of truth for parse data, mappings,
resolution state, welcome email preference, validation errors, and commit
actions.

Page flow:

1. Import page reads `step`.
2. Review step computes grid data, panels, validation, and actions.
3. Review step registers fullscreen availability while review mode is active.
4. Review step checks `effectiveFullscreen`.
5. It renders either the normal layout or `SheetFullscreenShell` with the same
   data and callbacks.

## Responsive Behavior

Fullscreen is primarily a desktop productivity mode, but it must not break on
smaller screens.

- On desktop, use a grid workspace with the Glide grid and right-side panels.
- On tablet and smaller widths, allow the side panels to collapse below,
  become drawers, or be hidden behind compact controls during implementation.
- Avoid horizontal page overflow. The grid can scroll internally, but the app
  shell should not create a second horizontal scroll surface.
- Use `min-h-[100dvh]` for viewport-height fullscreen areas.

## Accessibility

- The topbar fullscreen button must have clear labels for enter and exit.
- The floating exit button must be keyboard-focusable and have visible focus.
- When app chrome is hidden, skip links should not point to hidden content.
- Route or step changes that exit fullscreen should not trap focus in removed
  controls.
- The compact shell should keep sufficient contrast and readable text sizes.

## Error Handling

- If fullscreen is requested while unavailable, ignore the request and clear the
  stale query state.
- If Import data is missing or the user returns to upload/map steps, exit
  fullscreen.
- If validation prevents import, keep the user in fullscreen and expose the
  validation message in the sheet bar or right-side panel.
- If the import succeeds, leave fullscreen and show the normal success state.

## Testing

Unit-level tests should cover pure fullscreen state behavior:

- fullscreen button hidden when no page opts in.
- requested fullscreen ignored on ineligible pages.
- route change clears or disables fullscreen.
- step change from Import review to upload/map/success exits fullscreen.
- Import review registers fullscreen only while the grid is visible.

Manual visual checks:

- Import upload and map steps do not show the fullscreen button.
- Import review shows the fullscreen button.
- Entering fullscreen hides sidebar, topbar, and normal page frame.
- The Compact Sheet Shell uses the full viewport and the grid height is stable.
- The floating exit button restores the normal app shell.
- Smaller viewport widths do not create app-level horizontal overflow.

## Rejected Alternatives

### Automatic Glide Detection

Automatically enabling fullscreen whenever a Glide Data Grid appears would be
convenient, but it is too implicit. Some pages may use a grid inside a normal
workflow and should not gain a global fullscreen affordance.

### Central Route Allowlist Only

A route allowlist is easy to inspect, but it cannot express step-level state
cleanly. Import needs fullscreen only during review, not during upload or
mapping.

### Browser Fullscreen API

Browser fullscreen adds permission prompts, Escape-key behavior, and edge cases
around browser chrome. The desired behavior is an app workspace mode, so URL/app
state is enough.

### Grid-First Floating UI

A pure grid canvas gives the most space, but important import controls and
resolution panels would need floating UI. That increases complexity and can
obscure cells.

## Rollout

1. Build the shared fullscreen capability and shell behavior.
2. Update `AppTopbar` to hide the fullscreen button unless eligible.
3. Hide app chrome when `effectiveFullscreen` is active.
4. Implement Import review as the first `SheetFullscreenShell` page.
5. Validate the behavior manually and with focused state tests.
6. Add future grid-heavy pages only by explicit page/step opt-in.

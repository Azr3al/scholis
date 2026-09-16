# Page Composition Contract

All product routes use `PageContainer` for width, horizontal inset, and vertical
spacing. In-flow page titles use `PageHeader` and `PageTitle`. Record routes
that already register shell chrome through `usePageHeader` do not add a
duplicate in-flow title.

## Route-family presets

| Route family | Width | Density | Dominant region |
| --- | --- | --- | --- |
| Admin CRUD list | `wide` | `comfortable` | Table or list |
| Admin CRUD create/edit | `narrow` | `comfortable` | Form |
| Admin CRUD detail | `default` | `comfortable` | Record body |
| Dashboard and analytics | `wide` | `comfortable` | Primary chart or table |
| Finance operations | `full` | `dense` | Operational table or grid |
| Course/org record body | `default` | `comfortable` | Active record section |

Use `routeFamilyPageWidth()` to obtain these presets. Route code must not
reimplement container padding, maximum width, or title scale.

## Header ownership

List, create, edit, dashboard, and standalone detail routes render an in-flow
`PageHeader`. `PageHeader` owns the page-level heading, optional description,
optional eyebrow, and action alignment.

Course and organization record routes register context in the shell with
`usePageHeader`. Their page body starts with the active record section and does
not render another H1.

`PageTitle` is the only in-flow page-title implementation. It uses the
DESIGN.md serif `text-3xl` scale and never applies uppercase transformation.

## Three-zone composition

Each route identifies:

1. **Dominant region:** the main table, form, chart, or record section.
2. **Supporting region:** filters, explanatory context, or actions that help
   operate the dominant region.
3. **Quiet region:** back navigation, metadata, or low-priority status.

Use `PageSection dominant` for the dominant in-flow region. Supporting and
quiet regions may use normal semantic elements with a descriptive `data-slot`.
Do not wrap all three regions in competing cards.

## Dense exception

`density="dense"` is reserved for finance and other proven operational
workflows that need more visible rows or controls. Dense pages still use
`PageContainer width="full"` and shared inset rules. They must not replace the
container with local padding wrappers.

R11–R14 own finance exceptions. A route cohort must document the workflow
evidence before introducing another dense family.

## Responsive behavior

PageHeader actions wrap below the title on narrow viewports and align at the
end from the `sm` breakpoint. Titles and descriptions remain readable without
horizontal document overflow. Full-width operational content may scroll inside
its own region.

## Route-cohort migration

R5 migrates only `/campuses`, `/programs`, and `/subjects/create` as
representatives. R8–R11 own exhaustive route-family migration. Each cohort
extends the static migrated-route gate and records its dominant, supporting,
and quiet regions.

## QA checklist

- Exactly one page-level H1 is present.
- The title uses serif `text-3xl`.
- Actions wrap on mobile and align at the end on desktop.
- Container width and density match the route-family preset.
- The dominant region is visually primary.
- Supporting and quiet regions do not compete with the dominant region.
- No nested decorative card stack replaces hierarchy.
- No unintended document-level horizontal overflow occurs.

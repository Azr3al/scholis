# Teams Payment Assignment Indicator — Design Spec

**Date:** 2026-07-23  
**Status:** Approved for planning  
**Surface:** Student payments report — course summary strip (Glide grid **and** original ResourceTable)  
**Related:** Removed in `3f62bccb` (T3 student-payments migration, PR #402); backend endpoint unchanged

## Summary

Restore the **Teams payment assignment** status indicator for Microsoft-enabled tenants when a course is selected on the student payments report. The indicator shows whether the Teams payment assignment for the **selected course + calendar month** exists, is expected but missing, not yet due, or not applicable.

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Placement | **Course summary strip** (`PaymentGridSummaryStrip`), under course meta (month type / duration) |
| Scope | Course-level (one line per course context), not a table column |
| Views | Both Glide grid and ResourceTable (shared strip component) |
| Gating | `tenant.is_microsoft_on === true`, valid course id in context, not global transaction lookup |
| API | Existing `GET courses/:id/payment-assignment-month-status?year=&month=` |
| Backend | No changes for v1 |
| RBAC | Keep endpoint `payroll.view_all`; finance role has it; teachers without payroll permission will not see the indicator |

## Goals / non-goals

**Goals**

- Finance staff on MS-linked tenants can see at a glance whether the Teams payment hand-in assignment was created for the month they are reviewing.  
- Indicator updates when course or month filter changes.  
- Match pre-migration label copy and status semantics.

**Non-goals**

- Per-student row indicator  
- Creating or fixing assignments from the UI (management commands remain)  
- Widening RBAC to teachers in v1  
- Embedding status in `admin-report` response (future option if extra request is undesirable)

## Architecture

```
StudentPaymentsReportShell / StudentPaymentsGrid
        │
        └─ PaymentGridSummaryStrip (courseContext present)
              └─ CourseMetaInline
              └─ TeamsPaymentAssignmentStatusLine (new)
                    │
                    └─ usePaymentAssignmentMonthStatus(courseId, monthDate)
                          └─ GET courses/:id/payment-assignment-month-status
```

Backend helper `get_payment_assignment_month_status` (unchanged) returns:

| `status` | Meaning |
|----------|---------|
| `created` | `PaymentAssignment` row exists for course + month |
| `expected_but_missing` | Precheck passes but no assignment row |
| `skipped` | Month outside assignment window (ended before month, not started, first month) |
| `not_applicable` | Category ineligible, no Teams group, payment disabled, etc. |

### Lofi — summary strip with indicator

```
┌─ IGCSE Physics · View course ────────────────────────┐
│ Jan 2026 – Jun 2026                                   │
│ Month type FM · Duration 6 mo · 3rd month             │
│ Teams payment: CREATED                                │
└───────────────────────────────────────────────────────┘
  [ Total ] [ Unuploaded ] [ Uploaded ] [ Verified ] …
```

When `expected_but_missing`, use amber/warning text. Other statuses use muted foreground.

## Components & files

| File | Change |
|------|--------|
| `src/lib/finances/teams-payment-assignment-status.ts` | Label helper + `shouldShowTeamsPaymentAssignmentStatus` predicate |
| `src/lib/finances/teams-payment-assignment-status.test.ts` | Unit tests for labels and predicate |
| `src/hooks/finances/use-payment-assignment-month-status.ts` | React Query hook wrapping GET endpoint |
| `src/components/finances/payments-grid/teams-payment-assignment-status-line.tsx` | Loading / error / label render |
| `src/components/finances/payments-grid/payment-grid-summary-strip.tsx` | Render status line under `CourseMetaInline` when course context exists |
| `src/components/finances/student-payments-report.tsx` | Keep `PaymentAssignmentMonthUiStatus` enum (already present) |

## Data flow

1. `PaymentGridSummaryStrip` resolves `courseContext` (same as today: `fixedCourseId + courseMeta` or selected course from combobox).  
2. When `courseContext.id` is set, render `TeamsPaymentAssignmentStatusLine` with `courseId` and `monthAnchor`.  
3. Hook enabled when `shouldShowTeamsPaymentAssignmentStatus({ isMicrosoftOn, courseId })` is true.  
4. Query key: `["payment-assignment-month-status", courseId, year, month]`.  
5. On month/course change, query refetches automatically.

## Status labels (restore prior copy)

| API `status` | UI text |
|--------------|---------|
| `created` | Teams payment: **CREATED** |
| `expected_but_missing` | Teams payment: **EXPECTED BUT MISSING** |
| `skipped` | Teams payment: **NOT YET** |
| `not_applicable` | Teams payment hand-in does not apply to this class. |
| unknown | Could not determine Teams payment hand-in status. |

## Error handling

- **Loading:** small skeleton (`h-4`, ~max-w-md) under course meta  
- **Error:** `Could not load Teams payment hand-in status.` — destructive text, non-blocking; table still usable  
- **MS off / no course / txn lookup:** render nothing (no skeleton, no error)

## Testing

High-value only:

1. **Labels:** all four enum values map to expected strings; unknown status gets fallback.  
2. **Predicate:** `shouldShowTeamsPaymentAssignmentStatus` false when MS off, empty course id, invalid id; true when MS on + valid course id.

No backend changes; no E2E required for v1.

## Out of scope

- RBAC change to `payment.view_all`  
- Indicator on recent-transactions variant without course context  
- Link to MS Teams assignment or management-command trigger from UI

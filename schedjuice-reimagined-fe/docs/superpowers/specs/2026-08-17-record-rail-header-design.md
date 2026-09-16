# Record rail headers and title ownership — Design Spec

> Every context rail has an always-visible back link plus compact identity. Workspace back goes to school Home. The record name appears once, as the page H1. Panel breadcrumbs are Parent / Section only.

**Status:** Design approved, implemented on `feat/record-rail-headers`.
**Authority:** [`DESIGN.md`](../../../DESIGN.md). Amends record-mode nav (`2026-06-22-record-mode-global-nav-design.md`) Path A breadcrumb (drop the entity name). Amends Workspaces (`2026-08-17-workspaces-design.md`): compact logos allowed in the Studio/Finance context rail.
**Date:** 2026-08-17
**Repo:** `schedjuice-reimagined-fe` (no backend)

---

## 1. Problem

Workspace rails (Studio, Finance) hide back on home and have no identity, so the beige header band is empty. Course (and other) records repeat the name in the rail, the panel breadcrumb, and the content H1.

## 2. Locked decisions

1. Workspace back (including home): `← Home` → `/`. Copy **Home**.
2. Do **not** change `FINANCE_CONTEXT_PARENT` (`Overview`, `/finances`) or `STUDIO_CONTEXT_PARENT` (`Documents`, `/studio`). The icon rail uses `contextRail.parent.href` for the active workspace icon.
3. Entity rails keep list parents: Users, Academic Hub, School settings / Organizations.
4. Back is always visible.
5. Compact identity under back: one truncated line plus optional subtitle. No subject chips in the course rail.
6. Workspace identity: `WorkspaceLogo` size 32, `pointer-events-none`, plus **Studio** / **Finance**.
7. Canonical full name is the content H1 (course identity strip, org overview heading, user profile header).
8. Breadcrumb is **Parent / Section** with serif on the section. No record name. Studio panel title is **Documents** (rail owns Studio).
9. Finance breadcrumb stays section-based. Do not add Home into finance or studio breadcrumbs.
10. Burmese-safe: no `uppercase` CSS on new labels, no exclamation marks.

## 3. Surfaces

| Rail | Back | Identity |
| --- | --- | --- |
| Studio / Finance | Home `/` | Logo + workspace name |
| Course | Academic Hub `/courses` | Truncated title + optional code |
| User | Users `/users` | Avatar + name |
| Org | School settings or Organizations | Logo + name |

## 4. Files

- `src/components/shell/record-rail-header.tsx`
- `src/components/shell/record-parent-section-breadcrumb.tsx`
- `src/config/school-home.ts`
- Rails under `src/components/{studio,finances,course,org,record}/`
- Page headers: course, org, user, studio library

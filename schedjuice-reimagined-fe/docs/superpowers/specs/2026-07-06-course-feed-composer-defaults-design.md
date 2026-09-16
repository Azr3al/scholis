# Course Feed Composer — Daily Lesson Default & Unit Label

> Make daily lesson the default post type in the course feed composer and add a visible label for the finished-unit field.

**Status:** Design approved (brainstorming 2026-07-06).
**Related:**
- [2026-06-28-course-feed-composer-ui-design.md](./2026-06-28-course-feed-composer-ui-design.md) — original composer UI spec

---

## 1. Context

Teachers use the course feed composer (`course-feed-composer.tsx`) on Course Overview to post daily lessons and announcements. The composer currently defaults to **Announcement**, but daily lessons are the more common post type.

The daily lesson header uses an inline pattern — `Unit [number] complete` — with no visible field label. Teachers report the unit number input is hard to notice (it reads like static text on the feed card).

---

## 2. Goals

1. **Daily lesson as default** — new posts in create mode start as `daily_lesson`, not `announcement`.
2. **Visible unit label** — add a caption above the inline header so teachers can see which field to fill in.

## 3. Non-Goals

- Changing feed card display (cards keep showing `Unit N complete` without a label)
- Reordering the post-type dropdown menu
- Changing the collapsed composer placeholder text
- Backend or API changes

---

## 4. Locked Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Default post type (create mode) | `daily_lesson` |
| 2 | Default post type after reset/cancel | `daily_lesson` |
| 3 | Edit mode default | Unchanged — use `initialPost.post_type` |
| 4 | Unit label style | Caption above inline header (Option A) |
| 5 | Unit label copy | `"Finished unit"` |
| 6 | Caption styling | `text-xs text-muted-foreground mb-1` |
| 7 | Inline header pattern | Unchanged — `Unit [N] complete` |

---

## 5. Default Post Type

### 5.1 Changes

In `schedjuice-reimagined-fe/src/components/course/feed/course-feed-composer.tsx`:

**Form `defaultValues`:**
```tsx
post_type: initialPost?.post_type ?? "daily_lesson",
```

**`resetComposer`:**
```tsx
post_type: "daily_lesson",
```

### 5.2 Behavior

| Scenario | Expected type |
| --- | --- |
| Expand composer (create) | Daily lesson |
| After successful post | Daily lesson (via reset) |
| After cancel | Daily lesson (via reset) |
| Edit existing announcement | Announcement (from `initialPost`) |
| Edit existing daily lesson | Daily lesson (from `initialPost`) |
| Switch type via footer menu | Selected type (unchanged behavior) |

### 5.3 Focus

No focus changes required. When type is `daily_lesson`, `DailyLessonUnitHeader` already receives `autoFocus={watchedPostType === "daily_lesson"}`, so the unit number field is focused on expand.

Body placeholder defaults to `"What did the class cover?"`.

---

## 6. Unit Field Label

### 6.1 Layout

Update `schedjuice-reimagined-fe/src/components/course/feed/daily-lesson-unit-header.tsx`:

```
Finished unit          ← new visible caption
Unit  [ 3 ]  complete  ← existing inline header (unchanged)
```

### 6.2 Properties

| Property | Value |
| --- | --- |
| Caption element | `<label htmlFor={inputId}>` |
| Caption text | `"Finished unit"` |
| Caption classes | `text-xs text-muted-foreground mb-1 block` |
| Input `id` | Stable id via `useId()` (e.g. `finished-unit-input`) |
| Inline header row | Unchanged — flex row, borderless number input |
| Validation error | Unchanged — below inline header |
| `aria-label` on input | Keep `"Finished unit number"` |

### 6.3 Accessibility

The visible `<label>` is linked to the number input via `htmlFor`/`id`. The existing `aria-label` on the input may remain (redundant but harmless).

---

## 7. Testing

No automated tests exist for these components today. Manual verification:

1. Expand composer → type is Daily lesson, `"Finished unit"` caption visible, unit field focused
2. Submit without unit number → validation error `"Finished unit is required"`
3. Switch to Announcement → title field shown, unit cleared
4. Post daily lesson successfully → composer resets to Daily lesson
5. Edit existing announcement → type stays Announcement, no unit caption

---

## 8. Files

| File | Change |
| --- | --- |
| `schedjuice-reimagined-fe/src/components/course/feed/course-feed-composer.tsx` | Default `post_type` → `"daily_lesson"` (2 lines) |
| `schedjuice-reimagined-fe/src/components/course/feed/daily-lesson-unit-header.tsx` | Add `"Finished unit"` caption above inline header |

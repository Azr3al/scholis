# Course Student Info — Photo Gallery

**Date:** 2026-08-12  
**Status:** Approved (design)  
**Scope:** `schedjuice-reimagined-be` + `schedjuice-reimagined-fe`  
**Surface:** `/courses/:id/student-info` (new course hub rail item)

## Summary

Add a **Student Info** section to the course record hub. Staff (teachers and admins on the course) can browse enrolled students' **award photos** and **ID photos** in a gallery or list view, upload/replace photos from the course context, and inspect per-student upload history. A second sub-tab, **Academic Performance**, ships as a "Coming soon" placeholder.

## Problem

Today, student ID and award photos are managed on individual **user record** pages (`UserPhotosSection`) or data-sheet shortcuts — not from the course context where teachers spend most of their time. Teachers can **view** co-enrolled students' photos but cannot **upload** them (RBAC defaults deny `user_image.upload.*` for the teacher role). There is no course-level view to scan an entire class's photos at once.

## Decisions (locked)

| Question | Decision |
|---|---|
| Placement | **A** — new top-level rail item **Student Info** in Roster group (`/courses/:id/student-info`) |
| vs Students page | **Separate** — existing Students page remains roster CRUD; Student Info is read/update for student data |
| Visibility | **Staff only** — students do not see the rail item or route |
| Upload permissions | **Course-scoped** — teachers assigned to the course can upload ID + award photos for enrolled students on this page, without global `user_image.upload.*` |
| Photo organization | **Sub-filter within tab** — `All` \| `ID Photos` \| `Award Photos` (default: All) |
| View modes | **Gallery** (default) \| **List** — persisted via `useGridViewPreference` |
| Audit history | **Per-student history panel** — side sheet reusing `UserImage` append-only rows (no course-wide log in v1) |
| Backend approach | **Approach 1** — extend existing `UserImage` upload API with optional `course_id` for course-scoped auth |
| Academic Performance | **Coming soon** placeholder only in v1 |
| Data model | **No new models** — reuse `UserImage` (see `2026-08-06-user-image-design.md`) |

## Goals / non-goals

**Goals**

- New course hub section with sub-tab navigation (Photo Gallery + Academic Performance placeholder)
- Gallery and list views of enrolled students' ID and award photos
- Course-scoped upload for teachers on the course roster
- Per-student, per-photo-type history via existing `UserImage` list API
- Reuse existing photo components (`UserImageUploadDialog`, `FullScreenImageViewer`, history sheet pattern from `UserPhotosSection`)

**Non-goals (v1)**

- Academic Performance data or UI beyond "Coming soon"
- Course-wide chronological audit log across all students
- New aggregate `GET /courses/:id/student-info/photos` endpoint (defer unless perf requires it)
- Bulk upload / ZIP import
- Student self-service on this page
- Backfill or migration of legacy `User.id_photo`
- Changes to global RBAC defaults for teachers org-wide

## Architecture

```
Course hub rail
  → /courses/:id/student-info
       → redirect to /courses/:id/student-info/photo-gallery
       → sub-tabs: photo-gallery | academic-performance

Photo Gallery (FE)
  → useCourseStudentRoster(courseId)           enrolled students
  → POST /user-image-urls (batch, per type)    resolved presigned URLs
  → POST /users/{id}/user-images + course_id   course-scoped upload
  → GET  /users/{id}/user-images?image_type=   per-student history

Upload auth (BE)
  → global path:  user_image.upload.{type} + user_can_access_user  (unchanged)
  → course path:  course_id + staff on course + target enrolled student
```

---

## Frontend (`schedjuice-reimagined-fe`)

### Navigation

Add to `src/config/course-record-nav.ts`:

| Field | Value |
|---|---|
| `id` | `student-info` |
| `label` | `Student Info` |
| `segment` | `student-info` |
| `group` | `roster` |
| `canShow` | `!isStudent(user)` |

Register `student-info` in `HUB_SEGMENTS` / `isCourseHubRoute` so the hub identity strip renders.

Add middleware route rule: `/courses/*/student-info` → `course.view` (same as other hub sections).

### Routes

| Path | Component | Notes |
|---|---|---|
| `courses/[id]/student-info/page.tsx` | redirect | → `photo-gallery` |
| `courses/[id]/student-info/photo-gallery/page.tsx` | `CourseStudentInfoPhotoGallery` | v1 implementation |
| `courses/[id]/student-info/academic-performance/page.tsx` | placeholder | "Coming soon" |

### Sub-tab navigation

Horizontal tabs under page header, URL-driven:

- `/courses/:id/student-info/photo-gallery`
- `/courses/:id/student-info/academic-performance`

Follow the same URL-synced tab pattern used on `courses/[id]/edit` (`url-tabs.tsx`).

### Photo Gallery layout

```
┌─ Student Info ──────────────────────────────────────────────────┐
│  [ Photo Gallery ]  [ Academic Performance ]                    │
│─────────────────────────────────────────────────────────────────│
│  [ All | ID Photos | Award Photos ]     [ Gallery ▣ | List ≡ ]  │
│  Search: [________________]                                     │
│                                                                 │
│  (gallery grid or list table)                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Toolbar controls**

| Control | Storage | Default |
|---|---|---|
| Photo type filter | URL `?type=all\|id\|award` | `all` |
| View mode | `useGridViewPreference("course-student-info-photos")` | `gallery` |
| Search | client-side on name/email | — |

### Gallery view (default)

Responsive card grid. Each card shows:

- Student name (link to user record when actor has access)
- Photo slot(s) based on filter:
  - **All:** ID + Award side-by-side
  - **ID / Award:** single slot
- Empty slot: muted placeholder ("No photo")
- Legacy badge on ID slot when `source === "legacy_id_photo"`
- Click image → `FullScreenImageViewer`
- Actions per visible type: **Upload**, **History**

### List view

`ResourceTable` columns:

| Column | Shown when |
|---|---|
| Student (name + avatar) | always |
| ID photo thumbnail | `all` or `id` |
| Award photo thumbnail | `all` or `award` |
| Last updated | per visible type |
| Actions (Upload, History) | per visible type |

### Upload & history

**Upload:** reuse `UserImageUploadDialog`. Pass `courseId` from `useCourseHub()` into the upload API call so the backend applies course-scoped auth. Crop preset: `IdPhoto` for `id_image`, standard for `award_image`.

**History:** reuse the side-sheet pattern from `UserPhotosSection` — `GET /users/{id}/user-images?image_type=`, newest first, thumbnail + date + uploader.

When filter = All, expose separate History actions per photo type (or a type picker inside the sheet).

**After upload:** invalidate resolve + history queries; toast confirmation.

### Authorization helpers

Add to `src/helpers/authorization.ts`:

```ts
canViewStudentInfoSection(viewer: accountType): boolean
  // !isStudent(viewer)

canUploadUserImageOnCourse(
  viewer: accountType,
  imageType: UserImageType,
  ctx: { courseId: string; teacherMemberIds: number[]; createdById: number | null },
): boolean
  // canEditCourse(viewer, ...) — course staff (teacher on roster, creator, admin/manager)
```

Upload button visible when `canUploadUserImageOnCourse(...)` OR `canUploadUserImage(viewer, imageType)` (global path).

View gated by existing `canViewUserImage(viewer, imageType)`.

### Data loading

1. `useCourseStudentRoster(courseId)` — enrolled students (same hook as Students page)
2. Extract student user IDs
3. Batch resolve:
   - `POST /user-image-urls` with `image_type=id_image` (when filter is `all` or `id`)
   - `POST /user-image-urls` with `image_type=award_image` (when filter is `all` or `award`)
4. Merge into card/row view models client-side

React Query keys: `["course-student-info-photos", courseId, typeFilter, studentIds]`.

### Academic Performance tab

Static placeholder:

- Heading: "Academic Performance"
- Body: "Coming soon."
- No API calls, no loading states.

### Component structure (suggested)

```
src/components/course/student-info/
  course-student-info-tabs.tsx
  photo-gallery/
    course-student-info-photo-gallery.tsx
    student-photo-gallery-card.tsx
    student-photo-gallery-table.tsx
    student-photo-toolbar.tsx
  academic-performance/
    course-student-info-academic-performance.tsx  (placeholder)
```

---

## Backend (`schedjuice-reimagined-be`)

### Upload authorization extension

Extend `UserImageListCreateView` POST handler in `app_auth/user_image_views.py`.

**Request:** multipart `{ image, image_type, course_id? }`

Upload allowed when **either**:

1. **Global path (unchanged):** actor has `user_image.upload.{image_type}` AND `user_can_access_user(actor, target)`
2. **Course path (new):** `course_id` provided AND:
   - Actor is course staff: teacher on course roster, course creator, or holds admin/manager-equivalent course access (mirror `canEditCourse` semantics server-side)
   - Target user is an enrolled student in that course (active `UserCourse` with student role)
   - Actor is not a student role

Course path does **not** require `user_image.upload.{image_type}`.

**Validation on `course_id`:**

- Course exists and actor can access it (`user_can_access_course`)
- Target is enrolled student in that course
- Return 400 for invalid/missing enrollment; 403 for non-staff actor

### Read APIs (unchanged)

Gallery and history use existing endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/user-image-urls` | Batch resolve presigned URLs |
| `GET` | `/users/{id}/user-images/resolve?image_type=` | Single resolve (if needed) |
| `GET` | `/users/{id}/user-images?image_type=` | Paginated history |

No new read endpoints in v1.

### Course staff check (server)

Add helper in `app_course/` or `app_auth/` (e.g. `course_staff_can_manage_student_photos(actor, course, target_user)`):

```python
def course_staff_can_upload_student_image(actor, course, target_user) -> bool:
    if actor.is_student():  # matches FE isStudent()
        return False
    if not user_is_enrolled_student(course, target_user):
        return False
    # Mirror FE canEditCourse: admin/manager/superadmin, or teacher on roster / creator
    return user_is_course_staff(actor, course)
```

Exact role checks must mirror FE `canEditCourse` (`hasAdminCredentials` OR teacher on `courseMemberIds` OR creator). Add a contract test pairing FE helper expectations with BE helper.

### Audit history

No new audit model. Each upload creates an append-only `UserImage` row with `uploaded_by` and `created_at` (existing behavior per `2026-08-06-user-image-design.md`).

---

## Error handling

| Status | Condition |
|---|---|
| 403 | Actor not course staff (course path); missing view permission; student actor |
| 400 | Invalid `image_type`; bad MIME; oversize file; `course_id` provided but target not enrolled |
| 404 | Target user or course not found |

---

## Testing (high-value)

### Backend (`app_auth/tests/test_user_images.py` + course scoping)

- Course teacher **without** `user_image.upload.*` can upload when `course_id` + enrolled student
- Upload **denied** when target not enrolled in given `course_id`
- Upload **denied** for student actor even with valid `course_id`
- Upload **denied** when `course_id` omitted and actor lacks global upload permission (regression)
- Global upload path still works without `course_id` (regression)
- Invalid `course_id` → 404; wrong enrollment → 400

### Frontend (Vitest)

- `canViewStudentInfoSection`: student role returns false
- Upload button visible for course teacher, hidden for non-staff outsider
- Gallery is default view; type filter hides irrelevant photo slot
- Upload call includes `courseId` when invoked from course page
- History sheet fetches `listUserImages` with correct `image_type`

---

## Future work (post-v1)

- **Academic Performance** sub-tab — grades, assessments, attendance summary
- **Aggregate endpoint** (`GET /courses/:id/student-info/photos`) if batch resolve becomes slow on large rosters
- **Course-wide audit log** — chronological feed of all photo changes
- **Bulk export** — ZIP of class ID photos (may migrate reports export to `UserImage` resolver)
- Additional Student Info sub-tabs as needed

## Related specs

- `docs/superpowers/specs/2026-08-06-user-image-design.md` — `UserImage` model, resolve, RBAC, history

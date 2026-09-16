# Staff Certifications & Public Profile — Design Spec

> Extend public profiles to all staff, add structured certification uploads with a section-level public visibility toggle, an inline live preview panel, and (separate sub-task) inline image paste in the qualifications rich-text editor.

**Status:** Approved (brainstorming 2026-07-05)  
**Date:** 2026-07-05

---

## 1. Problem

Today, public profiles are **teacher-only**:

- The Public Profile section appears only when `subjectIsTeacher` is true.
- Slug generation and the public API filter on `UserRole.TEACHER`.
- The public page lives at `/teachers/{slug}` (FE) and `GET /public/teachers/{slug}` (BE).
- `qualifications` is a TipTap JSON rich-text field with no inline image support.
- There is no way to upload structured certifications (PDFs, credential scans) or control their visibility separately from the rest of the profile content.

Schools need staff (admin, manager, HR, finance, teacher, etc.) to showcase credentials on a shareable public page, with admin or self-service management and a live preview while editing.

---

## 2. Goals

1. **All staff** can enable a public profile and receive a shareable link at `/people/{slug}`.
2. **Structured certifications** — title, issuing organization, issue date, optional expiry date, optional file (PDF/image).
3. **Section-level toggle** — `show_certifications_on_public_profile` controls whether the certifications block appears on the public page (master public profile toggle still gates the entire page).
4. **Permissions** — self-service for the subject; admins with user-edit permission can manage any staff member's certifications (same pattern as other profile fields).
5. **Inline preview** — live-rendered public profile panel embedded in the Public Profile edit section, driven by current form state.
6. **Rich-text inline images** (separate implementation task) — paste/drop images into the qualifications TipTap editor, GitHub-style; adapt the existing quiz editor image upload pattern.

### Non-goals

- Video embeds in qualifications rich text.
- Per-certification public visibility toggles.
- Auto-hiding expired certifications on the public page (expiry date is displayed; cert remains visible).
- Reusing `app_certificates` (course completion certificate templates — different domain).
- Redirects from legacy `/teachers/{slug}` routes — **old routes are deleted**, not redirected.

---

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Qualifications content | Keep existing TipTap rich-text `qualifications` JSONField |
| Certifications content | New `UserCertification` model + Attachment FK |
| Cert metadata | Title, issuing org, issue date, optional expiry, optional file |
| Cert public visibility | Section toggle: `show_certifications_on_public_profile` (default `false`) |
| Who gets public profiles | All active staff roles (`superadmin`, `admin`, `manager`, `teacher`, `finance`, `hr`) |
| Who manages certs | Self + admins with user-edit permission |
| Preview UX | Inline live panel in Public Profile edit section |
| Public URL (FE) | `/people/{slug}` — delete `/teachers/[slug]` page |
| Public API (BE) | `GET /public/people/{slug}` — delete `GET /public/teachers/{slug}` |
| Legacy routes | **Delete entirely** — no redirects |
| Rich-text images | Separate sub-task within this spec; images only, max 10 MB |
| Cert file types | PDF, PNG, JPEG, WebP; max 10 MB per file |
| Data model approach | Dedicated `UserCertification` model (not JSON blob on User) |

---

## 4. Data model

### 4.1 New model: `UserCertification`

Location: `app_auth/models.py` (or `app_auth/certifications.py` if file size warrants split).

| Field | Type | Notes |
| --- | --- | --- |
| `user` | FK → `User` | `related_name="certifications"`, `on_delete=CASCADE` |
| `title` | `CharField(256)` | Required |
| `issuing_organization` | `CharField(256)` | Required |
| `issued_on` | `DateField` | Required |
| `expires_on` | `DateField` | Nullable |
| `attachment` | FK → `Attachment` | Nullable; `SET_NULL` on delete |
| `sort_order` | `PositiveIntegerField` | Default `0`; ascending on public page |
| `created_by` | FK → `User` | `PROTECT`; audit |

Constraints:

- `expires_on >= issued_on` when both set (serializer validation).
- Max **50 certifications per user** (serializer guard).

### 4.2 New User field

| Field | Type | Default |
| --- | --- | --- |
| `show_certifications_on_public_profile` | `BooleanField` | `false` |

Included in public profile explicit-save payload alongside existing `qualifications` and `is_public_profile_enabled`.

### 4.3 Existing User fields (unchanged semantics, expanded eligibility)

| Field | Change |
| --- | --- |
| `qualifications` | TipTap JSON; may gain inline `attachmentId` image nodes (sub-task) |
| `is_public_profile_enabled` | Master toggle for entire public page |
| `public_profile_slug` | Assigned for **any staff user** (not only teachers) when they first save public profile content |

### 4.4 Slug generation

Update `public_profile_helpers.py`:

- Replace `is_teacher()` checks with **is staff** helper (roles overlap with `STAFF_ROLES_FOR_SHORTCUTS` from `shortcuts_availability_helpers.py`).
- Keep existing `t_*` slugs for backward-compatible link targets (slug value unchanged; only URL path changes).
- New slugs use prefix `p_` + 8 hex chars (e.g. `p_a1b2c3d4`).
- `should_assign_public_profile_slug` triggers when staff user saves qualifications, certifications toggle, or enables public profile.

### 4.5 Attachments

| `table_name` | Purpose |
| --- | --- |
| `user_certification` | Certification file uploads |
| `user_qualifications` | Inline images in TipTap qualifications (sub-task) |

Reuse `PrivateMediaStorage` and existing chunked/simple attachment upload endpoints.

---

## 5. API

### 5.1 Certification CRUD

Base path: `/users/{user_id}/certifications`

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/users/{id}/certifications` | Self or user-edit admin |
| `POST` | `/users/{id}/certifications` | Self or user-edit admin |
| `PATCH` | `/users/{id}/certifications/{cert_id}` | Self or user-edit admin |
| `DELETE` | `/users/{id}/certifications/{cert_id}` | Self or user-edit admin |

**List/create response shape:**

```json
{
  "id": 1,
  "title": "TEFL Certificate",
  "issuing_organization": "Cambridge",
  "issued_on": "2024-03-15",
  "expires_on": "2027-03-15",
  "sort_order": 0,
  "attachment_id": 42,
  "attachment_filename": "tefl.pdf",
  "attachment_url": "<presigned, 1h>"
}
```

- `attachment_url` presigned via `PrivateMediaStorage` when attachment exists.
- Create/update accepts `attachment_id` after client uploads file separately (same pattern as other attachment flows).

**User PATCH additions:**

- `show_certifications_on_public_profile` added to public profile explicit-save keys (alongside `qualifications`, `is_public_profile_enabled`).

### 5.2 Public profile endpoint

**Delete:** `GET /public/teachers/{slug}`  
**Add:** `GET /public/people/{slug}`

Query: active staff user where `public_profile_slug=slug` AND `is_public_profile_enabled=True` AND roles overlap staff allowlist.

**Response:**

```json
{
  "name": "Jane Doe",
  "role_label": "Teacher",
  "profile_image_url": "<presigned|null>",
  "qualifications": { "type": "doc", "content": [] },
  "certifications": [
    {
      "title": "TEFL Certificate",
      "issuing_organization": "Cambridge",
      "issued_on": "2024-03-15",
      "expires_on": "2027-03-15",
      "file_url": "<presigned|null>",
      "file_filename": "tefl.pdf"
    }
  ]
}
```

Rules:

- `certifications` array present only when `show_certifications_on_public_profile` is `true`; otherwise omit or return `[]`.
- `role_label` — human-readable primary staff role for badge display (Teacher, Admin, HR, etc.).
- `qualifications` — resolve inline image `attachmentId` nodes to presigned URLs before returning (sub-task).
- `Cache-Control: public, max-age=0, must-revalidate` (unchanged).

Rename serializer: `PublicTeacherProfileSerializer` → `PublicProfileSerializer`; extend fields.

### 5.3 Deleted routes

| Layer | Remove |
| --- | --- |
| BE | `path("public/teachers/<str:slug>", ...)` |
| FE | `app/(public)/teachers/[slug]/page.tsx` |
| FE | `PublicTeacherProfileView` filename (rename/refactor) |

Update share link generation: `/people/{slug}`.

---

## 6. Frontend

### 6.1 Public Profile section eligibility

In `build-form-sections.ts`, replace `subjectIsTeacher` gate with **subject is staff** (any role in staff allowlist, excluding student-only accounts).

Applies to:

- User form (`user-form-fields.tsx`)
- Record Academic tab (`record-academic.tsx` → `RecordPublicProfile`)

Section title/description update:

> Share your name, photo, qualifications, and certifications with anyone via a public link.

### 6.2 Public Profile edit layout

Top → bottom within `UserPublicProfileFields` (Certifications record section → Public profile subsection):

1. **Visibility settings card** (`PublicProfileSettingsCard`) — bundled toggles:
   - Enable public profile
   - Show certifications on public profile (disabled/dimmed when profile off)
2. **Inline preview panel** (`PublicProfilePreview`) — live updates from form watch + certifications query
3. **Qualifications** — TipTap editor (existing)
4. **Save public profile** button (explicit save for profile fields + toggles)
5. **Share link** (`CopyInput` → `/people/{slug}`)

Cert CRUD lives in the **Certifications** subsection above Public profile (`RecordCertifications` → `UserCertificationsSection`). Uses dedicated API (not bundled in Save public profile) — immediate persist on add/edit/delete with toast feedback.

**UX principle:** Prefer **inline, in-flow patterns** over dialogs for CRUD forms. See §6.6 and `DESIGN.md` §12 (Dialogs & overlays).

### 6.3 Shared presentation components

Refactor `public-teacher-profile-view.tsx`:

| Component | Purpose |
| --- | --- |
| `PublicProfileShell` | Tenant header chrome (unchanged) |
| `PublicProfileHero` | Photo, name, role badge, school name |
| `PublicProfileQualifications` | Read-only TipTap render |
| `PublicProfileCertifications` | Cert list/cards with dates and file links |
| `PublicProfileView` | Full page — fetches `GET /public/people/{slug}` |
| `PublicProfilePreview` | Inline panel — accepts draft props, no fetch |

`PublicProfilePreview` props:

```typescript
{
  name: string;
  roleLabel: string;
  profileImageUrl: string | null;
  qualifications: JSONContent | null;
  showCertifications: boolean;
  certifications: PublicCertification[];
  tenant: PublicTenantBranding | null;
}
```

Preview shows a subtle "Preview" label/banner so users know it is not the live public page. Disabled-state styling when `is_public_profile_enabled` is false (overlay or muted treatment + helper text).

### 6.4 Public page route

- **Add:** `app/(public)/people/[slug]/page.tsx` → `PublicProfileView`
- **Delete:** `app/(public)/teachers/[slug]/page.tsx`

### 6.5 Certifications UI

**List item:** title (primary), issuing org (secondary), issued/expiry dates, file icon + filename link.

**Empty state:** dashed border placeholder — "No certifications added yet."

**Add / edit — inline composer slot (not a dialog):**

- One shared **`CertificationComposer`** panel at the **top** of the cert list (above items).
- **Add:** clears form, opens composer with `revealBar` enter animation.
- **Edit:** pre-fills from selected cert, opens same composer, `scrollIntoView` + focus first field.
- **Cancel:** `AnimatePresence` exit; discard unsaved changes (no modal).
- **Save:** immediate API persist + toast; composer closes with exit animation.
- **Delete:** immediate action with toast (optional inline confirm row on card — not a modal).

**Composer fields:** title*, issuing org*, issued on*, expires on (optional), file upload (optional on edit — keep existing if unchanged).

**Motion:** import variants from `src/lib/sj/motion.ts` — `revealBar` for composer open/close, `crossfade` keyed by `add` vs `edit-{id}` when swapping mode, `crossfadeOpacity` or `staggerItem` for list item add/remove. Gate with `useReducedMotion()` → `crossfadeInstant`.

**Reference patterns in codebase:** `InlineBuiltinGroup` (section edit mode), `roles-editor` (`revealBar` + `AnimatePresence`).

**Real-world analogues:** GitHub Settings → Profile → Add credential (inline expand); Stripe Dashboard settings sections (in-flow forms, no centered modal).

Sort: manual reorder deferred (YAGNI) — default `sort_order` by `created_at` ascending; drag reorder is a future enhancement.

### 6.6 Dialog avoidance (product-wide)

Dialogs break immersion on record pages and require separate mobile treatment. **Default to inline patterns:**

| Pattern | Use for |
| --- | --- |
| **Composer slot** | Add/edit list items (certifications, future CRUD lists) |
| **Section edit mode** | Multi-field groups (`InlineBuiltinGroup`, `InlineGroup`) |
| **Expand-in-place** | Single-field or small card edits |

**Dialogs / alert dialogs allowed only for:**

- Irreversible or high-stakes confirmations (e.g. role changes with provisioning side effects)
- Blocking system errors
- Ephemeral pickers attached to a field (date popover, combobox) — not full forms

**Banned for:** create/edit forms with 3+ fields, file uploads, or any workflow that stays on a record page for more than one step.

---

## 7. Rich-text inline images (separate sub-task)

Adapt the quiz TipTap pattern (`QuizImage` extension + `uploadAttachments`):

| Item | Detail |
| --- | --- |
| Extension | `QualificationImage` (or shared `AttachmentImage`) with `attachmentId`, `pending`, `uploadId` attrs |
| Upload target | `table_name=user_qualifications`, FK = user id |
| UX | Paste (`clipboardData` image items) + drag/drop + toolbar file picker |
| Limits | Images only (PNG, JPEG, GIF, WebP); max 10 MB |
| Permissions | Same as qualifications edit (self or user-edit admin) |
| Public API | Walk qualifications JSON; replace `attachmentId` with presigned URL in `src` before response |
| View mode | Read-only TipTap renders images inline (public page + preview) |

Reference implementations:

- `schedjuice-reimagined-fe/src/components/editor/quiz-image-extension.ts`
- `schedjuice-reimagined-fe/src/components/editor/menu.tsx` (`handleQuizImageFile`)
- `schedjuice-reimagined-fe/src/components/product-docs/docs-markdown-editor.tsx` (paste handler UX inspiration)

Not in scope: video paste, CodeMirror port.

---

## 8. Authorization

| Action | Rule |
| --- | --- |
| View/edit certifications | Subject (`request.user.id == user.id`) OR `canEditUser(viewer, subject)` |
| View Public Profile section | Subject is staff AND (self viewing own record OR admin with user access) |
| Public page | No auth; gated by `is_public_profile_enabled` + valid slug |
| Cert file download (public) | Presigned URL in public API response only when cert section visible |

---

## 9. Error handling

| Case | Behavior |
| --- | --- |
| Invalid file type/size | FE validation before upload; BE returns 400 with message |
| Missing required cert fields | Form validation; BE serializer 400 |
| `expires_on < issued_on` | Validation error |
| Public profile disabled | Public API 404 |
| Non-staff slug lookup | Public API 404 |
| Upload failure | Toast error; remove pending image node (qualifications sub-task) |
| >50 certs | BE rejects create with clear message |

Expired certifications: displayed with expiry date visible (e.g. muted "Expired" label) — **not** auto-hidden.

---

## 10. Testing

### Backend

- `UserCertification` CRUD RBAC (self, admin, unauthorized third party)
- Public endpoint: staff non-teacher profile, cert visibility toggle, disabled profile 404
- Slug assignment for non-teacher staff on first public profile save
- Delete old `public/teachers` URL — assert 404
- Cert count limit, date validation, attachment presigning

### Frontend

- Public Profile section visible for admin/HR/etc., not for student-only users
- Share link uses `/people/{slug}`
- Preview panel updates when toggles/qualifications/certs change
- Cert add/edit/delete flow (inline composer — no dialog)
- Public page renders role badge correctly per staff role

### Sub-task (inline images)

- Paste/drop uploads and renders in editor
- Public API resolves attachment IDs to URLs
- Preview and public page show inline images

---

## 11. Migration & rollout notes

1. Deploy BE migration (`UserCertification`, `show_certifications_on_public_profile`) + new public endpoint before FE route swap.
2. FE deploy removes `/teachers/[slug]` — **existing shared links break**; communicate to customers that public profile URLs change to `/people/{slug}` (slug value unchanged for existing users).
3. Update changelog entry covering: staff public profiles, certifications, preview panel, URL change, inline qualification images (when sub-task ships).

---

## 12. Implementation decomposition

Recommended plan split:

1. **Backend foundations** — model, migration, cert CRUD, public people endpoint, staff slug generalization, delete old BE route
2. **Frontend public profile expansion** — staff eligibility, `/people` route, component refactor, preview panel, certifications UI, delete old FE route
3. **Rich-text inline images** — TipTap extension, upload wiring, public API image resolution

Tasks 1 and 2 are tightly coupled for release. Task 3 can ship immediately after or in parallel once qualifications editor extension points exist.

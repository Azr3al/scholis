# Staff E-Signature (User Signature)

**Date:** 2026-07-26  
**Status:** Approved (design)  
**Scope:** `schedjuice-reimagined-fe` + `schedjuice-reimagined-be`

## Problem

Staff need a personal e-signature stored on their user profile so it can be injected into documents and receipts elsewhere in the app. Today there is no signature field, no drawing UI, and no storage path for signature images.

## Decisions (locked)

| Question | Decision |
|---|---|
| Storage | `User.user_signature` — `ImageField`, private S3, tenant-scoped path |
| Capture UI | Canvas drawing via `signature_pad` (new FE dependency) |
| Image format | Transparent PNG (ink only, no background) |
| Who can set/change | **Subject only** — admin cannot override |
| Who can view | Anyone with profile access; admins/managers see read-only on other staff |
| Replace / clear | Self can re-draw or clear at any time |
| Required? | Optional — no prompts; downstream docs omit signature if missing |
| Staff scope | All staff personas (`isStaffSubject` / `user_is_staff`); hidden for students |
| Profile placement | Overview section on user profile page |
| Document injection | **Out of scope** for this iteration — storage + profile UI only |

## Architecture

```
UserSignaturePad (signature_pad)
  → export transparent PNG blob
  → FormData user_signature → PUT /users/{id}
  → PrivateMediaStorage ({tenant}/user_signatures/)
  → user_signature_url (presigned) in serializer

RecordOverview → UserSignatureSection
  → preview (checkerboard for transparency)
  → Draw / Clear (self + staff only)
```

---

## Backend (`schedjuice-reimagined-be`)

### Model

Add upload helper and field on `User` in `app_auth/models.py`:

```python
def get_tenant_specific_upload_folder_for_user_signature(instance, filename):
    return get_tenant_specific_upload_folder(filename, "user_signatures")

user_signature = models.ImageField(
    upload_to=get_tenant_specific_upload_folder_for_user_signature,
    null=True,
    blank=True,
    storage=PrivateMediaStorage(),
)
```

No thumbnail variant (unlike `id_photo` / `id_photo_thumb`).

### Serializer

In `app_auth/serializers.py` (`UserSerializer` or equivalent detail serializer):

- Add `user_signature` to writable fields with self-only enforcement (see Authorization).
- Add read-only `user_signature_url = SerializerMethodField()` using existing `_signed_url(obj.user_signature)` pattern (same as `id_photo_url`).

Expose `user_signature_url` on read for all users who can fetch the user record. Do **not** expose raw storage paths beyond existing image-field conventions.

### Authorization

Enforce in serializer `validate()` and/or `update()` before applying changes:

```python
if "user_signature" in validated_data:
    request = self.context.get("request")
    actor = getattr(request, "user", None)
    if actor is None or actor.id != instance.id:
        raise PermissionDenied("Only the user can set their own signature.")
    if not user_is_staff(instance):
        raise ValidationError({"user_signature": "Signatures are for staff only."})
```

Rules:

| Action | Allowed |
|---|---|
| Staff self upload PNG | Yes |
| Staff self clear (`null`) | Yes |
| Admin/manager upload for another user | **No** — 403 |
| Student set signature | **No** — validation error |
| Any profile viewer GET `user_signature_url` | Yes (when subject is staff and field is set) |

Admin `user.update` permission does **not** bypass signature write rules.

### API

| Method | Body | Notes |
|---|---|---|
| `PUT/PATCH /users/{id}` | `multipart/form-data`, key `user_signature`, PNG file | Self + staff only |
| `PATCH /users/{id}` | JSON `{ "user_signature": null }` | Clear signature; self only |

Follow existing `updateEntity` / multipart user update patterns used for `profile_image` and `id_photo`.

### Migration

Standard Django migration adding nullable `user_signature` column. No data backfill.

---

## Frontend (`schedjuice-reimagined-fe`)

### Dependency

Add `signature_pad` to `package.json`. Do **not** add `react-signature-canvas`.

### Types

In `src/types/user.ts`, extend account schema:

```typescript
user_signature_url: z.string().nullable().optional(),
```

### Authorization helper

In `src/helpers/authorization.ts`:

```typescript
export const canEditUserSignature = (
  viewer: accountType,
  subject: Pick<accountType, "id" | "roles">,
) => viewer.id === subject.id && isStaffSubject(subject);
```

Add Vitest coverage in `authorization-media.test.ts` or a dedicated test file (self/staff/admin/student matrix).

### Components

| File | Responsibility |
|---|---|
| `src/components/users/user-signature-pad.tsx` | Wrap `signature_pad`: canvas sizing (ResizeObserver), pen config, `isEmpty()`, export trimmed transparent PNG |
| `src/components/users/user-signature-dialog.tsx` | Dialog: pad + Clear pad / Cancel / Save; upload mutation on save |
| `src/components/users/user-signature-section.tsx` | Overview block: preview, Draw / Clear buttons, wires dialog |
| `src/hooks/use-user-signature-upload.ts` | Upload (`FormData`) and clear (`PATCH null`) mutations; invalidate record query |

### Canvas / export settings

- Display size: ~560×200 CSS px, responsive width, ~2.8:1 aspect
- Pen: `#000000`, background transparent
- `signature_pad` options: reasonable `minWidth` / `maxWidth` for natural strokes; enable `penColor` only (no background fill)
- Export: `toDataURL("image/png")` → `fetch`/`atob` → `File` named `signature.png`
- Save disabled when `isEmpty()`
- Clear pad: local canvas reset only; profile Clear: confirm → `PATCH { user_signature: null }`

### Overview integration

In `src/components/record/sections/record-overview.tsx`:

- Render `UserSignatureSection` when `isStaffSubject(subject)`
- Pass `subject`, `viewer`, `recordQueryKey`
- Section uses `RecordSection` title **Signature**

**Preview UI:**

- If `user_signature_url` present: show image on checkerboard background (transparency hint)
- If absent: muted text "No signature"
- Edit controls visible only when `canEditUserSignature(viewer, subject)`

**Read-only viewers** (admin viewing another staff member): preview only, no Draw/Clear buttons.

### UI mockup

```
┌─ Signature ──────────────────────────────────────┐
│  ┌──────────────────────────┐                    │
│  │  [saved signature img]   │   checkerboard bg  │
│  │   or "No signature"      │                    │
│  └──────────────────────────┘                    │
│  [Draw signature]  [Clear]     ← self + staff   │
└──────────────────────────────────────────────────┘

Draw dialog:
┌─ Draw your signature ────────────────────────────┐
│  Sign in the box below                           │
│  ┌────────────────────────────────────────────┐  │
│  │  canvas (signature_pad)                    │  │
│  └────────────────────────────────────────────┘  │
│  [Clear pad]              [Cancel]  [Save]     │
└──────────────────────────────────────────────────┘
```

Reuse existing primitives: `Dialog`, `Button`, `useToast`, confirm pattern for destructive clear.

---

## Document injection (future)

Downstream receipt/document generators will consume `user_signature_url` (FE) or `user.user_signature` + presigned URL (BE). This spec does **not** implement injection. Callers must treat missing signature as optional (omit image).

---

## Error handling

| Case | Behavior |
|---|---|
| Empty canvas on Save | Button disabled; optional inline hint |
| Non-self upload attempt | 403; toast: "Only you can update your signature" |
| Student profile | Section not rendered |
| Upload failure | Toast matching `RecordImageUploadDialog` copy pattern |
| Missing signature on documents | Omit silently |

---

## Testing

### Backend (`app_auth/tests/`)

High-value tests only:

1. Staff self uploads PNG → 200, `user_signature` set, `user_signature_url` non-null in response
2. Admin PATCHes another user's `user_signature` → 403
3. Student self cannot set `user_signature` → 400/403
4. Staff self clears via `{ "user_signature": null }` → field null
5. GET user returns `user_signature_url` for staff with signature (viewer unrelated to subject)

Run via `./scripts/run_backend_tests.sh app_auth.tests.test_user_signature -v 2 --keepdb --noinput`.

### Frontend (Vitest)

1. `canEditUserSignature` — self+staff true; admin viewing other false; student false
2. `UserSignaturePad` — save disabled when empty; export returns PNG data URL when stroked (mock canvas/pad as needed)

---

## Files to touch (implementation reference)

**Backend**

- `app_auth/models.py` — field + upload helper
- `app_auth/serializers.py` — field, URL, validation
- `app_auth/migrations/` — new migration
- `app_auth/tests/test_user_signature.py` — new

**Frontend**

- `package.json` — `signature_pad`
- `src/types/user.ts`
- `src/helpers/authorization.ts` + test
- `src/hooks/use-user-signature-upload.ts`
- `src/components/users/user-signature-pad.tsx`
- `src/components/users/user-signature-dialog.tsx`
- `src/components/users/user-signature-section.tsx`
- `src/components/record/sections/record-overview.tsx`

---

## Out of scope

- Injecting signature into receipts, PDFs, or certificates
- Signature on student profiles
- Admin override or proxy signing
- Required-signature prompts or profile completeness gates
- Batch signature export or audit log of signature changes

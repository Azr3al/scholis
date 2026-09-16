# User Image Storage (`UserImage`)

**Date:** 2026-08-06  
**Status:** Approved (design)  
**Scope:** `schedjuice-reimagined-be` + `schedjuice-reimagined-fe`

## Problem

Students and staff need a dedicated way to store typed user photos (award photos, ID photos) that is separate from form-designer custom fields. Other platform subsystems must resolve the correct photo by a stable `image_type` enum — e.g. monthly/termly award certificates will eventually use each student's most recent `award_image`.

Today user photos are fragmented across direct `User` columns (`id_photo`, `profile_image`, …), generic `Attachment` rows, and form-designer attachment fields in `custom_data`. There is no versioned, enum-keyed image registry.

## Decisions (locked)

| Question | Decision |
|---|---|
| Approach | **A** — dedicated `UserImage` model in `app_auth` with `ImageField` |
| Initial `image_type` values | `award_image`, `id_image` |
| History | Append-only — every upload creates a new row; keep all versions forever |
| Chronological order | `BaseModel.created_at` on each row; latest chosen at read time |
| `id_image` resolution | Latest `UserImage` with `image_type=id_image`, else fallback to legacy `User.id_photo` |
| `award_image` resolution | Latest `UserImage` only — **no fallback** (null / placeholder downstream) |
| Sync to `User.id_photo` | **No** — new uploads write only to `UserImage`; `id_photo` is legacy read-only fallback |
| File types | Images only (JPEG, PNG, WebP) — same rules as existing `id_photo` |
| Max file size | ~10 MB (align with existing id photo limits) |
| Upload permissions | Tenant-configurable via RBAC — new permissions per `image_type` |
| Form-designer | **Not involved** — separate subsystem |
| Certificate integration | **Out of scope for v1** — storage, API, profile UI, and resolver only |
| Data migration | **Out of scope for v1** — do not backfill existing `User.id_photo` into `UserImage` |

## Architecture

```
Upload (profile UI)
  → POST /users/{id}/user-images  { image, image_type }
  → UserImage row (append-only)
  → PrivateMediaStorage ({tenant}/user_images/)

Read (consumers)
  → resolve_user_image(user, image_type)
       award_image → latest UserImage | null
       id_image    → latest UserImage | User.id_photo (legacy)
  → presigned URL via batch or resolve endpoints
```

Future consumers (certificates, ID cards, etc.) call `resolve_user_image` — not raw model queries.

---

## Backend (`schedjuice-reimagined-be`)

### Model

New model in `app_auth/models.py`:

```python
class UserImage(BaseModel):
    class ImageType(models.TextChoices):
        AWARD_IMAGE = "award_image", "Award image"
        ID_IMAGE = "id_image", "ID image"

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="user_images"
    )
    image_type = models.CharField(max_length=32, choices=ImageType.choices)
    image = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_user_images,
        storage=PrivateMediaStorage(),
    )
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_user_images",
    )

    class Meta:
        indexes = [
            models.Index(fields=["user", "image_type", "-created_at"]),
        ]
```

Upload helper:

```python
def get_tenant_specific_upload_folder_for_user_images(instance, filename):
    return get_tenant_specific_upload_folder(filename, "user_images")
```

### Resolution service

Central helper in `app_auth/user_images.py`:

```python
@dataclass
class ResolvedUserImage:
    source: Literal["user_image", "legacy_id_photo"]
    url: str | None          # presigned when requested
    user_image_id: int | None
    created_at: datetime | None

def resolve_user_image(user, image_type, *, expire: int = 3600) -> ResolvedUserImage | None:
    """
    award_image → latest UserImage row only; None if no upload.
    id_image    → latest UserImage row, else User.id_photo if set.
    """
```

All subsystems **must** use this helper so fallback rules stay in one place.

### Permissions

Add to `app_rbac/catalog.py` (Personal category):

| Code | Label |
|---|---|
| `user_image.upload.award_image` | Upload award photos |
| `user_image.upload.id_image` | Upload ID photos |
| `user_image.view.award_image` | View award photos |
| `user_image.view.id_image` | View ID photos |

Seed via RBAC migration. Grant per role per tenant through existing role-permissions UI.

**Upload authorization** (both required):

1. Actor holds `user_image.upload.{image_type}`
2. Actor can access target user via `user_can_access_user`

**View authorization:** `user_image.view.{image_type}` + `user_can_access_user`.

**Suggested defaults** in `app_rbac/defaults.py` (overridable per tenant):

| Role | award_image | id_image |
|---|---|---|
| `student` | upload + view | — |
| `teacher` | view | view |
| `hr` | upload + view | upload + view |
| `admin` / `manager` | upload + view | upload + view |

Self-upload: a user uploading for themselves still needs the type-specific upload permission (tenant admin grants `user_image.upload.award_image` to `student` role when desired).

### API

New endpoints in `app_auth`:

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/users/{user_id}/user-images` | `user_image.upload.{type}` | Multipart `{ image, image_type }`; creates row; sets `uploaded_by` |
| `GET` | `/users/{user_id}/user-images?image_type=` | `user_image.view.{type}` | Paginated history, newest first |
| `GET` | `/users/{user_id}/user-images/resolve?image_type=` | `user_image.view.{type}` | Resolved current image with `source` metadata |
| `POST` | `/user-image-urls` | `user_image.view.{type}` | Batch presigned URLs for resolved images (mirrors `IdPhotoUrlsView`) |

**Validation on upload:**

- Magic-byte MIME check (JPEG, PNG, WebP)
- Max ~10 MB
- `image_type` must be a valid enum value

**No update/delete endpoints in v1** — append-only history.

### Serializer

`UserImageSerializer`:

- `id`, `user`, `image_type`, `created_at`, `uploaded_by` (nested minimal user)
- `image_url` — presigned via `PrivateMediaStorage().url(..., expire=3600)`
- `image` writable on create only

### Migration

1. Create `UserImage` table
2. RBAC migration for four new permissions + default role grants

No backfill of `User.id_photo` → `UserImage`.

---

## Frontend (`schedjuice-reimagined-fe`)

### Profile UI

New **Photos** section on user profile / people detail (not in form-designer):

```
┌─ Photos ──────────────────────────────────────────────┐
│  Award Photo                          [Upload]        │
│  ┌──────────┐  Last uploaded: 2026-03-01 by Admin    │
│  │  (img)   │  [View history ▾]                       │
│  └──────────┘                                         │
│                                                       │
│  ID Photo                             [Upload]        │
│  ┌──────────┐  Shows legacy id_photo when no upload  │
│  │  (img)   │  [View history ▾]                       │
│  └──────────┘                                         │
└───────────────────────────────────────────────────────┘
```

- Upload button visible only when actor has `user_image.upload.{type}`
- Preview uses resolve endpoint (handles `id_image` → legacy `id_photo` fallback)
- History drawer: chronological list with date, uploader name, thumbnail
- Image picker accepts JPEG, PNG, WebP

### API client

New helper module (e.g. `src/helpers/user-images.ts`):

- `uploadUserImage(userId, imageType, file)`
- `listUserImages(userId, imageType, page?)`
- `resolveUserImage(userId, imageType)`
- `batchUserImageUrls(userIds, imageType)`

### RBAC settings

Four new permissions appear in existing role-permissions editor under Personal category.

---

## Error handling

| Status | Condition |
|---|---|
| 403 | Missing type permission or `user_can_access_user` denial |
| 400 | Invalid `image_type`, bad MIME, oversize file |
| 404 | Target user not found |

---

## Testing (high-value)

Backend (`app_auth/tests/test_user_images.py`):

- Upload denied without `user_image.upload.{type}`
- Upload denied for user outside actor scope
- Multiple uploads → resolve returns latest by `created_at`
- `id_image` resolve falls back to `User.id_photo` when no `UserImage` rows
- `award_image` resolve returns null when no upload (no fallback chain)
- Invalid MIME / oversize rejected
- Batch URL endpoint respects view permission per type
- History list ordered newest-first, all rows retained

Frontend (Vitest, if UI helpers added):

- Upload button hidden without upload permission
- Resolve preview shows legacy badge when `source=legacy_id_photo`

---

## Out of scope (v1)

- Certificate generation integration (future — will call `resolve_user_image(user, "award_image")`)
- ID card export migration to resolver (future — will call `resolve_user_image(user, "id_image")`)
- Backfill / migration of existing `User.id_photo` data into `UserImage`
- Syncing new `id_image` uploads to `User.id_photo`
- PDF / document support
- Form-designer integration
- Soft-delete, retention caps, or admin purge
- Thumbnail generation (add later if needed, reusing `id_photo_thumbs` pattern)

## Future work (post-v1)

- **Certificate generation:** batch-resolve `award_image` for selected students; render photo slot or placeholder when null
- **ID card export:** switch from direct `User.id_photo` reads to `resolve_user_image(user, "id_image")`
- Additional `image_type` enum values as new features require them

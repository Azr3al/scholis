# Staff Certifications & Public Profile — Plan 2: Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Public Profile to all staff, add certifications management UI, inline live preview panel, `/people/{slug}` public page, and delete `/teachers/[slug]`.

**Architecture:** Next.js App Router (`schedjuice-reimagined-fe`). Refactor `public-teacher-profile-view.tsx` into composable presentation components shared by the public page and inline preview. Certifications use React Query against new BE endpoints. Staff gating via existing `hasStaffRole` helper.

**Tech Stack:** Next.js, React, TanStack Query, react-hook-form, TipTap, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-05-staff-certifications-public-profile-design.md`  
**Depends on:** `schedjuice-reimagined-be/docs/superpowers/plans/2026-07-05-staff-certifications-public-profile-1-backend.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/types/user-certification.ts` (NEW) | Zod schema + TS types |
| `src/helpers/role.ts` | Already has `hasStaffRole` — reuse |
| `src/lib/custom-fields/build-form-sections.ts` | Gate public profile on staff, not teacher |
| `src/components/users/user-form-utils.ts` | Staff public profile payload keys |
| `src/components/users/profile/public-profile-shell.tsx` (NEW) | Extracted shell |
| `src/components/users/profile/public-profile-hero.tsx` (NEW) | Hero + role badge |
| `src/components/users/profile/public-profile-qualifications.tsx` (NEW) | Read-only quals |
| `src/components/users/profile/public-profile-certifications.tsx` (NEW) | Cert list/cards |
| `src/components/users/profile/public-profile-view.tsx` (NEW) | Full public page (fetch) |
| `src/components/users/profile/public-profile-preview.tsx` (NEW) | Inline draft preview |
| `src/components/users/user-certifications-section.tsx` (NEW) | CRUD UI + toggle |
| `src/components/users/user-public-profile-fields.tsx` | Wire preview + certs |
| `src/app/(public)/people/[slug]/page.tsx` (NEW) | Public route |
| `src/app/(public)/teachers/[slug]/page.tsx` | **DELETE** |
| `src/components/record/sections/record-academic.tsx` | Staff gate for RecordPublicProfile |
| `src/components/users/user-form.tsx` | Pass `subjectIsStaff` to sections |
| `src/types/user.ts` | Add `show_certifications_on_public_profile` |
| `src/components/users/user-form-utils.test.ts` | Update public profile payload tests |

---

## Task 1: Types + API helpers

**Files:**
- Create: `src/types/user-certification.ts`
- Create: `src/helpers/user-certifications.ts`

- [ ] **Step 1: Add types**

```typescript
// src/types/user-certification.ts
import { z } from "zod";

export const userCertificationSchema = z.object({
  id: z.number(),
  title: z.string(),
  issuing_organization: z.string(),
  issued_on: z.string(),
  expires_on: z.string().nullable(),
  sort_order: z.number(),
  attachment_id: z.number().nullable().optional(),
  attachment_filename: z.string().nullable().optional(),
  attachment_url: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export type UserCertification = z.infer<typeof userCertificationSchema>;

export const userCertificationInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  issuing_organization: z.string().min(1, "Issuing organization is required"),
  issued_on: z.string().min(1, "Issue date is required"),
  expires_on: z.string().nullable().optional(),
  attachment_id: z.number().nullable().optional(),
});

export type UserCertificationInput = z.infer<typeof userCertificationInputSchema>;

export const publicCertificationSchema = z.object({
  title: z.string(),
  issuing_organization: z.string(),
  issued_on: z.string(),
  expires_on: z.string().nullable(),
  file_url: z.string().nullable().optional(),
  file_filename: z.string().nullable().optional(),
});

export type PublicCertification = z.infer<typeof publicCertificationSchema>;

export const publicProfileSchema = z.object({
  name: z.string(),
  role_label: z.string(),
  profile_image_url: z.string().nullable(),
  qualifications: z.record(z.unknown()).nullable(),
  certifications: z.array(publicCertificationSchema).optional(),
});

export type PublicProfile = z.infer<typeof publicProfileSchema>;
```

- [ ] **Step 2: Add API helpers**

```typescript
// src/helpers/user-certifications.ts
import { axiosInstance } from "@/helpers/axios";
import type { UserCertification, UserCertificationInput } from "@/types/user-certification";

export async function fetchUserCertifications(userId: number): Promise<UserCertification[]> {
  const res = await axiosInstance.get<{ data: UserCertification[] }>(
    `/users/${userId}/certifications`,
  );
  return res.data.data ?? [];
}

export async function createUserCertification(
  userId: number,
  input: UserCertificationInput,
): Promise<UserCertification> {
  const res = await axiosInstance.post<{ data: UserCertification }>(
    `/users/${userId}/certifications`,
    input,
  );
  return res.data.data;
}

export async function updateUserCertification(
  userId: number,
  certId: number,
  input: Partial<UserCertificationInput>,
): Promise<UserCertification> {
  const res = await axiosInstance.patch<{ data: UserCertification }>(
    `/users/${userId}/certifications/${certId}`,
    input,
  );
  return res.data.data;
}

export async function deleteUserCertification(userId: number, certId: number): Promise<void> {
  await axiosInstance.delete(`/users/${userId}/certifications/${certId}`);
}
```

Adjust import path for axios to match project convention (`@/app/client-api/utils` or `@/helpers/axios` — grep `axiosInstance` before implementing).

- [ ] **Step 3: Commit**

```bash
git add src/types/user-certification.ts src/helpers/user-certifications.ts
git commit -m "feat(fe): add user certification types and API helpers"
```

---

## Task 2: Staff eligibility + form utils

**Files:**
- Modify: `src/lib/custom-fields/build-form-sections.ts`
- Modify: `src/components/users/user-form-utils.ts`
- Modify: `src/types/user.ts`
- Modify: `src/components/users/user-form-utils.test.ts`

- [ ] **Step 1: Update `build-form-sections.ts`**

Replace `subjectIsTeacher?: boolean` with `subjectIsStaff?: boolean`:

```typescript
    if (opts.subjectIsStaff) {
      sections.push({
        kind: "public_profile",
        id: "public_profile",
        title: "Public Profile",
        description:
          "Share your name, photo, qualifications, and certifications with anyone via a public link.",
      });
    }
```

- [ ] **Step 2: Update `user-form-utils.ts`**

Replace teacher-only helpers:

```typescript
import { hasStaffRole } from "@/helpers/role";

const PUBLIC_PROFILE_PAYLOAD_KEYS = [
  "qualifications",
  "is_public_profile_enabled",
  "show_certifications_on_public_profile",
  "public_profile_slug",
] as const;

export const PUBLIC_PROFILE_EXPLICIT_SAVE_KEYS = [
  "qualifications",
  "is_public_profile_enabled",
  "show_certifications_on_public_profile",
] as const;

export function omitPublicProfileUnlessStaff(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (hasStaffRole(payload.roles as string[] | undefined)) {
    delete payload.public_profile_slug;
    return payload;
  }
  for (const key of PUBLIC_PROFILE_PAYLOAD_KEYS) {
    delete payload[key];
  }
  return payload;
}
```

Rename call in `prepareUserFormPayload`: `omitPublicProfileUnlessTeacher` → `omitPublicProfileUnlessStaff`.

Add to `src/types/user.ts` account schema:

```typescript
show_certifications_on_public_profile: z.boolean().optional(),
```

- [ ] **Step 3: Update callers**

In `src/components/users/user-form.tsx`:

```typescript
import { hasStaffRole } from "@/helpers/role";

const subjectIsStaff = hasStaffRole(effectiveSubjectRoles);
// pass subjectIsStaff to buildFormSections
```

In `src/components/record/sections/record-academic.tsx`:

```typescript
import { hasStaffRole } from "@/helpers/role";

const subjectIsStaff = hasStaffRole(user.roles);
// replace subjectIsTeacher checks for RecordPublicProfile gate
```

- [ ] **Step 4: Update tests**

In `user-form-utils.test.ts`, replace teacher-only cases with staff role cases (HR user keeps public profile keys; student-only omits them).

Run: `npm test -- user-form-utils.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/custom-fields/build-form-sections.ts src/components/users/user-form-utils.ts src/types/user.ts src/components/users/user-form.tsx src/components/record/sections/record-academic.tsx src/components/users/user-form-utils.test.ts
git commit -m "feat(fe): expand public profile eligibility to all staff"
```

---

## Task 3: Refactor public profile presentation components

**Files:**
- Create: `src/components/users/profile/public-profile-shell.tsx`
- Create: `src/components/users/profile/public-profile-hero.tsx`
- Create: `src/components/users/profile/public-profile-qualifications.tsx`
- Create: `src/components/users/profile/public-profile-certifications.tsx`
- Create: `src/components/users/profile/public-profile-view.tsx`
- Delete: `src/components/users/profile/public-teacher-profile-view.tsx`

- [ ] **Step 1: Extract components from existing `public-teacher-profile-view.tsx`**

Move `PublicProfileShell`, hero card, qualifications card into separate files. Update hero badge to use `roleLabel` prop instead of hardcoded `"Teacher"`.

`public-profile-certifications.tsx` renders cert cards:

```typescript
export function PublicProfileCertifications({
  certifications,
}: {
  certifications: PublicCertification[];
}) {
  if (!certifications.length) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
        No certifications to show.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {certifications.map((cert) => (
        <li key={`${cert.title}-${cert.issued_on}`} className="rounded-lg border border-border/60 p-4">
          <p className="font-medium">{cert.title}</p>
          <p className="text-sm text-muted-foreground">{cert.issuing_organization}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Issued {cert.issued_on}
            {cert.expires_on ? ` · Expires ${cert.expires_on}` : ""}
          </p>
          {cert.file_url ? (
            <a href={cert.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary mt-2 inline-block">
              {cert.file_filename ?? "View file"}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Create `public-profile-view.tsx`**

Fetch from `${apiBase}/public/people/${slug}` (not `/public/teachers/`). Parse with `publicProfileSchema`. Compose shell + hero + qualifications + certifications (when array non-empty).

- [ ] **Step 3: Delete old file and update imports**

Remove `public-teacher-profile-view.tsx`. Grep for imports and update to `public-profile-view`.

- [ ] **Step 4: Commit**

```bash
git add src/components/users/profile/
git rm src/components/users/profile/public-teacher-profile-view.tsx
git commit -m "refactor(fe): generalize public profile presentation components"
```

---

## Task 4: Inline preview panel

**Files:**
- Create: `src/components/users/profile/public-profile-preview.tsx`
- Modify: `src/components/users/user-public-profile-fields.tsx`

- [ ] **Step 1: Create preview component**

```typescript
"use client";

import { PublicProfileShell } from "./public-profile-shell";
import { PublicProfileHero } from "./public-profile-hero";
import { PublicProfileQualifications } from "./public-profile-qualifications";
import { PublicProfileCertifications } from "./public-profile-certifications";
import type { PublicCertification } from "@/types/user-certification";
import type { JSONContent } from "@tiptap/core";

export type PublicProfilePreviewProps = {
  name: string;
  roleLabel: string;
  profileImageUrl: string | null;
  qualifications: JSONContent | null;
  showCertifications: boolean;
  certifications: PublicCertification[];
  enabled: boolean;
  tenant: { name?: string; logo?: string | null; tagline?: string } | null;
};

export function PublicProfilePreview(props: PublicProfilePreviewProps) {
  const certs = props.showCertifications ? props.certifications : [];
  return (
    <div className="relative rounded-xl border border-border/60 overflow-hidden">
      <div className="absolute inset-x-0 top-0 z-10 bg-muted/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        Preview — this is how your public profile will look
      </div>
      <div className={props.enabled ? "" : "opacity-50 pointer-events-none"}>
        <PublicProfileShell tenant={props.tenant}>
          <PublicProfileHero
            name={props.name}
            roleLabel={props.roleLabel}
            profileImageUrl={props.profileImageUrl}
            tenantName={props.tenant?.name ?? null}
          />
          <PublicProfileQualifications qualifications={props.qualifications} />
          {props.showCertifications ? (
            <section className="mt-6">
              <h2 className="text-lg font-semibold mb-3">Certifications</h2>
              <PublicProfileCertifications certifications={certs} />
            </section>
          ) : null}
        </PublicProfileShell>
      </div>
      {!props.enabled ? (
        <p className="absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">
          Enable public profile to publish this page.
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `user-public-profile-fields.tsx`**

Add props: `subject`, `tenant`, `certifications`, `roleLabel`.

Update share URL:

```typescript
const shareUrl = slug && origin ? `${origin}/people/${slug}` : "";
```

Place `<PublicProfilePreview />` after the enable toggle, fed by `form.watch()` values and certifications prop.

- [ ] **Step 3: Commit**

```bash
git add src/components/users/profile/public-profile-preview.tsx src/components/users/user-public-profile-fields.tsx
git commit -m "feat(fe): add inline public profile preview panel"
```

---

## Task 5: Certifications management UI

**Files:**
- Create: `src/components/users/user-certifications-section.tsx`

- [ ] **Step 1: Build section component**

Uses:
- `useQuery` → `fetchUserCertifications(userId)`
- `useMutation` for create/update/delete with query invalidation
- Dialog form with `userCertificationInputSchema` (react-hook-form + zod)
- `AttachmentUploader` with `table_name="user_certification"` and `foreignKey={String(userId)}`
- Accept: `.pdf,.png,.jpg,.jpeg,.webp`, max 10 MB

On successful upload, store returned attachment id in form state as `attachment_id`.

List shows edit/delete actions. Delete confirms via `AlertDialog`.

- [ ] **Step 2: Integrate in `user-public-profile-fields.tsx`**

Below qualifications editor:

```typescript
<FormField
  control={form.control}
  name="show_certifications_on_public_profile"
  render={({ field }) => (
    <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-0.5">
        <FormLabel>Show certifications on public profile</FormLabel>
        <FormDescription>
          When enabled, your certification list appears on your public profile page.
        </FormDescription>
      </div>
      <FormControl>
        <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
      </FormControl>
    </FormItem>
  )}
/>

<UserCertificationsSection userId={subject.id} canEdit={canEdit} onChange={setLocalCerts} />
```

Pass certification list up to preview via callback or shared query key.

- [ ] **Step 3: Commit**

```bash
git add src/components/users/user-certifications-section.tsx src/components/users/user-public-profile-fields.tsx
git commit -m "feat(fe): add certifications CRUD section to public profile editor"
```

---

## Task 6: Public route swap

**Files:**
- Create: `src/app/(public)/people/[slug]/page.tsx`
- Delete: `src/app/(public)/teachers/[slug]/page.tsx`

- [ ] **Step 1: Add people page**

```typescript
"use client";

import { PublicProfileView } from "@/components/users/profile/public-profile-view";
import { useParams } from "next/navigation";

export default function PublicProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  return <PublicProfileView slug={slug} />;
}
```

- [ ] **Step 2: Delete teachers page**

```bash
git rm src/app/\(public\)/teachers/\[slug\]/page.tsx
```

Remove empty `teachers` directory if unused.

- [ ] **Step 3: Grep for stale `/teachers/` references**

Update any remaining share links, tests, changelog stubs.

- [ ] **Step 4: Commit**

```bash
git add src/app/(public)/people/
git commit -m "feat(fe): move public profile route to /people/[slug]"
```

---

## Task 7: Role label helper for preview

**Files:**
- Modify: `src/helpers/role.ts` (or use existing `formatRoleLabel`)

- [ ] **Step 1: Add primary staff role label**

```typescript
import { role } from "@/types/user";

const ROLE_PRIORITY: role[] = [
  role.superadmin,
  role.admin,
  role.manager,
  role.finance,
  role.hr,
  role.teacher,
];

export function primaryStaffRoleLabel(roles: string[] | undefined | null): string {
  const set = new Set(roles ?? []);
  for (const r of ROLE_PRIORITY) {
    if (set.has(r)) return formatRoleLabel(r);
  }
  const first = (roles ?? []).find((r) => r !== role.student);
  return first ? formatRoleLabel(first) : "Staff";
}
```

Use in preview + pass through from subject roles.

- [ ] **Step 2: Commit**

```bash
git add src/helpers/role.ts
git commit -m "feat(fe): add primary staff role label helper"
```

---

## Task 8: Verification

- [ ] **Step 1: Run FE unit tests**

```bash
npm test -- user-form-utils.test.ts
```

- [ ] **Step 2: Manual smoke test**

1. Open HR staff user record → Academic → Public Profile section visible
2. Add certification with PDF → appears in list
3. Toggle "Show certifications" → preview updates
4. Save public profile → copy link shows `/people/{slug}`
5. Visit `/people/{slug}` → profile renders with role badge "HR"
6. Visit `/teachers/{slug}` → 404

- [ ] **Step 3: Changelog entry**

Add entry to `src/content/changelog/entries.ts` for staff public profiles, certifications, preview, URL change.

---

## Handoff to Plan 3

After Plans 1 + 2 ship, implement `2026-07-05-qualifications-inline-images.md` for TipTap paste/drop image support.

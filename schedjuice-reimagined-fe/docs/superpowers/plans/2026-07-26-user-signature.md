# Staff E-Signature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff draw and save a transparent PNG e-signature on their profile (Overview section), stored as `User.user_signature`, with self-only write access and read-only viewing for admins.

**Architecture:** Add `user_signature` `ImageField` on backend with serializer self-only guard and presigned `user_signature_url`. Frontend uses `signature_pad` to capture strokes, exports PNG via a small helper, uploads through existing `updateEntity` FormData flow, and renders preview in a new Overview section.

**Tech Stack:** Django REST + `PrivateMediaStorage` (`schedjuice-reimagined-be`); Next.js + TanStack Query + Vitest + `signature_pad` (`schedjuice-reimagined-fe`).

**Spec:** `docs/superpowers/specs/2026-07-26-user-signature-design.md`

## Global Constraints

- Storage: `User.user_signature` — `ImageField`, private S3, tenant path `{tenant}/user_signatures/`.
- Image format: transparent PNG (ink only).
- Who can set/change: **subject only** — admin cannot override (403).
- Who can view: anyone with profile access; admins see read-only on other staff.
- Replace / clear: self can re-draw or clear at any time.
- Required: optional — no prompts.
- Staff scope: `isStaffSubject` / `user_is_staff`; hidden for students.
- Document injection: **out of scope**.
- Backend tests: `./scripts/run_backend_tests.sh <target>` (always `--keepdb`; never dev DB).
- Frontend tests: `pnpm run test:unit -- <path>` from `schedjuice-reimagined-fe/`.
- High-value tests only — auth denials, wrong actor, empty pad, staff/student gates.

---

## File Structure

| Repo | File | Action | Responsibility |
| --- | --- | --- | --- |
| BE | `app_auth/models.py` | Modify | `user_signature` field + upload helper |
| BE | `app_auth/migrations/00XX_user_user_signature.py` | Create | Nullable image column |
| BE | `app_auth/serializers.py` | Modify | `user_signature_url`, self-only validate guard |
| BE | `app_auth/tests/test_user_signature.py` | Create | API permission + upload/clear tests |
| FE | `package.json` | Modify | Add `signature_pad` dependency |
| FE | `src/types/user.ts` | Modify | `user_signature_url` on account schema |
| FE | `src/helpers/authorization.ts` | Modify | `canEditUserSignature` |
| FE | `src/helpers/authorization-signature.test.ts` | Create | Permission matrix tests |
| FE | `src/lib/user/signature-export.ts` | Create | PNG data URL → `File` helper |
| FE | `src/lib/user/signature-export.test.ts` | Create | Export helper tests |
| FE | `src/hooks/use-user-signature-upload.ts` | Create | Upload + clear mutations |
| FE | `src/components/users/user-signature-pad.tsx` | Create | `signature_pad` canvas wrapper |
| FE | `src/components/users/user-signature-dialog.tsx` | Create | Draw dialog + save |
| FE | `src/components/users/user-signature-section.tsx` | Create | Overview preview + actions |
| FE | `src/components/record/sections/record-overview.tsx` | Modify | Render section for staff |

---

## Task 1: Backend model + migration

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/models.py`
- Create: `schedjuice-reimagined-be/app_auth/migrations/00XX_user_user_signature.py` (exact number from `makemigrations`)

**Interfaces:**
- Produces: `User.user_signature` nullable `ImageField`; upload folder helper `get_tenant_specific_upload_folder_for_user_signature`.

- [ ] **Step 1: Add upload helper and field**

In `app_auth/models.py`, after `get_tenant_specific_upload_folder_for_id_photo`:

```python
def get_tenant_specific_upload_folder_for_user_signature(instance, filename):
    return get_tenant_specific_upload_folder(filename, "user_signatures")
```

After `id_photo_thumb` field block, add:

```python
user_signature = models.ImageField(
    upload_to=get_tenant_specific_upload_folder_for_user_signature,
    null=True,
    blank=True,
    storage=PrivateMediaStorage(),
)
```

- [ ] **Step 2: Create migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_auth --name user_user_signature
./env/bin/python manage.py migrate_schemas --noinput
```

Expected: migration adds nullable `user_signature` column.

- [ ] **Step 3: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/models.py app_auth/migrations/
git commit -m "feat(auth): add user_signature ImageField on User"
```

---

## Task 2: Backend serializer + API tests

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/serializers.py`
- Create: `schedjuice-reimagined-be/app_auth/tests/test_user_signature.py`

**Interfaces:**
- Consumes: `User.user_signature` from Task 1.
- Produces:
  - Read: `user_signature_url` on user detail responses.
  - Write guard: only subject staff can set/clear `user_signature`.

- [ ] **Step 1: Write failing tests**

Create `app_auth/tests/test_user_signature.py`:

```python
import io
import unittest
from datetime import date
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _make_png() -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGBA", (120, 60), color=(0, 0, 0, 255)).save(buf, format="PNG")
    return SimpleUploadedFile("signature.png", buf.getvalue(), content_type="image/png")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserSignatureApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.client = APIClient()
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"sig-adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"sig-adm-{suffix}@example.com",
                code=f"SIG-ADM-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"sig-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="2",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"sig-tch-{suffix}@example.com",
                code=f"SIG-TCH-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"sig-stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="3",
                date_of_birth=date(2005, 1, 1),
                communication_email=f"sig-stu-{suffix}@example.com",
                code=f"SIG-STU-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

    def _patch_user(self, actor: User, subject_id: int, data, *, multipart=False):
        self.client.force_authenticate(user=actor)
        fmt = "multipart" if multipart else "json"
        return self.client.patch(
            f"{self.api_prefix}/users/{subject_id}",
            data,
            format=fmt,
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )

    def test_staff_self_upload_sets_signature_url(self):
        res = self._patch_user(
            self.teacher,
            self.teacher.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.data["data"]["user_signature_url"])

    def test_admin_cannot_upload_for_other_user(self):
        res = self._patch_user(
            self.admin,
            self.teacher.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.assertEqual(res.status_code, 403, res.content)

    def test_student_cannot_set_signature(self):
        res = self._patch_user(
            self.student,
            self.student.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.assertIn(res.status_code, (400, 403), res.content)

    def test_staff_self_can_clear_signature(self):
        upload = self._patch_user(
            self.teacher,
            self.teacher.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.assertEqual(upload.status_code, 200, upload.content)

        cleared = self._patch_user(
            self.teacher,
            self.teacher.id,
            {"user_signature": None},
        )
        self.assertEqual(cleared.status_code, 200, cleared.content)
        self.assertIsNone(cleared.data["data"]["user_signature_url"])

    def test_admin_can_read_other_staff_signature_url(self):
        self._patch_user(
            self.teacher,
            self.teacher.id,
            {"user_signature": _make_png()},
            multipart=True,
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            f"{self.api_prefix}/users/{self.teacher.id}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.data["data"]["user_signature_url"])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_user_signature
```

Expected: FAIL — missing `user_signature_url` or 403/validation not enforced yet.

- [ ] **Step 3: Implement serializer changes**

In `app_auth/serializers.py`, add imports:

```python
from rest_framework.exceptions import PermissionDenied
from app_auth.staff_helpers import user_is_staff
```

Add field next to `profile_image_url`:

```python
user_signature_url = serializers.SerializerMethodField(read_only=True)

def get_user_signature_url(self, obj):
    return self._signed_url(obj.user_signature)
```

In `UserSerializer.validate()`, before the final `return attrs` (after existing validation blocks), add:

```python
if "user_signature" in attrs and self.instance is not None:
    req_user = acting_user(request) if request is not None else None
    if req_user is None or req_user.id != self.instance.id:
        raise PermissionDenied("Only the user can set their own signature.")
    if not user_is_staff(self.instance):
        raise ValidationError(
            {"user_signature": "Signatures are for staff only."}
        )
```

(`acting_user` is already imported in this file.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_user_signature
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/serializers.py app_auth/tests/test_user_signature.py
git commit -m "feat(auth): self-only user_signature upload with presigned URL"
```

---

## Task 3: Frontend types + authorization helper

**Files:**
- Modify: `schedjuice-reimagined-fe/package.json`
- Modify: `schedjuice-reimagined-fe/src/types/user.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/authorization.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/authorization-signature.test.ts`

**Interfaces:**
- Produces: `canEditUserSignature(viewer, subject) -> boolean`; `user_signature_url` on `accountType`.

- [ ] **Step 1: Write failing authorization tests**

Create `src/helpers/authorization-signature.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { canEditUserSignature } from "@/helpers/authorization";
import { role, type accountType } from "@/types/user";

function user(
  id: number,
  roles: role[],
  overrides: Partial<accountType> = {},
): accountType {
  return { id, roles, ...overrides } as accountType;
}

describe("canEditUserSignature", () => {
  it("allows staff editing their own signature", () => {
    const teacher = user(2, [role.teacher]);
    expect(canEditUserSignature(teacher, teacher)).toBe(true);
  });

  it("denies admin editing another user's signature", () => {
    const admin = user(1, [role.admin]);
    const teacher = user(2, [role.teacher]);
    expect(canEditUserSignature(admin, teacher)).toBe(false);
  });

  it("denies student editing their own signature", () => {
    const student = user(5, [role.student]);
    expect(canEditUserSignature(student, student)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
pnpm run test:unit -- src/helpers/authorization-signature.test.ts
```

Expected: FAIL — `canEditUserSignature` not exported.

- [ ] **Step 3: Add dependency, type, and helper**

Install:

```bash
cd schedjuice-reimagined-fe
pnpm add signature_pad
```

In `src/types/user.ts`, after `profile_image_url`:

```typescript
user_signature_url: z.string().nullable().optional(),
```

In `src/helpers/authorization.ts`, import `isStaffSubject` from `@/lib/points/visibility` and add:

```typescript
export const canEditUserSignature = (
  viewer: accountType,
  subject: Pick<accountType, "id" | "roles">,
) => viewer.id === subject.id && isStaffSubject(subject);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-fe
pnpm run test:unit -- src/helpers/authorization-signature.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add package.json pnpm-lock.yaml src/types/user.ts src/helpers/authorization.ts src/helpers/authorization-signature.test.ts
git commit -m "feat(fe): add canEditUserSignature and user_signature_url type"
```

---

## Task 4: Signature PNG export helper

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/user/signature-export.ts`
- Create: `schedjuice-reimagined-fe/src/lib/user/signature-export.test.ts`

**Interfaces:**
- Produces: `dataUrlToPngFile(dataUrl: string, filename?: string): File`

- [ ] **Step 1: Write failing tests**

Create `src/lib/user/signature-export.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { dataUrlToPngFile } from "@/lib/user/signature-export";

describe("dataUrlToPngFile", () => {
  it("converts a PNG data URL to a File", () => {
    const pixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const file = dataUrlToPngFile(pixel, "signature.png");
    expect(file.name).toBe("signature.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBeGreaterThan(0);
  });

  it("rejects non-PNG data URLs", () => {
    expect(() =>
      dataUrlToPngFile("data:image/jpeg;base64,abc", "signature.png"),
    ).toThrow(/png/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
pnpm run test:unit -- src/lib/user/signature-export.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

Create `src/lib/user/signature-export.ts`:

```typescript
export function dataUrlToPngFile(
  dataUrl: string,
  filename = "signature.png",
): File {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Expected a PNG data URL");
  }
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: "image/png" });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-fe
pnpm run test:unit -- src/lib/user/signature-export.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/user/signature-export.ts src/lib/user/signature-export.test.ts
git commit -m "feat(fe): add PNG data URL to File helper for signatures"
```

---

## Task 5: Upload/clear hook

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/use-user-signature-upload.ts`

**Interfaces:**
- Consumes: `updateEntity`, `axiosClient.patch`, `dataUrlToPngFile`.
- Produces:
  - `uploadSignature(dataUrl: string): Promise<void>`
  - `clearSignature(): Promise<void>`
  - `busy: boolean`

- [ ] **Step 1: Implement hook**

Create `src/hooks/use-user-signature-upload.ts`:

```typescript
"use client";

import { updateEntity } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import { dataUrlToPngFile } from "@/lib/user/signature-export";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useUserSignatureUpload({
  userId,
  queryKey,
}: {
  userId: number;
  queryKey: unknown[];
}) {
  const qc = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (dataUrl: string) => {
      const file = dataUrlToPngFile(dataUrl);
      const formData = new FormData();
      formData.append("user_signature", file);
      await updateEntity("users", userId, formData);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await axiosClient.patch(`users/${userId}`, { user_signature: null });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    uploadSignature: uploadMutation.mutateAsync,
    clearSignature: clearMutation.mutateAsync,
    busy: uploadMutation.isPending || clearMutation.isPending,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd schedjuice-reimagined-fe
pnpm run typecheck
```

Expected: no errors referencing the new hook.

- [ ] **Step 3: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/hooks/use-user-signature-upload.ts
git commit -m "feat(fe): add useUserSignatureUpload hook"
```

---

## Task 6: Signature pad + dialog + section UI

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/users/user-signature-pad.tsx`
- Create: `schedjuice-reimagined-fe/src/components/users/user-signature-dialog.tsx`
- Create: `schedjuice-reimagined-fe/src/components/users/user-signature-section.tsx`

**Interfaces:**
- Consumes: `useUserSignatureUpload`, `canEditUserSignature`, `signature_pad`, `Dialog`, `Button`, `AlertDialog`, `useToast`.
- Produces: exported `UserSignatureSection` for Overview.

- [ ] **Step 1: Implement `UserSignaturePad`**

Create `src/components/users/user-signature-pad.tsx`:

```tsx
"use client";

import SignaturePad from "signature_pad";
import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

export type UserSignaturePadHandle = {
  isEmpty: () => boolean;
  clear: () => void;
  toPngDataUrl: () => string;
};

type UserSignaturePadProps = {
  className?: string;
  onStrokeEnd?: () => void;
};

export const UserSignaturePad = forwardRef<UserSignaturePadHandle, UserSignaturePadProps>(
  function UserSignaturePad({ className, onStrokeEnd }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const padRef = useRef<SignaturePad | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const resize = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        const ctx = canvas.getContext("2d");
        ctx?.scale(ratio, ratio);
        padRef.current?.clear();
      };

      padRef.current = new SignaturePad(canvas, {
        penColor: "#000000",
        backgroundColor: "rgba(0,0,0,0)",
        minWidth: 0.8,
        maxWidth: 2.4,
      });
      padRef.current.addEventListener("endStroke", () => onStrokeEnd?.());

      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      return () => {
        observer.disconnect();
        padRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      clear: () => padRef.current?.clear(),
      toPngDataUrl: () => padRef.current?.toDataURL("image/png") ?? "",
    }));

    return (
      <canvas
        ref={canvasRef}
        className={className}
        aria-label="Signature drawing area"
      />
    );
  },
);
```

- [ ] **Step 2: Implement `UserSignatureDialog`**

Create `src/components/users/user-signature-dialog.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Button, useToast } from "@/components/primitives";
import { Dialog } from "@/components/primitives/dialog";
import { useUserSignatureUpload } from "@/hooks/use-user-signature-upload";
import {
  UserSignaturePad,
  type UserSignaturePadHandle,
} from "@/components/users/user-signature-pad";

export function UserSignatureDialog({
  open,
  onOpenChange,
  userId,
  queryKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  queryKey: unknown[];
}) {
  const toast = useToast();
  const padRef = useRef<UserSignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);
  const { uploadSignature, busy } = useUserSignatureUpload({ userId, queryKey });

  const refreshEmpty = () => setEmpty(padRef.current?.isEmpty() ?? true);

  const handleSave = async () => {
    if (padRef.current?.isEmpty()) return;
    try {
      await uploadSignature(padRef.current.toPngDataUrl());
      onOpenChange(false);
    } catch {
      toast.add({
        title: "Could not save signature",
        description: "Please try again later if the problem persists.",
      });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-xl">
          <Dialog.Title>Draw your signature</Dialog.Title>
          <Dialog.Description>Sign in the box below</Dialog.Description>

          <div className="mt-4 rounded-md border border-border bg-background p-2">
            <UserSignaturePad
              ref={padRef}
              className="h-[200px] w-full touch-none"
              onStrokeEnd={refreshEmpty}
            />
          </div>

          <div className="mt-4 flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                padRef.current?.clear();
                refreshEmpty();
              }}
            >
              Clear pad
            </Button>
            <div className="flex gap-2">
              <Dialog.Close render={<Button type="button" variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button
                type="button"
                disabled={busy || empty}
                onClick={() => void handleSave()}
              >
                Save
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Add optional `onStrokeEnd?: () => void` prop to `UserSignaturePad` — call it from a `signature_pad` `"endStroke"` listener registered in the `useEffect` after constructing the pad.

- [ ] **Step 3: Implement `UserSignatureSection`**

Create `src/components/users/user-signature-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/primitives";
import { AlertDialog } from "@/components/primitives";
import { RecordSection } from "@/components/record/record-section";
import { canEditUserSignature } from "@/helpers/authorization";
import { useUserSignatureUpload } from "@/hooks/use-user-signature-upload";
import type { accountType } from "@/types/user";
import { UserSignatureDialog } from "./user-signature-dialog";
import { cn } from "@/lib/utils";

const CHECKERBOARD =
  "bg-[linear-gradient(45deg,#e5e5e5_25%,transparent_25%),linear-gradient(-45deg,#e5e5e5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e5e5_75%),linear-gradient(-45deg,transparent_75%,#e5e5e5_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]";

export function UserSignatureSection({
  subject,
  viewer,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  recordQueryKey: unknown[];
}) {
  const canEdit = canEditUserSignature(viewer, subject);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const { clearSignature, busy } = useUserSignatureUpload({
    userId: subject.id,
    queryKey: recordQueryKey,
  });
  const url = subject.user_signature_url ?? null;

  return (
    <RecordSection title="Signature">
      <div
        className={cn(
          "relative flex min-h-[120px] max-w-md items-center justify-center rounded-md border border-border p-4",
          url ? CHECKERBOARD : "bg-muted/30",
        )}
      >
        {url ? (
          <Image
            src={url}
            alt={`${subject.name ?? "User"} signature`}
            width={480}
            height={172}
            className="max-h-28 w-auto object-contain"
            unoptimized
          />
        ) : (
          <p className="text-sm text-muted-foreground">No signature</p>
        )}
      </div>

      {canEdit ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setDialogOpen(true)}>
            Draw signature
          </Button>
          {url ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmClearOpen(true)}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      <UserSignatureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={subject.id}
        queryKey={recordQueryKey}
      />

      <AlertDialog.Root open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Remove signature?</AlertDialog.Title>
            <AlertDialog.Description>
              Your saved signature will be removed from your profile.
            </AlertDialog.Description>
            <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              render={
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void clearSignature()}
                />
              }
            >
              Remove
            </AlertDialog.Close>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </RecordSection>
  );
}
```

(Flesh out `UserSignatureDialog` in Step 2 with the same primitives used elsewhere — match `RecordImageUploadDialog` toast copy style.)

- [ ] **Step 4: Typecheck + lint touched files**

```bash
cd schedjuice-reimagined-fe
pnpm run typecheck
pnpm run lint -- src/components/users/user-signature-pad.tsx src/components/users/user-signature-dialog.tsx src/components/users/user-signature-section.tsx
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/users/user-signature-*.tsx
git commit -m "feat(fe): add signature pad, dialog, and profile section"
```

---

## Task 7: Wire Overview section

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/record/sections/record-overview.tsx`

**Interfaces:**
- Consumes: `UserSignatureSection`, `isStaffSubject`.

- [ ] **Step 1: Render section for staff subjects**

In `record-overview.tsx`, add imports:

```typescript
import { UserSignatureSection } from "@/components/users/user-signature-section";
import { isStaffSubject } from "@/lib/points/visibility";
```

Inside the returned JSX, after the Profile `RecordSection` block and before `UserConnectorsSection`:

```tsx
{isStaffSubject(subject) ? (
  <UserSignatureSection
    subject={subject}
    viewer={viewer}
    recordQueryKey={recordQueryKey}
  />
) : null}
```

- [ ] **Step 2: Verify manually**

1. Start BE + FE dev servers.
2. Open own staff profile → Overview → draw and save signature.
3. Open same profile as admin → see signature, no Draw/Clear buttons.
4. Clear signature as self → preview shows "No signature".
5. Open student profile → no Signature section.

- [ ] **Step 3: Run targeted tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_user_signature

cd schedjuice-reimagined-fe
pnpm run test:unit -- src/helpers/authorization-signature.test.ts src/lib/user/signature-export.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/record/sections/record-overview.tsx
git commit -m "feat(fe): show staff signature section in profile overview"
```

---

## Plan self-review

| Spec requirement | Task |
|---|---|
| `user_signature` ImageField + tenant path | Task 1 |
| Presigned `user_signature_url` | Task 2 |
| Self-only write; admin 403 | Task 2 tests + validate |
| Student blocked | Task 2 test |
| Clear via null | Task 2 test + hook |
| `signature_pad` dependency | Task 3 |
| Transparent PNG export | Task 4 + pad options |
| Overview section staff-only | Task 7 |
| Read-only for admin viewing other | Task 6 (`canEdit` gate) |
| Document injection out of scope | Not included |
| High-value tests only | Tasks 2, 3, 4 |

No placeholders remain. Type names consistent: `canEditUserSignature`, `user_signature_url`, `useUserSignatureUpload`, `UserSignatureSection`.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-26-user-signature.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?

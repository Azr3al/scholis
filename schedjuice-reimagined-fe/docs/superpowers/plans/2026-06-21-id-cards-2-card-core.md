# ID Cards — Plan 2: Card Core (view-model, QR, card face) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single source of truth for the badge: a pure `buildIdCard` view-model, a QR generator, verify-URL helper, dimension constants, and the `IdCardFace` SVG component reused by the 3D badge and every export.

**Architecture:** Pure, framework-agnostic helpers in `src/lib/id-card/*` (unit-tested with Vitest, node env), plus one presentational SVG component `IdCardFace` (no data fetching, no side effects). `buildIdCard` maps `accountType` + `organizationType` → `CardViewModel` (resolves photo, role→accent with tenant override, org name/logo fallback, emergency block, blood type, initials). QR is generated async (`qrcode`) to a PNG data URL embedded as an `<image>` in the SVG. Repo: `schedjuice-reimagined-fe`.

**Tech Stack:** TypeScript, React 19, Tailwind v4, `qrcode`, Vitest. Conventions: `no-chained-ternary`, `backend-api-snake-case`, `concise-ui-copy`, `cn()`.

**Spec:** `docs/superpowers/specs/2026-06-21-id-cards-design.md` (§4 content, §5 single source of truth, §10 visual).
**Depends on:** Plan 1 (backend exposes `id_photo_url`, `profile_image_url`, `id_verify_token`, `blood_type`, org `id_card_*`).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/types/user.ts` | Add `blood_type`, `id_photo_url`, `profile_image_url`, `id_verify_token` to the account schema |
| `src/types/organization.ts` | Add `id_card_*` branding fields |
| `src/lib/id-card/dimensions.ts` (NEW) | Physical/SVG dimension constants |
| `src/lib/id-card/types.ts` (NEW) | `CardViewModel`, `CardRole` types |
| `src/lib/id-card/build-id-card.ts` (NEW) | `buildIdCard(account, tenant)` pure mapper |
| `src/lib/id-card/build-id-card.test.ts` (NEW) | Unit tests |
| `src/lib/id-card/verify-url.ts` (NEW) | `buildVerifyUrl(origin, token)` |
| `src/lib/id-card/verify-url.test.ts` (NEW) | Unit tests |
| `src/lib/id-card/qr.ts` (NEW) | `generateQrDataUrl(data)` |
| `src/lib/id-card/qr.test.ts` (NEW) | Unit tests |
| `src/components/id-card/id-card-face.tsx` (NEW) | The one SVG card-face component |

**Run a single test:** `npm run test:unit -- src/lib/id-card/build-id-card.test.ts`

---

## Task 1: Install QR dependency and extend FE types

**Files:**
- `package.json`
- Modify: `src/types/user.ts`, `src/types/organization.ts`

- [ ] **Step 1: Install qrcode**

```bash
npm install qrcode --legacy-peer-deps
npm install -D @types/qrcode --legacy-peer-deps
```

(`--legacy-peer-deps` per `AGENTS.md`.)

- [ ] **Step 2: Extend the account schema**

In `src/types/user.ts`, add the new fields to the `accountSchema` extension object (the `z.object({...})` passed to `tempSchema.and(userSettingsSchema).and(...)`, near `public_profile_slug`):

```typescript
    blood_type: z
      .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .nullable()
      .optional(),
    id_photo_url: z.string().nullable().optional(),
    profile_image_url: z.string().nullable().optional(),
    id_verify_token: z.string().nullable().optional(),
```

- [ ] **Step 3: Extend the organization schema**

In `src/types/organization.ts`, add to `organizationSchema` (near `logo`):

```typescript
  id_card_org_name: z.string().nullable().optional(),
  id_card_logo: z.string().nullable().optional(),
  id_card_staff_accent: z.string().nullable().optional(),
  id_card_student_accent: z.string().nullable().optional(),
```

- [ ] **Step 4: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors from these files.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/types/user.ts src/types/organization.ts
git commit -m "feat(id-card): add qrcode dep and id-card fields to FE types"
```

---

## Task 2: Dimension constants

**Files:**
- Create: `src/lib/id-card/dimensions.ts`

- [ ] **Step 1: Implement**

Portrait lanyard badge ≈ CR80 portrait (54 × 86 mm). SVG uses a 10px-per-mm coordinate space (540 × 860). Export rasterizes at 300 DPI.

```typescript
export const CARD_MM = { width: 54, height: 86 } as const;

/** SVG coordinate space: 10 user-units per mm. */
export const CARD_VIEWBOX = { width: 540, height: 860 } as const;

export const EXPORT_DPI = 300;

/** Pixel size of a full-bleed raster at the given DPI (default print DPI). */
export function cardPixelSize(dpi: number = EXPORT_DPI): { width: number; height: number } {
  const pxPerMm = dpi / 25.4;
  return {
    width: Math.round(CARD_MM.width * pxPerMm),
    height: Math.round(CARD_MM.height * pxPerMm),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/id-card/dimensions.ts
git commit -m "feat(id-card): add card dimension constants"
```

---

## Task 3: View-model types

**Files:**
- Create: `src/lib/id-card/types.ts`

- [ ] **Step 1: Implement**

```typescript
export type CardRole = "staff" | "student";

export type CardEmergency = {
  name: string | null;
  phone: string;
  relationship: string | null;
};

export type CardViewModel = {
  name: string;
  email: string;
  roleLabel: string;
  role: CardRole;
  accent: string;
  photoUrl: string | null;
  initials: string;
  orgName: string;
  orgLogoUrl: string | null;
  bloodType: string | null;
  emergency: CardEmergency | null;
  verifyToken: string | null;
};

export const DEFAULT_STAFF_ACCENT = "#5ea37e";
export const DEFAULT_STUDENT_ACCENT = "#d97706";
export const DEFAULT_ORG_LOGO = "/images/logo.png";
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/id-card/types.ts
git commit -m "feat(id-card): add card view-model types"
```

---

## Task 4: `buildIdCard` mapper (TDD)

**Files:**
- Create: `src/lib/id-card/build-id-card.ts`
- Test: `src/lib/id-card/build-id-card.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { buildIdCard, cardRoleLabel } from "./build-id-card";
import { DEFAULT_STAFF_ACCENT, DEFAULT_STUDENT_ACCENT } from "./types";

const account = (over: Record<string, unknown> = {}) =>
  ({
    name: "Thiri Kyaw",
    email: "thiri@example.com",
    phone_number: "+95 9 700000000",
    roles: ["teacher"],
    profile_image: null,
    profile_image_url: null,
    id_photo_url: null,
    blood_type: null,
    emergency_contact_name: null,
    emergency_contact_phone_number: null,
    emergency_contact_relationship: null,
    id_verify_token: "tok_abc",
    ...over,
  }) as never;

const tenant = (over: Record<string, unknown> = {}) =>
  ({ name: "Schedjuice Education", logo: "/logo.png", ...over }) as never;

describe("buildIdCard", () => {
  it("labels a teacher as staff with the staff accent", () => {
    const vm = buildIdCard(account(), tenant());
    expect(vm.role).toBe("staff");
    expect(vm.roleLabel).toBe("Teacher");
    expect(vm.accent).toBe(DEFAULT_STAFF_ACCENT);
  });

  it("labels a student-only user as student with the student accent", () => {
    const vm = buildIdCard(account({ roles: ["student"] }), tenant());
    expect(vm.role).toBe("student");
    expect(vm.roleLabel).toBe("Student");
    expect(vm.accent).toBe(DEFAULT_STUDENT_ACCENT);
  });

  it("prefers id_photo_url, then profile_image_url, then profile_image", () => {
    expect(buildIdCard(account({ id_photo_url: "a", profile_image_url: "b" }), tenant()).photoUrl).toBe("a");
    expect(buildIdCard(account({ profile_image_url: "b", profile_image: "c" }), tenant()).photoUrl).toBe("b");
    expect(buildIdCard(account({ profile_image: "c" }), tenant()).photoUrl).toBe("c");
    expect(buildIdCard(account(), tenant()).photoUrl).toBeNull();
  });

  it("computes initials from the name", () => {
    expect(buildIdCard(account({ name: "Thiri Kyaw" }), tenant()).initials).toBe("TK");
    expect(buildIdCard(account({ name: "Madonna" }), tenant()).initials).toBe("M");
  });

  it("uses tenant accent + org-name/logo overrides when present", () => {
    const vm = buildIdCard(
      account(),
      tenant({
        id_card_staff_accent: "#123456",
        id_card_org_name: "SDEC",
        id_card_logo: "/brand.png",
      }),
    );
    expect(vm.accent).toBe("#123456");
    expect(vm.orgName).toBe("SDEC");
    expect(vm.orgLogoUrl).toBe("/brand.png");
  });

  it("includes emergency only when a phone exists", () => {
    expect(buildIdCard(account(), tenant()).emergency).toBeNull();
    const vm = buildIdCard(
      account({
        emergency_contact_phone_number: "+95 9 711111111",
        emergency_contact_name: "Su Su",
        emergency_contact_relationship: "Sister",
      }),
      tenant(),
    );
    expect(vm.emergency).toEqual({ name: "Su Su", phone: "+95 9 711111111", relationship: "Sister" });
  });

  it("picks the highest-priority staff role for the title", () => {
    expect(buildIdCard(account({ roles: ["teacher", "manager"] }), tenant()).roleLabel).toBe("Manager");
  });
});

describe("cardRoleLabel", () => {
  it("labels a student-only set as Student", () => {
    expect(cardRoleLabel(["student"])).toBe("Student");
  });
  it("labels staff by highest priority", () => {
    expect(cardRoleLabel(["teacher", "admin"])).toBe("Admin");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/id-card/build-id-card.test.ts`
Expected: FAIL — cannot find module `./build-id-card`.

- [ ] **Step 3: Implement `buildIdCard`**

```typescript
import type { accountType } from "@/types/user";
import type { organizationType } from "@/types/organization";
import {
  CardRole,
  CardViewModel,
  DEFAULT_ORG_LOGO,
  DEFAULT_STAFF_ACCENT,
  DEFAULT_STUDENT_ACCENT,
} from "./types";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Admin",
  admin: "Admin",
  manager: "Manager",
  hr: "HR",
  finance: "Finance",
  teacher: "Teacher",
  student: "Student",
};

const STAFF_ROLE_PRIORITY = ["superadmin", "admin", "manager", "hr", "finance", "teacher"];

function isStudentOnly(roles: string[]): boolean {
  return roles.length === 1 && roles[0] === "student";
}

function resolveRole(roles: string[]): CardRole {
  if (isStudentOnly(roles)) return "student";
  return "staff";
}

function resolveRoleLabel(roles: string[], role: CardRole): string {
  if (role === "student") return "Student";
  const top = STAFF_ROLE_PRIORITY.find((r) => roles.includes(r));
  if (top) return ROLE_LABEL[top];
  return "Staff";
}

/** Shared role → display label (reused by the public verify page). */
export function cardRoleLabel(roles: string[]): string {
  return resolveRoleLabel(roles, resolveRole(roles));
}

function resolveAccent(role: CardRole, tenant: organizationType): string {
  if (role === "student") return tenant.id_card_student_accent || DEFAULT_STUDENT_ACCENT;
  return tenant.id_card_staff_accent || DEFAULT_STAFF_ACCENT;
}

function resolvePhoto(account: accountType): string | null {
  return account.id_photo_url || account.profile_image_url || account.profile_image || null;
}

function resolveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function resolveEmergency(account: accountType): CardViewModel["emergency"] {
  const phone = account.emergency_contact_phone_number;
  if (!phone) return null;
  return {
    name: account.emergency_contact_name || null,
    phone,
    relationship: account.emergency_contact_relationship || null,
  };
}

export function buildIdCard(
  account: accountType,
  tenant: organizationType,
): CardViewModel {
  const roles = (account.roles ?? []) as string[];
  const role = resolveRole(roles);
  return {
    name: account.name,
    email: account.email,
    role,
    roleLabel: resolveRoleLabel(roles, role),
    accent: resolveAccent(role, tenant),
    photoUrl: resolvePhoto(account),
    initials: resolveInitials(account.name),
    orgName: tenant.id_card_org_name || tenant.name,
    orgLogoUrl: tenant.id_card_logo || tenant.logo || DEFAULT_ORG_LOGO,
    bloodType: account.blood_type ?? null,
    emergency: resolveEmergency(account),
    verifyToken: account.id_verify_token ?? null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/id-card/build-id-card.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/id-card/build-id-card.ts src/lib/id-card/build-id-card.test.ts
git commit -m "feat(id-card): add buildIdCard view-model mapper"
```

---

## Task 5: `buildVerifyUrl` helper (TDD)

**Files:**
- Create: `src/lib/id-card/verify-url.ts`
- Test: `src/lib/id-card/verify-url.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { buildVerifyUrl } from "./verify-url";

describe("buildVerifyUrl", () => {
  it("builds an absolute verify URL", () => {
    expect(buildVerifyUrl("https://sdec.schedjuice.com", "tok_abc")).toBe(
      "https://sdec.schedjuice.com/verify/tok_abc",
    );
  });

  it("trims a trailing slash on the origin", () => {
    expect(buildVerifyUrl("https://x.com/", "t")).toBe("https://x.com/verify/t");
  });

  it("returns empty string when token is missing", () => {
    expect(buildVerifyUrl("https://x.com", null)).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/id-card/verify-url.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
export function buildVerifyUrl(origin: string, token: string | null): string {
  if (!token) return "";
  const base = origin.replace(/\/+$/, "");
  return `${base}/verify/${token}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/id-card/verify-url.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/id-card/verify-url.ts src/lib/id-card/verify-url.test.ts
git commit -m "feat(id-card): add buildVerifyUrl helper"
```

---

## Task 6: QR generator (TDD)

**Files:**
- Create: `src/lib/id-card/qr.ts`
- Test: `src/lib/id-card/qr.test.ts`

A PNG data URL embeds cleanly as an SVG `<image>`, rasterizes for export, and works as a WebGL texture — keeping one card-face path.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { generateQrDataUrl } from "./qr";

describe("generateQrDataUrl", () => {
  it("produces a PNG data URL", async () => {
    const url = await generateQrDataUrl("https://x.com/verify/tok");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(100);
  });

  it("returns empty string for empty input", async () => {
    expect(await generateQrDataUrl("")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/id-card/qr.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import QRCode from "qrcode";

export async function generateQrDataUrl(data: string): Promise<string> {
  if (!data) return "";
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/id-card/qr.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/id-card/qr.ts src/lib/id-card/qr.test.ts
git commit -m "feat(id-card): add QR data-url generator"
```

---

## Task 7: `IdCardFace` SVG component (the single source of truth)

**Files:**
- Create: `src/components/id-card/id-card-face.tsx`

Presentational only — props in, SVG out. No fetching, no `window`. Used by the 3D badge texture (Plan 3) and exports (Plan 4).

- [ ] **Step 1: Implement the component**

```tsx
import { CARD_VIEWBOX } from "@/lib/id-card/dimensions";
import type { CardViewModel } from "@/lib/id-card/types";

type IdCardFaceProps = {
  vm: CardViewModel;
  qrDataUrl: string;
  /** Rendered pixel width; height follows the card aspect ratio. */
  width?: number;
  className?: string;
};

const W = CARD_VIEWBOX.width;
const H = CARD_VIEWBOX.height;

export function IdCardFace({ vm, qrDataUrl, width = 320, className }: IdCardFaceProps) {
  const height = (width * H) / W;
  return (
    <svg
      role="img"
      aria-label={`${vm.name} — ${vm.roleLabel} ID card`}
      width={width}
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <clipPath id="cardClip">
          <rect x="0" y="0" width={W} height={H} rx="36" ry="36" />
        </clipPath>
        <clipPath id="photoClip">
          <rect x="180" y="150" width="180" height="216" rx="18" ry="18" />
        </clipPath>
        <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor={vm.accent} stopOpacity="0.10" />
        </linearGradient>
      </defs>

      <g clipPath="url(#cardClip)">
        {/* Surface */}
        <rect x="0" y="0" width={W} height={H} fill="#0b0b0c" />
        <rect x="0" y="0" width={W} height={H} fill="url(#foil)" />

        {/* Lanyard slot */}
        <rect x={W / 2 - 48} y="28" width="96" height="18" rx="9" fill="#ffffff" opacity="0.22" />

        {/* Header */}
        {vm.orgLogoUrl ? (
          <image href={vm.orgLogoUrl} x="40" y="74" width="44" height="44" preserveAspectRatio="xMidYMid meet" />
        ) : null}
        <text x="98" y="104" fill="#fafafa" fontSize="26" fontWeight="700" letterSpacing="0.5">
          {vm.orgName}
        </text>
        <line x1="40" y1="128" x2={W - 40} y2="128" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="2" />

        {/* Photo or monogram */}
        {vm.photoUrl ? (
          <image
            href={vm.photoUrl}
            x="180"
            y="150"
            width="180"
            height="216"
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#photoClip)"
          />
        ) : (
          <g>
            <rect x="180" y="150" width="180" height="216" rx="18" fill={vm.accent} fillOpacity="0.18" />
            <text x={W / 2} y="278" textAnchor="middle" fill={vm.accent} fontSize="84" fontWeight="700">
              {vm.initials}
            </text>
          </g>
        )}

        {/* Name + role */}
        <text x={W / 2} y="416" textAnchor="middle" fill="#fafafa" fontSize="36" fontWeight="700">
          {vm.name}
        </text>
        <rect x={W / 2 - 70} y="436" width="140" height="36" rx="18" fill={vm.accent} />
        <text x={W / 2} y="461" textAnchor="middle" fill="#0b0b0c" fontSize="20" fontWeight="700" letterSpacing="1">
          {vm.roleLabel.toUpperCase()}
        </text>

        {/* Email + blood */}
        <text x="40" y="528" fill="#d4d4d4" fontSize="20">{`\u2709  ${vm.email}`}</text>
        {vm.bloodType ? (
          <text x="40" y="562" fill="#d4d4d4" fontSize="20">{`\u271A  Blood  ${vm.bloodType}`}</text>
        ) : null}

        <line x1="40" y1="596" x2={W - 40} y2="596" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="2" />

        {/* QR + emergency */}
        {qrDataUrl ? <image href={qrDataUrl} x="40" y="624" width="150" height="150" /> : null}
        {vm.emergency ? (
          <g>
            <text x="214" y="652" fill={vm.accent} fontSize="16" fontWeight="700" letterSpacing="1.5">
              EMERGENCY
            </text>
            <text x="214" y="684" fill="#fafafa" fontSize="22">{vm.emergency.phone}</text>
            {vm.emergency.name ? (
              <text x="214" y="714" fill="#a3a3a3" fontSize="18">
                {vm.emergency.relationship ? `${vm.emergency.name} (${vm.emergency.relationship})` : vm.emergency.name}
              </text>
            ) : null}
          </g>
        ) : null}

        {/* Accent foot strip */}
        <rect x="0" y={H - 14} width={W} height="14" fill={vm.accent} />
      </g>

      {/* Inner border (refraction edge) */}
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="35" fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="2" />
    </svg>
  );
}
```

> Note: this uses `?:` ternaries only for single conditional render branches (one level, no chaining) — compliant with `no-chained-ternary`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `id-card-face.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/id-card/id-card-face.tsx
git commit -m "feat(id-card): add IdCardFace SVG component"
```

---

## Self-Review

- **Spec §4 fields:** name, email, role pill, org logo+name, photo (id_photo_url→profile_image_url→profile_image→monogram), blood type (omitted when null), emergency (omitted when no phone), QR — all in `buildIdCard` + `IdCardFace`. ✅
- **Spec §4 staff/student accent + override:** `resolveAccent` reads tenant overrides, defaults emerald/amber. ✅
- **Spec §5 single source of truth:** `IdCardFace` is the only renderer; QR is a PNG data URL so 3D/exports reuse it unchanged. ✅
- **Placeholder scan:** every step has full code; no TBDs. ✅
- **Type consistency:** `CardViewModel`/`CardRole` defined in `types.ts` and used identically in `build-id-card.ts` and `id-card-face.tsx`; `buildVerifyUrl`, `generateQrDataUrl` signatures stable. ✅
- **no-chained-ternary:** role/label/accent use lookup maps + early returns; component uses only single-level conditional renders. ✅
- **Note for later plans:** verify URL is built client-side from `window.location.origin` + `vm.verifyToken` (Plan 3/4), then passed to `generateQrDataUrl`.

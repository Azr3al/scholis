# Duplicate Cluster Contact Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show phone/comms/emergency contact values on duplicate clusters and highlight placeholder data so admins can triage false positives without opening each profile.

**Architecture:** Backend adds `emergency_contact_phone_number` to duplicate-search member payloads (display value only; clustering unchanged). Frontend gets a `suspicious-contact` helper (blocklist + patterns), cluster display helpers, and an updated `duplicate-clusters-table` with value-bearing badges, a member mini-table, and a false-positive banner.

**Tech Stack:** Django 4 + DRF, Vitest, React + shadcn Table/Badge, existing User Insights API.

**Spec:** `docs/superpowers/specs/2026-07-07-duplicate-cluster-contact-context-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `schedjuice-reimagined-be/app_auth/user_insights_services.py` | Load + serialize `emergency_contact_phone_number` on members |
| `schedjuice-reimagined-be/app_auth/tests/test_user_insights.py` | Assert emergency phone in API member payload |
| `schedjuice-reimagined-fe/src/helpers/suspicious-contact.ts` | `isSuspiciousContact` + normalization + blocklists |
| `schedjuice-reimagined-fe/src/helpers/suspicious-contact.test.ts` | Unit tests for placeholder detection |
| `schedjuice-reimagined-fe/src/helpers/duplicate-cluster-display.ts` | Badge text, false-positive check, contact cell renderer helpers |
| `schedjuice-reimagined-fe/src/helpers/duplicate-cluster-display.test.ts` | Unit tests for badge text + banner logic |
| `schedjuice-reimagined-fe/src/types/user-insights.ts` | Add `emergency_contact_phone_number` to `DuplicateClusterUser` |
| `schedjuice-reimagined-fe/src/components/user-insights/duplicate-clusters-table.tsx` | Badges with values, mini-table, false-positive banner |

---

## Phase 1 — Backend: emergency phone on members

### Task 1: Return emergency contact phone in duplicate search members

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/user_insights_services.py`
- Modify: `schedjuice-reimagined-be/app_auth/tests/test_user_insights.py`

- [ ] **Step 1: Write the failing API test**

In `test_user_insights.py`, inside `UserInsightsDuplicateSearchApiTests.setUp`, set emergency phone on one student:

```python
self.student_a = User.objects.create(
    email=f"stu-a-{suffix}@x.io",
    name="Student A",
    phone_number=shared_phone,
    communication_email=f"stu-a-{suffix}@x.io",
    emergency_contact_phone_number="09-111-2222",
    code=f"sa-{suffix}",
    roles=[User.UserRole.STUDENT],
)
```

Add new test method:

```python
def test_member_includes_emergency_contact_phone_number(self):
    response = self._client(self.admin).post(
        f"{self.api_prefix}/users/insights/duplicates/search",
        {"page": 1, "size": 25},
        format="json",
    )
    self.assertEqual(response.status_code, 200)
    cluster = next(
        c
        for c in response.data["data"]["results"]
        if self.student_a.id in c["user_ids"]
    )
    member_a = next(u for u in cluster["users"] if u["id"] == self.student_a.id)
    self.assertEqual(member_a["emergency_contact_phone_number"], "09-111-2222")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_user_insights.UserInsightsDuplicateSearchApiTests.test_member_includes_emergency_contact_phone_number -v 2
```

Expected: FAIL — key `emergency_contact_phone_number` missing or wrong.

- [ ] **Step 3: Implement minimal backend change**

In `user_insights_services.py`, add field to `load_student_rows` `.values()`:

```python
"emergency_contact_phone_number",
```

In `build_duplicate_clusters`, extend each member dict:

```python
"emergency_contact_phone_number": by_id[i].get("emergency_contact_phone_number") or "",
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_user_insights -v 2
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/user_insights_services.py app_auth/tests/test_user_insights.py
git commit -m "feat: include emergency contact phone on duplicate cluster members"
```

---

## Phase 2 — Frontend: placeholder detection helper

### Task 2: `isSuspiciousContact` helper

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/suspicious-contact.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/suspicious-contact.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `suspicious-contact.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isSuspiciousContact } from "./suspicious-contact";

describe("isSuspiciousContact", () => {
  it("flags blocklisted phone 0900000", () => {
    expect(isSuspiciousContact("0900000", "phone")).toBe(true);
    expect(isSuspiciousContact("09-000-0000", "phone")).toBe(true);
  });

  it("flags all-same-digit phones", () => {
    expect(isSuspiciousContact("1111111", "phone")).toBe(true);
  });

  it("flags short phones", () => {
    expect(isSuspiciousContact("12345", "phone")).toBe(true);
  });

  it("accepts valid phones", () => {
    expect(isSuspiciousContact("959123456789", "phone")).toBe(false);
  });

  it("flags blocklisted emails", () => {
    expect(isSuspiciousContact("test@test.com", "communication_email")).toBe(true);
  });

  it("flags lazy email local parts", () => {
    expect(isSuspiciousContact("noreply@school.edu", "communication_email")).toBe(true);
  });

  it("accepts valid emails", () => {
    expect(isSuspiciousContact("family@gmail.com", "communication_email")).toBe(false);
  });

  it("returns false for empty values", () => {
    expect(isSuspiciousContact("", "phone")).toBe(false);
    expect(isSuspiciousContact("   ", "communication_email")).toBe(false);
  });

  it("treats emergency_phone like phone", () => {
    expect(isSuspiciousContact("0000000", "emergency_phone")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/suspicious-contact.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `suspicious-contact.ts`:

```typescript
export type SuspiciousContactField =
  | "phone"
  | "communication_email"
  | "emergency_phone";

const PHONE_BLOCKLIST = new Set([
  "0900000",
  "0000000",
  "1234567890",
  "9999999999",
  "1111111111",
  "00000000000",
]);

const EMAIL_BLOCKLIST = new Set([
  "test@test.com",
  "n/a@example.com",
  "none@example.com",
  "noemail@example.com",
  "na@example.com",
  "xxx@example.com",
]);

const LAZY_EMAIL_LOCALS = new Set([
  "test",
  "admin",
  "noreply",
  "none",
  "na",
  "xxx",
  "noemail",
  "dummy",
]);

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isSuspiciousPhone(digits: string): boolean {
  if (!digits) return false;
  if (PHONE_BLOCKLIST.has(digits)) return true;
  if (digits.length < 7) return true;
  if (digits.split("").every((d) => d === digits[0])) return true;
  return false;
}

function isSuspiciousEmail(email: string): boolean {
  if (!email) return false;
  if (EMAIL_BLOCKLIST.has(email)) return true;
  const at = email.indexOf("@");
  if (at <= 0) return false;
  const local = email.slice(0, at);
  return LAZY_EMAIL_LOCALS.has(local);
}

export function isSuspiciousContact(
  value: string,
  field: SuspiciousContactField
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (field === "communication_email") {
    return isSuspiciousEmail(normalizeEmail(trimmed));
  }

  return isSuspiciousPhone(normalizePhoneDigits(trimmed));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/suspicious-contact.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/suspicious-contact.ts src/helpers/suspicious-contact.test.ts
git commit -m "feat: add suspicious contact placeholder detection helper"
```

---

## Phase 3 — Frontend: cluster display helpers

### Task 3: Badge text and false-positive banner logic

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/duplicate-cluster-display.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/duplicate-cluster-display.test.ts`
- Modify: `schedjuice-reimagined-fe/src/types/user-insights.ts`

- [ ] **Step 1: Update TypeScript type**

In `user-insights.ts`, add to `DuplicateClusterUser`:

```typescript
emergency_contact_phone_number: string;
```

- [ ] **Step 2: Write the failing tests**

Create `duplicate-cluster-display.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { DuplicateCluster, DuplicateMatchReason } from "@/types/user-insights";
import {
  formatMatchReasonBadgeText,
  isClusterLikelyFalsePositive,
  matchReasonIsSuspicious,
} from "./duplicate-cluster-display";

const reason = (
  overrides: Partial<DuplicateMatchReason>
): DuplicateMatchReason => ({
  field: "phone",
  label: "Shared phone",
  normalized_value: "959123456789",
  user_ids: [1, 2],
  possible_sibling: false,
  ...overrides,
});

describe("formatMatchReasonBadgeText", () => {
  it("appends normalized value", () => {
    expect(formatMatchReasonBadgeText(reason())).toBe(
      "Shared phone · 959123456789"
    );
  });

  it("appends placeholder and name mismatch suffixes", () => {
    expect(
      formatMatchReasonBadgeText(
        reason({
          normalized_value: "0900000",
          possible_sibling: true,
        })
      )
    ).toBe("Shared phone · 0900000 · placeholder · name mismatch");
  });
});

describe("matchReasonIsSuspicious", () => {
  it("delegates to isSuspiciousContact", () => {
    expect(
      matchReasonIsSuspicious(reason({ normalized_value: "0900000" }))
    ).toBe(true);
  });
});

describe("isClusterLikelyFalsePositive", () => {
  it("is true when all reasons are suspicious", () => {
    const cluster: Pick<DuplicateCluster, "match_reasons"> = {
      match_reasons: [
        reason({ normalized_value: "0900000" }),
        reason({
          field: "communication_email",
          label: "Shared communication email",
          normalized_value: "test@test.com",
        }),
      ],
    };
    expect(isClusterLikelyFalsePositive(cluster)).toBe(true);
  });

  it("is false when any reason is real", () => {
    const cluster: Pick<DuplicateCluster, "match_reasons"> = {
      match_reasons: [
        reason({ normalized_value: "0900000" }),
        reason({ normalized_value: "959123456789" }),
      ],
    };
    expect(isClusterLikelyFalsePositive(cluster)).toBe(false);
  });

  it("is false when there are no reasons", () => {
    expect(isClusterLikelyFalsePositive({ match_reasons: [] })).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/duplicate-cluster-display.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write implementation**

Create `duplicate-cluster-display.ts`:

```typescript
import type { DuplicateCluster, DuplicateMatchReason } from "@/types/user-insights";
import { isSuspiciousContact } from "./suspicious-contact";

export function matchReasonIsSuspicious(reason: DuplicateMatchReason): boolean {
  return isSuspiciousContact(reason.normalized_value, reason.field);
}

export function formatMatchReasonBadgeText(reason: DuplicateMatchReason): string {
  const parts = [`${reason.label} · ${reason.normalized_value}`];
  if (matchReasonIsSuspicious(reason)) {
    parts.push("placeholder");
  }
  if (reason.possible_sibling) {
    parts.push("name mismatch");
  }
  return parts.join(" · ");
}

export function isClusterLikelyFalsePositive(
  cluster: Pick<DuplicateCluster, "match_reasons">
): boolean {
  if (cluster.match_reasons.length === 0) return false;
  return cluster.match_reasons.every(matchReasonIsSuspicious);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/duplicate-cluster-display.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/types/user-insights.ts src/helpers/duplicate-cluster-display.ts src/helpers/duplicate-cluster-display.test.ts
git commit -m "feat: add duplicate cluster display helpers for match badges"
```

---

## Phase 4 — Frontend: duplicate clusters table UI

### Task 4: Update `duplicate-clusters-table.tsx`

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/user-insights/duplicate-clusters-table.tsx`

- [ ] **Step 1: Add imports and small `ContactValue` subcomponent**

At top of `duplicate-clusters-table.tsx`, add:

```typescript
import {
  formatMatchReasonBadgeText,
  isClusterLikelyFalsePositive,
  matchReasonIsSuspicious,
} from "@/helpers/duplicate-cluster-display";
import {
  isSuspiciousContact,
  type SuspiciousContactField,
} from "@/helpers/suspicious-contact";

function ContactValue({
  value,
  field,
}: {
  value: string;
  field: SuspiciousContactField;
}) {
  if (!value.trim()) {
    return <span className="text-muted-foreground">—</span>;
  }
  const suspicious = isSuspiciousContact(value, field);
  return (
    <span className="inline-flex items-center gap-1">
      <span className={suspicious ? "text-amber-700 dark:text-amber-300" : undefined}>
        {value}
      </span>
      {suspicious ? (
        <Badge className="bg-amber-500/15 text-amber-900 hover:bg-amber-500/15 dark:text-amber-100">
          Placeholder
        </Badge>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 2: Update match reason badges**

Replace badge body (lines ~89–93) with:

```typescript
{cluster.match_reasons.map((reason) => (
  <Badge
    key={`${reason.field}-${reason.normalized_value}`}
    variant="outline"
    className={
      matchReasonIsSuspicious(reason)
        ? "border-amber-500/50 text-amber-900 dark:text-amber-100"
        : undefined
    }
  >
    {formatMatchReasonBadgeText(reason)}
  </Badge>
))}
```

- [ ] **Step 3: Replace expanded member flex list with mini-table**

Replace the expanded row inner content (`{isOpen ? (...)` block) with:

```typescript
{isOpen ? (
  <TableRow>
    <TableCell colSpan={canMerge ? 5 : 4}>
      <div className="space-y-3 py-2">
        {isClusterLikelyFalsePositive(cluster) ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            <span className="font-medium">Likely false positive</span>
            {" — "}
            this cluster is linked only by placeholder contact data. Consider
            correcting the source data rather than merging accounts.
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Primary email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Comms email</TableHead>
                <TableHead>Emergency phone</TableHead>
                <TableHead>MS sign-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cluster.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <Link
                        href={`/users/${user.id}`}
                        className="font-medium hover:underline"
                      >
                        {user.name}
                      </Link>
                      {!user.is_active ? (
                        <Badge variant="secondary">Inactive</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email || "—"}
                  </TableCell>
                  <TableCell>
                    <ContactValue value={user.phone_number} field="phone" />
                  </TableCell>
                  <TableCell>
                    <ContactValue
                      value={user.communication_email}
                      field="communication_email"
                    />
                  </TableCell>
                  <TableCell>
                    <ContactValue
                      value={user.emergency_contact_phone_number ?? ""}
                      field="emergency_phone"
                    />
                  </TableCell>
                  <TableCell>
                    {formatMsLastSignIn(signInByUserId[String(user.id)])}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </TableCell>
  </TableRow>
) : null}
```

- [ ] **Step 4: Run frontend unit tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/suspicious-contact.test.ts src/helpers/duplicate-cluster-display.test.ts
```

Expected: PASS

- [ ] **Step 5: Typecheck**

```bash
cd schedjuice-reimagined-fe
npx tsc --noEmit
```

Expected: no errors related to `emergency_contact_phone_number`.

- [ ] **Step 6: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/user-insights/duplicate-clusters-table.tsx
git commit -m "feat: show contact context and placeholder warnings on duplicate clusters"
```

---

## Phase 5 — Verification

### Task 5: End-to-end verification

- [ ] **Step 1: Run full backend user insights tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_user_insights -v 2
```

Expected: PASS

- [ ] **Step 2: Run frontend unit tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/suspicious-contact.test.ts src/helpers/duplicate-cluster-display.test.ts
```

Expected: PASS

- [ ] **Step 3: Manual QA on User Insights page**

1. Open `/shortcuts/user-insights?tab=duplicates`.
2. Expand a cluster — confirm Phone, Comms email, Emergency phone columns appear.
3. Confirm match badges show shared values (e.g. `Shared phone · 09…`).
4. If a cluster shares placeholder phone `0900000`, confirm amber badge/cell styling and false-positive banner.
5. Mixed cluster (real + junk link) — per-field warnings only, no banner.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Shared values on match badges | Task 3 + Task 4 |
| Phone / comms / emergency columns on expand | Task 4 |
| Placeholder highlight (blocklist + patterns) | Task 2 |
| Cluster false-positive banner | Task 3 + Task 4 |
| `emergency_contact_phone_number` in API | Task 1 |
| No clustering changes | N/A (no task) |
| FE unit tests for junk helper | Task 2 |
| BE test for emergency phone field | Task 1 |

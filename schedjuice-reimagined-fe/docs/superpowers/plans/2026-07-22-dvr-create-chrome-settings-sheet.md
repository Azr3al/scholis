# DVR Create Chrome — Settings Sheet & Header Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Create DVR expiry/users into a right settings sheet, put Submit on the title row with Back, shrink the title, default expiry to 14 days, and remove the sticky bottom bar.

**Architecture:** Keep all create state in `DvrCreateDesigner`. Relayout the sticky header into one row (`Back` + smaller `TypographyH1` + settings + `Submit`), leave Name under it, and render Expires on / Users inside the existing `Sheet` primitive (`side="right"`). Change `defaultDvrExpiresOn` from `+7` to `+14`. Preview and `DvrFieldCatalog` stay untouched.

**Tech Stack:** Next.js client components, Vitest + Testing Library, existing primitives (`Sheet`, `Button`, `Field`, `Input`, `TypographyH1`), `RoleChooser`, `iconoir-react` `Settings`.

**Spec:** `docs/superpowers/specs/2026-07-22-dvr-create-chrome-settings-sheet-design.md`

## Global Constraints

- FE-only; no backend API or POST payload shape changes.
- Validation on Submit unchanged: name required, ≥1 field, ≥1 role, expiry present (toasts unchanged).
- Defaults: staff roles via `DVR_STAFF_ROLE_DEFAULTS`; expiry via `defaultDvrExpiresOn` = today + 14 local calendar days.
- Sheet edits are live React state; Done only closes the sheet (no separate save).
- No “defaults changed” badge on the settings icon.
- High-value tests only (no happy-path-only title smoke).
- FE unit tests: `pnpm test:unit -- <path>` from `schedjuice-reimagined-fe`.
- Supersedes sticky inline expiry/roles and sticky footer from `2026-07-21-dvr-create-form-designer-layout-design.md`; catalog remains always-visible (not a Sheet).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/helpers/dvr.ts` | Modify | `defaultDvrExpiresOn` → `+14` days |
| `src/helpers/dvr.test.ts` | Modify | Assert today + 14 |
| `src/components/dvr/dvr-create-designer.tsx` | Modify | Header chrome, settings Sheet, remove footer |
| `src/components/dvr/dvr-create-designer.test.tsx` | Modify | Sheet-only settings; header Submit; no field-count footer |

---

### Task 1: Default expiry to 14 days

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/dvr.ts` (`defaultDvrExpiresOn`)
- Modify: `schedjuice-reimagined-fe/src/helpers/dvr.test.ts`

**Interfaces:**
- Consumes: `toLocalIsoDate` (existing in `dvr.ts`)
- Produces: `defaultDvrExpiresOn(today?: Date): string` — same signature; returns local ISO date for `today + 14`

- [ ] **Step 1: Update the failing expiry test**

In `src/helpers/dvr.test.ts`, replace the `defaultDvrExpiresOn` example:

```ts
describe("defaultDvrExpiresOn", () => {
  it("is today + 14 days", () => {
    expect(defaultDvrExpiresOn(new Date(2026, 6, 18))).toBe("2026-08-01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/helpers/dvr.test.ts
```

Expected: FAIL — assertion expects `2026-08-01` but receives `2026-07-25` (today + 7).

- [ ] **Step 3: Implement +14 days**

In `src/helpers/dvr.ts`, change `defaultDvrExpiresOn`:

```ts
export function defaultDvrExpiresOn(today: Date = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() + 14);
  return toLocalIsoDate(d);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/helpers/dvr.test.ts
```

Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/dvr.ts src/helpers/dvr.test.ts
git commit -m "$(cat <<'EOF'
fix(dvr): default verification request expiry to 14 days

EOF
)"
```

---

### Task 2: Header actions + settings sheet; remove footer

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/dvr/dvr-create-designer.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/dvr/dvr-create-designer.test.tsx`

**Interfaces:**
- Consumes: `Sheet`, `Button`, `Field`, `Input`, `TypographyH1` from `@/components/primitives` / typography; `RoleChooser`; `Settings` from `iconoir-react`; existing create state (`name`, `expiresOn`, `selectedRoles`, `selectedFields`, `mutation`, `onSubmit`)
- Produces: same public `export function DvrCreateDesigner(): JSX.Element`; internal sheet open state only

- [ ] **Step 1: Write the failing chrome tests**

Append to `src/components/dvr/dvr-create-designer.test.tsx` (keep existing tests; they still click Submit by role name):

```tsx
  it("keeps expiry and users only inside the settings sheet", async () => {
    const user = userEvent.setup();
    render(wrap(<DvrCreateDesigner />));

    expect(screen.queryByLabelText(/expires on/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^roles:/i })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /request settings/i }),
    );

    expect(await screen.findByLabelText(/expires on/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^roles:/i })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /request settings/i }),
    ).toBeTruthy();
  });

  it("places Submit in the header and removes the field-count footer", () => {
    render(wrap(<DvrCreateDesigner />));

    expect(screen.getByRole("button", { name: /^submit$/i })).toBeTruthy();
    expect(screen.queryByText(/fields? selected/i)).toBeNull();
  });
```

If `getByLabelText(/expires on/i)` is fragile because the label is not wired via `htmlFor`, prefer:

```tsx
expect(screen.queryByRole("textbox", { name: /expires on/i })).toBeNull();
// after open:
expect(await screen.findByRole("textbox", { name: /expires on/i })).toBeTruthy();
```

Date inputs often expose as `spinbutton` or have no accessible name in jsdom — if that happens, assert with:

```tsx
expect(screen.queryByRole("heading", { name: /request settings/i })).toBeNull();
await user.click(screen.getByRole("button", { name: /request settings/i }));
const dialog = await screen.findByRole("dialog");
expect(within(dialog).getByText(/expires on/i)).toBeTruthy();
expect(within(dialog).getByRole("button", { name: /^roles:/i })).toBeTruthy();
```

Use the dialog/`within` variant if the first attempt’s queries fail for a11y reasons in jsdom; do not weaken the “not on page until open” assertion.

- [ ] **Step 2: Run tests to verify new ones fail**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/components/dvr/dvr-create-designer.test.tsx
```

Expected: FAIL — settings button missing; “Expires on” still on the main page; “fields selected” still present.

- [ ] **Step 3: Implement header + sheet; remove footer**

Rewrite the return of `DvrCreateDesigner` in `src/components/dvr/dvr-create-designer.tsx` as follows (keep mutation / validation / field-merge logic above unchanged).

Add imports:

```tsx
import { Button, Field, Input, Sheet, useToast } from "@/components/primitives";
import { Settings } from "iconoir-react";
```

Add sheet state next to other `useState` calls:

```tsx
const [settingsOpen, setSettingsOpen] = useState(false);
```

Replace the JSX return with:

```tsx
  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BackButton href="/data-verification-requests" />
            <TypographyH1 className="text-2xl lg:text-3xl">
              Create Data Verification Request
            </TypographyH1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Sheet.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
              <Sheet.Trigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Request settings"
                    className="px-2"
                  >
                    <Settings className="size-5" aria-hidden />
                  </Button>
                }
              />
              <Sheet.Portal>
                <Sheet.Backdrop />
                <Sheet.Popup side="right" className="gap-0 p-0">
                  <div className="space-y-1 border-b border-border px-6 py-5 pr-12">
                    <Sheet.Title className="text-lg font-semibold text-text-primary">
                      Request settings
                    </Sheet.Title>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
                    <Field.Root>
                      <Field.Label htmlFor="dvr-expires-on">
                        Expires on{" "}
                        <span className="text-destructive text-sm">*</span>
                      </Field.Label>
                      <Input
                        id="dvr-expires-on"
                        type="date"
                        value={expiresOn}
                        onChange={(e) => setExpiresOn(e.target.value)}
                      />
                      <Field.Description>
                        Banner stops after this date. Users can still open the
                        verify link later.
                      </Field.Description>
                    </Field.Root>
                    <Field.Root>
                      <Field.Label>
                        Users{" "}
                        <span className="text-destructive text-sm">*</span>
                      </Field.Label>
                      <RoleChooser
                        roles={selectedRoles}
                        setRoles={setSelectedRoles}
                      />
                      <Field.Description>
                        Select the user types that will need to verify their
                        data. Matching users are enrolled when this request is
                        created and will see an in-app banner until they verify
                        (or the request expires).
                      </Field.Description>
                    </Field.Root>
                  </div>
                  <div className="border-t border-border px-6 py-4">
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full"
                      onClick={() => setSettingsOpen(false)}
                    >
                      Done
                    </Button>
                  </div>
                </Sheet.Popup>
              </Sheet.Portal>
            </Sheet.Root>
            <Button
              type="button"
              variant="primary"
              isLoading={mutation.isPending}
              onClick={onSubmit}
            >
              Submit
            </Button>
          </div>
        </div>
        <Field.Root>
          <Field.Label htmlFor="dvr-name">
            Name <span className="text-destructive text-sm">*</span>
          </Field.Label>
          <Input
            id="dvr-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field.Root>
      </div>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div data-testid="dvr-preview" className="min-w-0">
          <DvrVerifyForm
            mode="preview"
            user={DVR_PREVIEW_STUB_USER}
            rawFields={selectedFields}
            title="Preview"
            description="This is what recipients will fill in."
          />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <DvrFieldCatalog
            selectedFields={selectedFields}
            setSelectedFields={setSelectedFields}
            customDefs={customDefs}
            defsLoading={defsLoading}
            defsError={defsError}
          />
        </aside>
      </div>
    </div>
  );
```

Notes:

- Do **not** leave a second Submit in a bottom bar.
- Do **not** render expiry/users outside the sheet.
- If `Sheet.Trigger` `render` prop typing rejects a `Button` element in this codebase version, fall back to controlled open only: a plain `Button` with `onClick={() => setSettingsOpen(true)}` and the same `Sheet.Root open={settingsOpen}` (no Trigger). Prefer Trigger when it typechecks (matches `question-nav-panel.tsx`).

- [ ] **Step 4: Run designer tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/components/dvr/dvr-create-designer.test.tsx
```

Expected: PASS — including prior “does not POST when all fields are unchecked” and “removes a field from preview…” plus the two new tests.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/dvr/dvr-create-designer.tsx src/components/dvr/dvr-create-designer.test.tsx
git commit -m "$(cat <<'EOF'
feat(dvr): move create settings into sheet and header Submit

EOF
)"
```

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
| --- | --- |
| Submit top-right in header | Task 2 |
| Back on same row as title | Task 2 |
| Smaller title (`text-2xl` / `lg:text-3xl`) | Task 2 |
| Settings icon → right Sheet | Task 2 |
| Expiry + Users only in sheet | Task 2 |
| Done closes sheet; live state | Task 2 |
| Default expiry 14 days | Task 1 |
| Staff role defaults unchanged | (no code change; still `DVR_STAFF_ROLE_DEFAULTS`) |
| Remove bottom bar / field count | Task 2 |
| Preview + catalog unchanged | Task 2 (left as-is) |
| Validation / POST unchanged | Task 2 (logic above return untouched) |
| High-value tests | Task 1 + 2 |

No placeholders; signatures match existing helpers/components.

# Intake add-course inline level/section — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins create program levels and sections inline while adding K-12 classes to an existing intake, without leaving the add-course form.

**Architecture:** New `program-structure-create.ts` helpers (mirroring `subject-create-config.ts`) POST to existing APIs immediately. `ExistingIntakeAddFormMulti` wires `EntityCombobox` `onCreateNew` on level/section fields, removes the zero-levels blocker, tracks session-new levels, and saves `ProgramLevelSubject` defaults on submit.

**Tech Stack:** Next.js App Router, TanStack Query, Vitest, existing `makePostRequest` / `EntityCombobox` client API.

**Design spec:** `docs/superpowers/specs/2026-06-15-intake-add-course-inline-level-section-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `src/helpers/program-structure-create.ts` | Create level+section A, create section, save level subjects, query invalidation helper |
| `src/helpers/program-structure-create.test.ts` | Unit tests with mocked API |
| `src/components/scheduling/existing-intake-add-form-multi.tsx` | `onCreateNew`, remove blocker, submit hook for level subjects |

---

## Task 1: `createProgramLevelWithDefaultSection` helper

**Files:**
- Create: `src/helpers/program-structure-create.ts`
- Create: `src/helpers/program-structure-create.test.ts`
- Test: `src/helpers/program-structure-create.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/helpers/program-structure-create.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: vi.fn(),
  searchEntities: vi.fn(),
}));

import { makePostRequest } from "@/app/client-api/utils";
import { createProgramLevelWithDefaultSection } from "./program-structure-create";

describe("createProgramLevelWithDefaultSection", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
  });

  it("posts level then default section A", async () => {
    vi.mocked(makePostRequest)
      .mockResolvedValueOnce({ data: { data: { id: 10, name: "Year 8" } } })
      .mockResolvedValueOnce({ data: { data: { id: 20, name: "A" } } });

    const result = await createProgramLevelWithDefaultSection("5", "Year 8", 2);

    expect(makePostRequest).toHaveBeenNthCalledWith(1, "program-levels", {
      program: 5,
      name: "Year 8",
      sort_order: 2,
    });
    expect(makePostRequest).toHaveBeenNthCalledWith(2, "program-level-sections", {
      level: 10,
      name: "A",
      sort_order: 0,
    });
    expect(result).toEqual({
      levelId: 10,
      levelName: "Year 8",
      sectionId: 20,
      sectionName: "A",
    });
  });

  it("throws when level response has no id", async () => {
    vi.mocked(makePostRequest).mockResolvedValueOnce({ data: { data: {} } });

    await expect(
      createProgramLevelWithDefaultSection("5", "Year 8"),
    ).rejects.toThrow(/no id/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/program-structure-create.test.ts`

Expected: FAIL — cannot find module `./program-structure-create`

- [ ] **Step 3: Implement minimal helper**

Create `src/helpers/program-structure-create.ts`:

```ts
import { makePostRequest } from "@/app/client-api/utils";

export type ProgramLevelCreateResult = {
  levelId: number;
  levelName: string;
  sectionId: number;
  sectionName: string;
};

export async function createProgramLevelWithDefaultSection(
  programId: string | number,
  name: string,
  sortOrder = 0,
): Promise<ProgramLevelCreateResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Level name is required.");
  }

  const levelRes = await makePostRequest("program-levels", {
    program: typeof programId === "string" ? parseInt(programId, 10) : programId,
    name: trimmed,
    sort_order: sortOrder,
  });
  const levelId = levelRes?.data?.data?.id;
  const levelName = levelRes?.data?.data?.name ?? trimmed;
  if (levelId == null) {
    throw new Error("Level was created but no id was returned.");
  }

  const sectionRes = await makePostRequest("program-level-sections", {
    level: levelId,
    name: "A",
    sort_order: 0,
  });
  const sectionId = sectionRes?.data?.data?.id;
  const sectionName = sectionRes?.data?.data?.name ?? "A";
  if (sectionId == null) {
    throw new Error("Default section was created but no id was returned.");
  }

  return { levelId, levelName, sectionId, sectionName };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/program-structure-create.test.ts`

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/program-structure-create.ts src/helpers/program-structure-create.test.ts
git commit -m "feat: add helper to create program level with default section A"
```

---

## Task 2: `createProgramSection` and `saveProgramLevelSubjects` helpers

**Files:**
- Modify: `src/helpers/program-structure-create.ts`
- Modify: `src/helpers/program-structure-create.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `program-structure-create.test.ts`:

```ts
import { searchEntities } from "@/app/client-api/utils";
import {
  createProgramSection,
  saveProgramLevelSubjects,
} from "./program-structure-create";

describe("createProgramSection", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
  });

  it("posts a section for the given level", async () => {
    vi.mocked(makePostRequest).mockResolvedValueOnce({
      data: { data: { id: 30, name: "B" } },
    });

    const result = await createProgramSection(10, "B", 1);

    expect(makePostRequest).toHaveBeenCalledWith("program-level-sections", {
      level: 10,
      name: "B",
      sort_order: 1,
    });
    expect(result).toEqual({ sectionId: 30, sectionName: "B" });
  });
});

describe("saveProgramLevelSubjects", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
    vi.mocked(searchEntities).mockReset();
  });

  it("no-ops when level already has program-level-subjects", async () => {
    vi.mocked(searchEntities).mockResolvedValueOnce({
      data: { data: [{ id: 1, level: 10, subject: 100 }] },
    });

    await saveProgramLevelSubjects(10, [100, 101]);

    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it("posts program-level-subjects when level has none", async () => {
    vi.mocked(searchEntities).mockResolvedValueOnce({ data: { data: [] } });
    vi.mocked(makePostRequest).mockResolvedValue({ data: { data: { id: 1 } } });

    await saveProgramLevelSubjects(10, [100, 101]);

    expect(makePostRequest).toHaveBeenNthCalledWith(1, "program-level-subjects", {
      level: 10,
      subject: 100,
      sort_order: 0,
    });
    expect(makePostRequest).toHaveBeenNthCalledWith(2, "program-level-subjects", {
      level: 10,
      subject: 101,
      sort_order: 1,
    });
  });
});
```

Add `searchEntities` to the mock at top of file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/program-structure-create.test.ts`

Expected: FAIL — `createProgramSection` / `saveProgramLevelSubjects` not exported

- [ ] **Step 3: Implement helpers**

Append to `program-structure-create.ts`:

```ts
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export type ProgramSectionCreateResult = {
  sectionId: number;
  sectionName: string;
};

export async function createProgramSection(
  levelId: number,
  name: string,
  sortOrder = 0,
): Promise<ProgramSectionCreateResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Section name is required.");
  }

  const sectionRes = await makePostRequest("program-level-sections", {
    level: levelId,
    name: trimmed,
    sort_order: sortOrder,
  });
  const sectionId = sectionRes?.data?.data?.id;
  const sectionName = sectionRes?.data?.data?.name ?? trimmed;
  if (sectionId == null) {
    throw new Error("Section was created but no id was returned.");
  }

  return { sectionId, sectionName };
}

export async function levelHasProgramLevelSubjects(levelId: number): Promise<boolean> {
  const res = await searchEntities(
    "program-level-subjects",
    { fields: ["id"], page: 1, size: 1 },
    {
      filter_params: [
        {
          field_name: "level",
          operator: operatorEnum.exact,
          value: String(levelId),
        },
      ],
    },
  );
  return ((res?.data?.data ?? []) as unknown[]).length > 0;
}

export async function saveProgramLevelSubjects(
  levelId: number,
  subjectIds: number[],
): Promise<void> {
  if (subjectIds.length === 0) return;
  if (await levelHasProgramLevelSubjects(levelId)) return;

  for (let i = 0; i < subjectIds.length; i++) {
    await makePostRequest("program-level-subjects", {
      level: levelId,
      subject: subjectIds[i],
      sort_order: i,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/program-structure-create.test.ts`

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/program-structure-create.ts src/helpers/program-structure-create.test.ts
git commit -m "feat: add section create and program level subject save helpers"
```

---

## Task 3: Combobox configs and query invalidation helper

**Files:**
- Modify: `src/helpers/program-structure-create.ts`
- Modify: `src/helpers/program-structure-create.test.ts`

- [ ] **Step 1: Add invalidation helper and combobox configs**

Append to `program-structure-create.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { EntityComboboxCreateNewConfig } from "@/components/form/entity-combobox";

export function invalidateIntakeAddStructureQueries(
  queryClient: QueryClient,
  programId: string,
): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["existing-intake-add-levels", programId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["existing-intake-add-sections", programId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["existing-intake-add-level-subjects", programId],
    }),
  ]).then(() => undefined);
}

export function buildLevelCreateConfig(
  programId: string,
  levelCount: number,
  onCreated?: (result: ProgramLevelCreateResult) => void | Promise<void>,
): EntityComboboxCreateNewConfig {
  return {
    buttonLabel: "New level",
    dialogTitle: "Create level",
    inputLabel: "Name",
    inputPlaceholder: "e.g. Year 8",
    create: async (name) => {
      const result = await createProgramLevelWithDefaultSection(
        programId,
        name,
        levelCount,
      );
      await onCreated?.(result);
      return result.levelId;
    },
  };
}

export function buildSectionCreateConfig(
  levelId: number,
  sectionCount: number,
  onCreated?: (result: ProgramSectionCreateResult) => void | Promise<void>,
): EntityComboboxCreateNewConfig {
  return {
    buttonLabel: "New section",
    dialogTitle: "Create section",
    inputLabel: "Name",
    inputPlaceholder: "e.g. B",
    create: async (name) => {
      const result = await createProgramSection(levelId, name, sectionCount);
      await onCreated?.(result);
      return result.sectionId;
    },
  };
}
```

- [ ] **Step 2: Run tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/program-structure-create.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/helpers/program-structure-create.ts
git commit -m "feat: add intake add-form structure create configs"
```

---

## Task 4: Wire inline create into `ExistingIntakeAddFormMulti`

**Files:**
- Modify: `src/components/scheduling/existing-intake-add-form-multi.tsx`

- [ ] **Step 1: Add imports and session state**

At top of `existing-intake-add-form-multi.tsx`, add:

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import {
  buildLevelCreateConfig,
  buildSectionCreateConfig,
  invalidateIntakeAddStructureQueries,
  saveProgramLevelSubjects,
  type ProgramLevelCreateResult,
  type ProgramSectionCreateResult,
} from "@/helpers/program-structure-create";
```

Inside the component, after existing `useState` calls:

```ts
const queryClient = useQueryClient();
const [newlyCreatedLevelIds, setNewlyCreatedLevelIds] = useState<Set<number>>(
  () => new Set(),
);
const savedLevelSubjectDefaultsRef = useRef<Set<number>>(new Set());
const pendingLevelCreateRef = useRef<Map<number, ProgramLevelCreateResult>>(
  new Map(),
);
const pendingSectionCreateRef = useRef<Map<number, ProgramSectionCreateResult>>(
  new Map(),
);
```

- [ ] **Step 2: Update `setRowLevel` to consume pending level create context**

Replace `setRowLevel` with:

```ts
function setRowLevel(key: string, levelId: number | null | undefined) {
  if (!intake || levelId == null) {
    updateRow(key, {
      level_id: undefined,
      section_id: undefined,
      subject_ids: [],
      title: "",
    });
    return;
  }

  const pending = pendingLevelCreateRef.current.get(levelId);
  if (pending) {
    pendingLevelCreateRef.current.delete(levelId);
    updateRow(key, {
      level_id: levelId,
      section_id: pending.sectionId,
      subject_ids: [],
      title: buildMultiDefaultTitle(
        pending.levelName,
        pending.sectionName,
        intake.name,
      ),
    });
    return;
  }

  const level = levelsById[levelId];
  const subjectIds = [...(levelSubjectsByLevelId[levelId] ?? [])];
  const title = buildMultiDefaultTitle(
    level?.name ?? "Level",
    undefined,
    intake.name,
  );
  updateRow(key, {
    level_id: levelId,
    section_id: undefined,
    subject_ids: subjectIds,
    title,
  });
}
```

- [ ] **Step 3: Update `setRowSection` to consume pending section create context**

Replace `setRowSection` with:

```ts
function setRowSection(key: string, sectionId: number | null | undefined) {
  const row = rows.find((r) => r.key === key);
  if (!intake || !row?.level_id) {
    updateRow(key, { section_id: undefined });
    return;
  }

  const level = levelsById[row.level_id];
  const pending = sectionId != null
    ? pendingSectionCreateRef.current.get(sectionId)
    : undefined;
  if (pending && sectionId != null) {
    pendingSectionCreateRef.current.delete(sectionId);
    updateRow(key, {
      section_id: sectionId,
      title: buildMultiDefaultTitle(
        level?.name ?? "Level",
        pending.sectionName,
        intake.name,
      ),
    });
    return;
  }

  const section = sectionId != null ? sectionsById[sectionId] : undefined;
  const title = buildMultiDefaultTitle(
    level?.name ?? "Level",
    section?.name,
    intake.name,
  );
  updateRow(key, {
    section_id: sectionId ?? undefined,
    title,
  });
}
```

- [ ] **Step 4: Remove zero-levels blocker**

Delete the entire block:

```tsx
if (levels.length === 0) {
  return (
    <div className="space-y-4">
      ...
    </div>
  );
}
```

The form should render for `levels.length === 0` with the same JSX as today.

- [ ] **Step 5: Add `onCreateNew` to level and section comboboxes**

On the level `EntityCombobox`, add:

```tsx
onCreateNew={buildLevelCreateConfig(programId, levels.length, async (result) => {
  pendingLevelCreateRef.current.set(result.levelId, result);
  setNewlyCreatedLevelIds((prev) => new Set(prev).add(result.levelId));
  await invalidateIntakeAddStructureQueries(queryClient, programId);
})}
```

On the section `EntityCombobox`, add:

```tsx
onCreateNew={buildSectionCreateConfig(
  row.level_id,
  (sectionsByLevelId[row.level_id] ?? []).length,
  async (result) => {
    pendingSectionCreateRef.current.set(result.sectionId, result);
    await invalidateIntakeAddStructureQueries(queryClient, programId);
  },
)}
```

- [ ] **Step 6: Save `ProgramLevelSubject` defaults on submit**

Inside `createCourses` mutation `mutationFn`, after the `course-subjects` loop for each row, add:

```ts
if (
  row.level_id != null &&
  newlyCreatedLevelIds.has(row.level_id) &&
  !savedLevelSubjectDefaultsRef.current.has(row.level_id)
) {
  await saveProgramLevelSubjects(row.level_id, row.subject_ids);
  savedLevelSubjectDefaultsRef.current.add(row.level_id);
}
```

Pass `newlyCreatedLevelIds` into the mutation by closing over component state (already in scope). The `savedLevelSubjectDefaultsRef` guard prevents duplicate writes when two rows share the same new level.

- [ ] **Step 7: Manual smoke test**

1. Open `/courses/create/program/{programId}/intake/{intakeId}/add` for a multi-strategy program with zero levels.
2. Click **New level**, create "Year 8" — row should show level, section A, empty subjects, prefilled title.
3. Add subjects, submit — verify course exists in intake and program settings shows Year 8 / A with subjects.
4. On a program with existing levels, click **New section**, create "C", submit — verify course has section C.

- [ ] **Step 8: Run unit tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/program-structure-create.test.ts`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/scheduling/existing-intake-add-form-multi.tsx
git commit -m "feat: inline level and section creation on intake add-class form"
```

---

## Task 5 (optional): DRY `ProgramStructureEditor` persist mode

**Files:**
- Modify: `src/components/program/program-structure-editor.tsx`

Only if time permits in the same PR; not required for spec acceptance.

- [ ] **Step 1: Replace inline POST calls in `addLevel` mutation**

In `PersistStructureEditor.addLevel`, replace the two `makePostRequest` calls with:

```ts
import { createProgramLevelWithDefaultSection } from "@/helpers/program-structure-create";

// inside mutationFn:
await createProgramLevelWithDefaultSection(programId, levelName.trim(), levels.length);
```

- [ ] **Step 2: Replace `addSection` mutation in `PersistLevelSections`**

```ts
import { createProgramSection } from "@/helpers/program-structure-create";

// inside mutationFn:
await createProgramSection(parseInt(levelId, 10), sectionName.trim(), sections.length);
```

- [ ] **Step 3: Run tests and commit**

```bash
npm run test:unit -- src/helpers/program-structure-create.test.ts
git add src/components/program/program-structure-editor.tsx
git commit -m "refactor: reuse program structure create helpers in settings editor"
```

---

## Manual test checklist (full)

- [ ] Zero-level program: inline level → subjects → create class → level, section A, `ProgramLevelSubject`, course all exist
- [ ] Existing program: inline new section → create class with correct section on course
- [ ] Two class rows, same newly created level → `ProgramLevelSubject` written once
- [ ] Duplicate level name → error toast, row unchanged
- [ ] Form still works when selecting existing level/section (no regression)

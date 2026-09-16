# Remove app_quiz v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully retire legacy `app_quiz` (v1): drop tenant tables, remove dead API/helpers, migrate FE surfaces to quiz v3, and delete the app package.

**Architecture:** Phase 1 rewires remaining BE/FE dependencies onto `app_quiz_v3` or removes dead endpoints. Phase 2 adds a final `app_quiz` migration deleting models. Phase 3 removes the app from `INSTALLED_APPS`, deletes source, and cleans orphaned v1 task handlers. Legacy v1 API URLs were **never mounted** in root `urls.py` — FE references are already broken.

**Tech Stack:** Django multi-tenant (`django-tenant-schemas`), Next.js FE, `./scripts/run_backend_tests.sh --keepdb`, FE `npm run test:unit`.

## Global Constraints

- **Data loss accepted** for v1 tables (`app_quiz_quiz`, `app_quiz_answer`, `app_quiz_useransweraudit`) — product uses quiz v3 exclusively.
- Do **not** remove `app_quiz_v3` or quiz RBAC codenames (`quiz.author`, `quiz.take`, etc.) — those apply to v3.
- `CategorySerializer.expandable_fields["quizes"]` pointed at v1 — **remove** expand (v3 uses `QuizCategory`, not course `Category`).
- `QuizAuthorizationView` (`quiz-authourization/...`) has **zero FE call sites** — delete endpoint + view.
- `DELETE_QUIZ_FILES` / `CLEAN_UP_QUIZ_FILES` tasks are **v1-only** (v1 JSON schema) — remove task enum values, handlers, and `run-tasks.py` branches.
- Never run tests against dev DB; use `./scripts/run_backend_tests.sh`.
- High-value tests: verify course serializer still loads; course grading page uses v3 list; no import errors after app removal.

---

## File Structure

### Backend

| File | Action |
| --- | --- |
| `app_course/serializers.py` | Remove `quizes` expand from `CategorySerializer` |
| `app_utils/views.py` | Delete `QuizAuthorizationView`, `user_can_grade_quiz`, `app_quiz` imports |
| `app_utils/urls.py` | Remove quiz-auth route |
| `app_tasks/models.py` | Remove `CLEAN_UP_QUIZ_FILES`, `DELETE_QUIZ_FILES` enum members |
| `app_tasks/tasks.py` | Delete `clean_up_quiz_files`, `delete_quiz_files` |
| `app_tasks/management/commands/run-tasks.py` | Remove matching branches |
| `app_tasks/migrations/00XX_remove_v1_quiz_task_names.py` | Alter `Task.name` choices |
| `app_quiz/migrations/0023_delete_v1_models.py` | DeleteModel Quiz, Answer, UserAnswerAudit |
| `schedjuice_backend/settings.py` | Remove `app_quiz` from apps lists |
| `app_quiz/` | Delete directory after migration lands |
| `app_quiz/tests/test_rbac_quiz.py` | Deleted with app |

### Frontend

| File | Action |
| --- | --- |
| `src/app/(internal)/courses/[id]/grading/page.tsx` | Use `useQuizzesList` + v3 links |
| `src/app/(internal)/categories/[id]/page.tsx` | Remove legacy quizes table section |
| `src/app/(internal)/categories/legacy-quiz-columns.tsx` | Delete |
| `src/sdk/resources/quizes.ts`, `legacy-quizzes.ts` | Delete |
| `src/sdk/hooks/quizes.ts`, `legacy-quizzes.ts` | Delete |
| `src/sdk/_types/quizes.ts`, `legacy-quizzes.ts` | Delete |
| `src/sdk/keys/quizes.ts` | Delete |
| `src/sdk/index.ts`, `src/sdk/keys/index.ts` | Remove exports |
| `src/app/artifacts/columns/default.tsx` | Remove `quizes` artifact column preset |
| `src/app/(quizv2)/` | Delete empty legacy route stub |

---

### Task 1: Backend — remove cross-app references

**Files:**
- Modify: `app_course/serializers.py`
- Modify: `app_utils/views.py`
- Modify: `app_utils/urls.py`

- [ ] **Step 1: Write failing import check (manual gate)**

```bash
cd schedjuice-reimagined-be && rg "app_quiz" --glob '*.py' --glob '!app_quiz/**'
```

Note all non-app_quiz files — should match list above only.

- [ ] **Step 2: Remove CategorySerializer v1 expand**

In `app_course/serializers.py`, delete from `CategorySerializer.Meta.expandable_fields`:

```python
"quizes": ("app_quiz.serializers.QuizSerializer", {"many": True}),
```

- [ ] **Step 3: Remove QuizAuthorizationView**

Replace `app_utils/views.py` contents related to quiz with nothing — delete entire file body except if other views exist. **Current file is quiz-only** — replace with:

```python
# app_utils views live in import_views.py and other modules.
```

Or delete `views.py` and remove import from `urls.py`.

In `app_utils/urls.py`, remove:

```python
from app_utils.views import QuizAuthorizationView
# ...
path("quiz-authourization/<int:quiz_id>/<int:user_id>/", ...)
```

- [ ] **Step 4: Verify Django setup**

```bash
cd schedjuice-reimagined-be && ./env/bin/python -c "import django; django.setup()"
```

Expected: no import errors.

- [ ] **Step 5: Commit**

```bash
git add app_course/serializers.py app_utils/views.py app_utils/urls.py
git commit -m "chore: remove app_quiz cross-app serializer and auth endpoint"
```

---

### Task 2: Backend — remove v1 quiz file task handlers

**Files:**
- Modify: `app_tasks/models.py`
- Modify: `app_tasks/tasks.py`
- Modify: `app_tasks/management/commands/run-tasks.py`
- Create: `app_tasks/migrations/00XX_remove_v1_quiz_task_names.py`

- [ ] **Step 1: Delete handler functions**

Remove `clean_up_quiz_files` and `delete_quiz_files` from `app_tasks/tasks.py`.

Remove enum members from `Task.TaskName` in `app_tasks/models.py`:

```python
CLEAN_UP_QUIZ_FILES = ...
DELETE_QUIZ_FILES = ...
```

Remove `elif` branches in `run-tasks.py`.

- [ ] **Step 2: Generate migration for Task.name choices**

```bash
cd schedjuice-reimagined-be && ./env/bin/python manage.py makemigrations app_tasks --name remove_v1_quiz_task_names
```

Review migration removes the two choice strings from `Task.name`.

- [ ] **Step 3: Run app_tasks tests**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_tasks.tests --keepdb --noinput
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app_tasks/
git commit -m "chore: remove v1 quiz file cleanup task handlers"
```

---

### Task 3: Backend — final migration dropping v1 tables

**Files:**
- Create: `app_quiz/migrations/0023_delete_v1_models.py`

- [ ] **Step 1: Create DeleteModel migration**

```bash
cd schedjuice-reimagined-be && ./env/bin/python manage.py makemigrations app_quiz --name delete_v1_models
```

Expected operations:

```python
operations = [
    migrations.DeleteModel(name="UserAnswerAudit"),
    migrations.DeleteModel(name="Answer"),
    migrations.DeleteModel(name="Quiz"),
]
```

- [ ] **Step 2: Apply on test DB**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_course.tests.test_serializers --keepdb --noinput
```

(Or run `migrate_schemas` against test DB if your script migrates first.)

- [ ] **Step 3: Commit**

```bash
git add app_quiz/migrations/
git commit -m "chore: drop app_quiz v1 models"
```

---

### Task 4: Backend — remove app from settings and delete package

**Files:**
- Modify: `schedjuice_backend/settings.py`
- Delete: `app_quiz/` directory

- [ ] **Step 1: Remove from INSTALLED_APPS**

Delete `"app_quiz",` from `SHARED_APPS` and `TENANT_APPS` in `settings.py` (keep `"app_quiz_v3",`).

- [ ] **Step 2: Delete app directory**

```bash
rm -rf schedjuice-reimagined-be/app_quiz
```

- [ ] **Step 3: Confirm zero references**

```bash
cd schedjuice-reimagined-be && rg "app_quiz[^_v3]|from app_quiz|import app_quiz" --glob '*.py'
```

Expected: no matches (except docs/hygiene YAML — clean in Task 6).

- [ ] **Step 4: Run broad smoke**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_quiz_v3.tests.test_rbac_quiz_v3 app_course.tests.test_teaching_assessments app_utils.tests --keepdb --noinput
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add schedjuice_backend/settings.py
git add -u app_quiz
git commit -m "chore: remove app_quiz v1 package"
```

---

### Task 5: Frontend — migrate course grading to quiz v3

**Files:**
- Modify: `src/app/(internal)/courses/[id]/grading/page.tsx`

- [ ] **Step 1: Replace legacy list hook**

Replace imports:

```tsx
import { useQuizzesList } from "@/sdk/hooks/quizzes";
import type { Quiz } from "@/sdk/_types/quizzes";
```

Replace `useLegacyQuizzesList` with `useQuizzesList` (same filter on `course`).

Update columns type from `LegacyQuiz` to `Quiz`.

Replace links:

```tsx
href="/quizzes-v3/create"
rowHref={(row) => `/quizzes-v3/${row.id}`}
```

Remove `?tab=answers` (v3 uses `/quizzes-v3/${id}/responses`).

- [ ] **Step 2: Manual smoke**

Open `/courses/{id}/grading` — quizzes tab lists v3 quizzes for course; links resolve.

- [ ] **Step 3: Commit**

```bash
git add src/app/(internal)/courses/[id]/grading/page.tsx
git commit -m "feat(quiz): migrate course grading list to quiz v3"
```

---

### Task 6: Frontend — delete legacy SDK + category quizes section

**Files:**
- Modify: `src/app/(internal)/categories/[id]/page.tsx`
- Delete: legacy SDK files listed in File Structure
- Modify: `src/sdk/index.ts`, `src/sdk/keys/index.ts`, `src/app/artifacts/columns/default.tsx`

- [ ] **Step 1: Remove category quizes table**

In `categories/[id]/page.tsx`:

- Remove `legacyQuizColumns`, `useQuizesList`, quizes table state/list, and the Quizes UI section.
- Keep courses table intact.

- [ ] **Step 2: Delete legacy SDK modules**

```bash
cd schedjuice-reimagined-fe
rm src/sdk/resources/quizes.ts src/sdk/resources/legacy-quizzes.ts
rm src/sdk/hooks/quizes.ts src/sdk/hooks/legacy-quizzes.ts
rm src/sdk/_types/quizes.ts src/sdk/_types/legacy-quizzes.ts
rm src/sdk/keys/quizes.ts
rm src/app/(internal)/categories/legacy-quiz-columns.tsx
rm -rf src/app/\(quizv2\)
```

- [ ] **Step 3: Clean barrel exports**

Remove all `quizes` / `legacy-quiz` / `LegacyQuiz` / `useQuizesList` / `useLegacyQuizzesList` exports from `src/sdk/index.ts` and `src/sdk/keys/index.ts`.

Remove `quizes:` entry from `src/app/artifacts/columns/default.tsx`.

- [ ] **Step 4: Verify no stale imports**

```bash
cd schedjuice-reimagined-fe && rg "legacy-quiz|useQuizesList|useLegacyQuizzes|/quizes/" src
```

Expected: no matches.

- [ ] **Step 5: Run typecheck/tests**

```bash
cd schedjuice-reimagined-fe && npm run test:unit -- src/sdk
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A src/sdk src/app
git commit -m "chore: remove legacy app_quiz v1 frontend SDK and surfaces"
```

---

### Task 7: Docs / hygiene cleanup

**Files:**
- Modify: `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-22-hygiene-slices.md`
- Delete: `schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/be-app_quiz.yaml`
- Delete: `schedjuice-reimagined-be/docs/superpowers/specs/cleanup-reports/be-app_quiz.yaml`

- [ ] **Step 1: Remove hygiene slice references**

- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs: remove app_quiz v1 hygiene artifacts"
```

---

## Self-Review

| Requirement | Task |
| --- | --- |
| Drop v1 DB tables | Task 3 |
| Remove dead auth endpoint | Task 1 |
| Remove v1 task handlers | Task 2 |
| Remove app package | Task 4 |
| FE course grading → v3 | Task 5 |
| FE legacy SDK removal | Task 6 |
| Category quizes section gone | Task 6 |
| quiz v3 untouched | All tasks |

## Pre-flight confirmation (operator)

Before Task 3 on production schemas, confirm no tenant still relies on v1 quiz data:

```sql
-- per tenant schema
SELECT COUNT(*) FROM app_quiz_quiz;
SELECT COUNT(*) FROM app_quiz_answer;
```

If counts are zero (expected), proceed. If not, export/archive first.

# Remove app_dinger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the unused `app_dinger` Django app (WIP Dinger payment gateway scaffold with hardcoded secrets, no models, no URLs, no production usage).

**Architecture:** Remove from `INSTALLED_APPS`, delete the app directory, drop the `pycryptodome` dependency (only consumer), and clean hygiene-slice references. No migrations needed — `models.py` is empty and no tables exist.

**Tech Stack:** Django (`schedjuice-reimagined-be`), `./scripts/run_backend_tests.sh` with `--keepdb`.

## Global Constraints

- `app_dinger` has **no DB tables** and **no URL routes** — safe hard delete.
- `services.py` contains **hardcoded API keys** — deletion removes secrets from repo (rotate any keys that were ever real, out of band).
- Do not touch dev/prod databases beyond normal test runs.
- Backend tests: `./scripts/run_backend_tests.sh <target> --keepdb --noinput`.
- Verify `django.setup()` and a representative test module after removal.

---

## File Structure

| File | Action |
| --- | --- |
| `schedjuice_backend/settings.py` | Remove `app_dinger` from `SHARED_APPS` and `TENANT_APPS` |
| `app_dinger/` | Delete entire directory |
| `requirements.txt` | Remove `pycryptodome==3.20.0` |
| `docs/superpowers/specs/2026-07-22-hygiene-slices.md` | Remove `be-app_dinger` row |
| `docs/superpowers/specs/hygiene-reports/be-app_dinger.yaml` | Delete |

---

### Task 1: Remove app from settings and delete package

**Files:**
- Modify: `schedjuice-reimagined-be/schedjuice_backend/settings.py`
- Delete: `schedjuice-reimagined-be/app_dinger/` (all files)

- [ ] **Step 1: Confirm zero external references**

```bash
cd schedjuice-reimagined-be && rg "app_dinger" --glob '*.py' --glob '!app_dinger/**'
```

Expected: only `settings.py` (and possibly docs).

- [ ] **Step 2: Remove from INSTALLED_APPS**

In `schedjuice_backend/settings.py`, delete `"app_dinger",` from both `SHARED_APPS` (~line 104) and `TENANT_APPS` (~line 161).

- [ ] **Step 3: Delete app directory**

```bash
rm -rf schedjuice-reimagined-be/app_dinger
```

- [ ] **Step 4: Verify Django loads**

```bash
cd schedjuice-reimagined-be && ./env/bin/python -c "import django; django.setup(); print('ok')"
```

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add schedjuice_backend/settings.py
git add -u app_dinger
git commit -m "chore: remove unused app_dinger scaffold"
```

---

### Task 2: Remove pycryptodome dependency

**Files:**
- Modify: `schedjuice-reimagined-be/requirements.txt`

- [ ] **Step 1: Confirm no remaining Crypto imports**

```bash
cd schedjuice-reimagined-be && rg "Crypto\.|pycryptodome" --glob '*.py'
```

Expected: no matches.

- [ ] **Step 2: Remove from requirements.txt**

Delete line:

```
pycryptodome==3.20.0
```

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "chore: drop pycryptodome after app_dinger removal"
```

---

### Task 3: Clean docs / hygiene artifacts

**Files:**
- Modify: `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-22-hygiene-slices.md`
- Delete: `schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/be-app_dinger.yaml`

- [ ] **Step 1: Remove slice row**

Delete the `| be-app_dinger | app_dinger |` row from hygiene slices inventory.

- [ ] **Step 2: Delete hygiene report YAML**

```bash
rm schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/be-app_dinger.yaml
```

- [ ] **Step 3: Run smoke tests**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_utils.tests --keepdb --noinput
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-22-hygiene-slices.md docs/superpowers/specs/hygiene-reports/be-app_dinger.yaml
git commit -m "docs: remove app_dinger hygiene slice after app deletion"
```

---

## Self-Review

| Requirement | Task |
| --- | --- |
| Remove app from settings | Task 1 |
| Delete source + secrets | Task 1 |
| Drop unused dependency | Task 2 |
| Docs cleanup | Task 3 |
| No migrations needed | Confirmed — empty models |

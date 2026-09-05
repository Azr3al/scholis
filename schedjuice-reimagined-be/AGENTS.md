# AGENTS.md

## Cursor Cloud specific instructions

This workspace contains two repos:
- **Backend**: `/agent/repos/schedjuice-reimagined-be` — Django 4.2 + DRF multi-tenant SaaS
- **Frontend**: `/agent/repos/schedjuice-reimagined-fe` — Next.js 15 (App Router, Turbopack)

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Redis | `docker start schedjuice-redis` (if stopped) | 6379 | Optional for dev; only needed for WebSocket/chat |
| Backend | `cd /agent/repos/schedjuice-reimagined-be && source env/bin/activate && python manage.py runserver 0.0.0.0:8000` | 8000 | Uses injected `DATABASE_URL` (Railway dev DB) |
| Frontend | `cd /agent/repos/schedjuice-reimagined-fe && npm run dev` | 3000 | Uses Turbopack |

### Database

The injected `DATABASE_URL` environment variable points to a shared Railway dev database with real data (176+ users, 20 categories, multiple tenants). **Do NOT override it for `runserver`** — use the dev database directly for manual API testing.

**Backend tests are different:** always use the local Docker Postgres via `./scripts/run_backend_tests.sh`. Test settings reject remote DB hosts and default to `postgres://user:password@127.0.0.1:55432/db`.

Use the `DEV_TENANT_DOMAIN` env var (currently `schedjuice.thiha.net`) as the tenant identifier for API requests:
- API header: `X-Tenant: $DEV_TENANT_DOMAIN`
- Frontend: the dev server at localhost:3000 will use this tenant domain

### Test account

- Email: `james@schedjuice.com` / Password: `password123` (superadmin in `xschedjuice` schema)
- If login fails with "No active account", reset the password via Django shell:
  ```python
  from tenant_schemas.utils import schema_context
  with schema_context('xschedjuice'):
      from app_auth.models import User
      u = User.objects.get(email='james@schedjuice.com')
      u.set_password('password123')
      u.is_password_change_required = False
      u.save()
  ```

### Critical gotchas

1. **PyYAML / ruamel.yaml**: The pinned versions (PyYAML==6.0, ruamel.yaml==0.17.26) don't build on Python 3.12. Install newer compatible versions first (PyYAML>=6.0.1, ruamel.yaml>=0.18.0) then install the rest of requirements.txt excluding those pins.

2. **setuptools**: Pin `setuptools<82` in the venv to keep `pkg_resources` available (needed by `drf-yasg`).

3. **npm install for frontend**: Requires `--legacy-peer-deps` due to React 19 vs `@azure/msal-react` peer dep conflict.

4. **Tenant header**: All API requests need `X-Tenant: <domain>` header. Use the value from `DEV_TENANT_DOMAIN` env var.

5. **Docker daemon** (only needed for local PostgreSQL fallback): Start with `sudo dockerd &>/tmp/dockerd.log &` and fix permissions with `sudo chmod 666 /var/run/docker.sock`.

### Lint / Test / Build

- **Frontend lint**: `npm run lint` (in schedjuice-reimagined-fe)
- **Frontend tests**: `npm run test:unit` (vitest, 82 tests)
- **Frontend build**: `npm run build`
- **Backend lint**: `black --check .` (in schedjuice-reimagined-be, with venv activated)
- **Backend tests**: `./scripts/run_backend_tests.sh <test-target>` (local Docker Postgres on port 55432; always `--keepdb --noinput`; never use Railway for tests)

### Local PostgreSQL fallback (optional)

If the Railway dev database is unavailable, you can use a local PostgreSQL:
```bash
sudo dockerd &>/tmp/dockerd.log &
sudo chmod 666 /var/run/docker.sock
docker run -d --name schedjuice-postgres -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=db -e POSTGRES_USER=user postgres:15
docker exec schedjuice-postgres psql -U user -d db -c "CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public; CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;"
export DATABASE_URL=postgres://user:password@127.0.0.1:5432/db
source env/bin/activate
python manage.py migrate_schemas --shared
echo "yes" | python manage.py load-tenants
python manage.py load-data --schema=xschedjuice
python manage.py load-data --schema=xteachersu
```

## Domain: course teaching vs oversight

Full spec: [`docs/superpowers/specs/2026-06-28-course-oversight-scope-design.md`](../docs/superpowers/specs/2026-06-28-course-oversight-scope-design.md) (monorepo root).

- **Teaching** — `UserCourse` with `assigned_as_role.seniority` ∈ `{MAIN_TEACHER, ASSISTANT_TEACHER}`. Drives payroll, collision, rosters, teaching metrics. Canonical: `app_course/teaching_assignment.py` → `is_teaching_assignment`.
- **Oversight (subset visibility)** — `User.scoped_programs` / `User.scoped_categories` (M2M). Extends `scope_courses_for_user`; MS Teams **owners** for matching courses. Not teaching.
- **Full school visibility** — RBAC `course.view_all` (no per-course assignment needed).
- **Legacy** — per-course `UserCourse` with non-MT/AT seniority was a workaround for oversight; deprecate in favor of scope; never count as teaching.

Dean who also teaches: scope for their programs/categories + MT/AT `UserCourse` only on courses they teach.

See also `.cursor/rules/course-teaching-vs-oversight.mdc`.

## RBAC enforcement
Default is `RBAC_ENFORCE=enforce`. Set `RBAC_ENFORCE=log_only` to revert to non-blocking shadow mode during migration debugging.

While in `log_only`, run `python manage.py rbac_shadow_report` to export would-be permission denials to:
- `var/rbac/shadow-denials.jsonl` (machine-readable, one gap per line)
- `var/rbac/shadow-denials.md` (ranked summary)
Use these to find endpoints/routes still missing a `required_permissions` declaration during the RBAC enforcement migration (Plan 2).

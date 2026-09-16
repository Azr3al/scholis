# User search FTS — rollout checklist

FTS is always on for `q` search (trigram fallback when FTS returns too few hits).

`search_text` is maintained by **Postgres triggers** on `app_department_userdepartment`, `app_department_department`, and `app_department_job` (not Django signals). `search_vector` is a generated column on `app_auth_user`.

## Staging

1. Run tenant migrations:
   ```bash
   python manage.py migrate_schemas --shared
   python manage.py migrate_schemas
   ```
2. Backfill denormalised text:
   ```bash
   python manage.py backfill_user_search_text
   # or per schema: --schema=xschedjuice
   ```
3. Verify index usage (per tenant schema):
   ```sql
   EXPLAIN ANALYZE
   SELECT id, name FROM app_auth_user
   WHERE search_vector @@ websearch_to_tsquery('simple', 'james')
   ORDER BY ts_rank(search_vector, websearch_to_tsquery('simple', 'james')) DESC
   LIMIT 5;
   ```
   Expect `Bitmap Index Scan` on `user_search_vector_gin`.

4. Run tests:
   ```bash
   python manage.py test app_auth.tests.test_user_search_fts app_auth.tests.test_user_search_fuzzy
   ```

## Production enablement

1. Deploy backend + frontend.
2. Run migrations and backfill on production (off-peak).
3. Watch logs for `user_search_fts_fallback` and p95 latency.
4. Keep trigram indexes from `0046` for one release before cleanup.

## API

- Typeahead: `GET /api/v1/users/suggest?q=`
- Full results: User Hub, `/users` DataTable, pickers — `POST /api/v1/users/search?q=…`

## Frontend

- User Hub already uses `q` on `POST /users/search`.
- `/users` DataTable, student registration, user-schedule shortcut, and department member chooser migrated to `q` / `GET /users/suggest` helper (`src/app/client-api/user-search.ts`).
- `courses/:id/available-users` — supports `q` (FTS/trigram via `apply_user_search_q_with_meta`) alongside `filter_params` / `exclude_params` for teacher assignment search.
- **Intentionally unchanged (audit):**
  - `courses/:id/student-candidates/search` — enrolled-student exclusion.
  - Bulk `email__in` lookups (e.g. bulk-add-members).
  - `user-courses` DataTables with `user__email` wildcard (course members page).
  - Finance/admin DataTables without wildcard search (column filters only).

# Course search FTS — rollout checklist

FTS is always on for `q` search (trigram fallback when FTS returns zero hits).

## Behavior

- Every token in `q` is prefix-matched (`token:*`) via a raw tsquery built in `utilitas/search.py`.
- FTS hits are never cannibalised by trigram — trigram only runs when FTS returns zero rows (`COURSE_SEARCH_FALLBACK_MIN_RESULTS` defaults to `1`).
- FTS results are ordered by: `exact_substring` (title `icontains` q) DESC → `ts_rank` DESC → `created_at` DESC.
- Trigram fallback uses `TrigramWordSimilarity` (length-independent), so a long title containing the query as a sub-phrase still scores well.

## Staging

Migration `0086` defines `immutable_unaccent()` because Postgres requires generated-column expressions to be immutable (`unaccent()` alone is not). The migration forces the `unaccent` extension into `public` via `ALTER EXTENSION ... SET SCHEMA` (because `CREATE EXTENSION IF NOT EXISTS` is a no-op when the extension already lives in another schema) and wraps `public.unaccent($1)`. Migration `0091` is the authoritative bulletproof repair if any tenant ended up in an inconsistent state during earlier iterations.

1. Run tenant migrations:
   ```bash
   python manage.py migrate_schemas --shared
   python manage.py migrate_schemas
   ```
2. Backfill denormalised text:
   ```bash
   python manage.py backfill_course_search_text
   # or per schema: --schema=xschedjuice
   # large tenants: --bulk
   ```
3. Verify index usage (per tenant schema):
   ```sql
   EXPLAIN ANALYZE
   SELECT id, title FROM app_course_course
   WHERE search_vector @@ websearch_to_tsquery('simple', 'intro')
   ORDER BY ts_rank(search_vector, websearch_to_tsquery('simple', 'intro')) DESC
   LIMIT 5;
   ```
   Expect `Bitmap Index Scan` on `course_search_vector_gin`.

4. Run tests:
   ```bash
   python manage.py test app_course.tests.test_search_fts app_course.tests.test_course_search_fuzzy
   ```

## Production enablement

1. Deploy backend + frontend.
2. Run migrations and backfill on production (off-peak).
3. Watch logs for `course_search_fts_fallback` and p95 latency.
4. Keep trigram indexes for one release before cleanup.

## Frontend

- Typeahead: `GET /api/v1/courses/suggest?q=`
- Full results: `/search?q=…` (uses existing `POST /api/v1/courses/search`)
- ~~Global shortcut: Cmd/Ctrl+K in the internal top bar~~ (removed — use Academic Hub search or `/search`)

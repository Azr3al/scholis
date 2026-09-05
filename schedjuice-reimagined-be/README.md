# API for Schedjuice-reimagined

## Running backend tests

Use the local Docker Postgres test database (never Railway):

```shell
./scripts/run_backend_tests.sh                          # full suite
./scripts/run_backend_tests.sh app_chat.tests.test_dm_permissions
SCHEDJUICE_TEST_FRESH=1 ./scripts/run_backend_tests.sh  # recreate test_db
```

The script starts `schedjuice-test-db` (postgres:15 on port 55432), sets `DATABASE_URL`, and runs with `--keepdb --noinput`. Settings also enforce local-only DB hosts during `manage.py test`.

## Running the app for development

First, create a docker container for the database.

```shell
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=db -e POSTGRES_USER=user postgres
```

Finally, load the test data.

```shell
python3 manage.py migrate_schemas && python3 manage.py load-tenants && python3 manage.py load-data --schema=xteachersu && python3 manage.py load-data --schema=xschedjuice
```

Running the server locally.

```shell
python3 manage.py runserver
```

### N+1 query detection (development)

Set `NPLUSONE_ENABLED=true` alongside `DEBUG=true` in your `.env` to enable [nplusone](https://github.com/jmcarp/nplusone) lazy-load detection. Warnings appear in the console as `Potential n+1 query detected on Model.field` with hints to use `select_related()` or `prefetch_related()`. Do not enable in production.

#### JSONL capture and analysis

When nplusone is enabled, warnings are also written to `logs/nplusone/YYYY-MM-DD.jsonl` with request context (path, view, expand, query count).

Optional env vars:

- `NPLUSONE_RUN_ID=smoke-001` — tag a capture session (or send header `X-NPlusOne-Run-Id`)
- `NPLUSONE_LOG_DIR` — override log directory (default: `logs/nplusone/`)

#### Product docs video upload (GitHub Releases)

Tutorial videos for `/help` and the platform docs CMS upload to a **public GitHub repo** via the Releases API. See [`.env.example`](.env.example) for:

- `GITHUB_DOCS_VIDEO_REPO` — `owner/repo` (public)
- `GITHUB_DOCS_VIDEO_TOKEN` — PAT with upload access
- `GITHUB_DOCS_VIDEO_RELEASE_TAG` — rolling release tag (default `videos`)

For production, you can store the token encrypted on `PlatformOpsSettings` (Django shell: `PlatformOpsSettings.get_singleton().set_github_docs_video_token("ghp_...")` and set `github_docs_video_repo` / `github_docs_video_release_tag` on the same row). DB values take precedence over env.

Summarize captures for AI fix planning:

```bash
./env/bin/python scripts/nplusone/summarize.py logs/nplusone/*.jsonl \
  --output logs/nplusone/reports/summary.json
```

See [`scripts/nplusone/README.md`](scripts/nplusone/README.md) and [`docs/NPLUSONE_AGENT_WORKFLOW.md`](docs/NPLUSONE_AGENT_WORKFLOW.md).

Railway start command (Daphne ASGI -- required for WebSocket/chat support)

```shell
daphne -b 0.0.0.0 -p $PORT schedjuice_backend.asgi:application
```

Key Railway env vars for the **rest api** service:

- `START_COMMAND=daphne -b 0.0.0.0 -p $PORT schedjuice_backend.asgi:application` -- ASGI + WebSocket
- `CHAT_AND_WEBSOCKET_ENABLED=True` -- enable real-time chat (requires Redis)
- `CONN_MAX_AGE=0` -- close DB connections after each request (required for ASGI: thread-per-request means a persistent connection is never reused, so a non-zero value only delays the close until GC)

`railway.json` preDeploy runs `scripts/railway_predeploy.sh`, which applies
`migrate_schemas` only when `START_COMMAND` contains `daphne` (REST API). Broker,
Celery, and Broker Long skip migrations. Override per service with
`RUN_MIGRATE_SCHEMAS=true|false`.

For **Broker** / **Broker Long** services, set `CONN_MAX_AGE=60` (persistent connections are safe for sync workers).

### Known bugs

- (kinda fixed. No need to worry for now.) out of sync sequence. Need to look into migrations. (https://stackoverflow.com/questions/19135161/django-db-utils-integrityerror-duplicate-key-value-violates-unique-constraint)

### S3 configuration

Username and password can only be obtained after enabling console access. For access key, need to generate it.

### How to migrate data

```shell
pg_dump -d <db_name> -U <username> -p <port> -h <host> -f <outputfile.sql>
scp -i <private_key> <username>@<host>:<path/to/file> <download_location>
cat <dump_file.sql> | docker exec -i <container_name> psql -U <username> -d <database>
```

### Restoring db

Download the dump file from Digital Ocean.

```shell
pg_restore -U <username> -h <host> -p <port> -W -F t -d <db_name> <dump_file_name>
```

#### Example

```shell
pg_restore -U postgres -h containers-us-west-15.railway.app -p 6473 -W -F t -d railway mydatabasebackup
```

### Running locally (for Mashi)

1. Run a Redis server with docker

```shell
docker run --rm -p 6379:6379 redis:7
```

2. Install requirements (if applicable)

```shell
pip install -r requirements.txt
```

3. Run the Django server

```shell
python3 manage.py runserver
```

4. Run the celery worker (for chat)

```shell
celery -A schedjuice_backend worker -l INFO --pool=solo
```

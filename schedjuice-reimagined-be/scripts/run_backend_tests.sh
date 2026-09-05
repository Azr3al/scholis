#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$REPO_ROOT/env/bin/python"
DB_CONTAINER_NAME="schedjuice-test-db"
DB_IMAGE="postgres:15"
DB_PORT="55432"
DB_USER="user"
DB_PASSWORD="password"
DB_NAME="db"
DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Missing virtualenv Python at: $PYTHON_BIN"
  echo "Create it with: python -m venv env && ./env/bin/pip install -r requirements.txt"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not installed."
  exit 1
fi

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -qx "$DB_CONTAINER_NAME"
}

container_running() {
  docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER_NAME"
}

if ! container_exists; then
  echo "Creating local Postgres container: $DB_CONTAINER_NAME"
  docker run -d \
    --name "$DB_CONTAINER_NAME" \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_PASSWORD="$DB_PASSWORD" \
    -e POSTGRES_DB="$DB_NAME" \
    -p "${DB_PORT}:5432" \
    "$DB_IMAGE" >/dev/null
elif ! container_running; then
  echo "Starting existing Postgres container: $DB_CONTAINER_NAME"
  docker start "$DB_CONTAINER_NAME" >/dev/null
fi

echo "Waiting for Postgres to be ready..."
until docker exec "$DB_CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
  sleep 1
done

cd "$REPO_ROOT"
export DATABASE_URL

KEEPDB_ARGS=(--keepdb --noinput)
if [[ "${SCHEDJUICE_TEST_FRESH:-}" == "1" ]]; then
  KEEPDB_ARGS=(--noinput)
fi

# Optional alternate test DB name (avoids a corrupted test_db), e.g. test2
if [[ -n "${SCHEDJUICE_TEST_DB_NAME:-}" ]]; then
  export SCHEDJUICE_TEST_DB_NAME
fi

if [[ $# -eq 0 ]]; then
  echo "Discovering all backend test modules..."
  TEST_LABELS=()
  while IFS= read -r label; do
    TEST_LABELS+=("$label")
  done < <("$PYTHON_BIN" "$REPO_ROOT/scripts/discover_backend_test_labels.py")
  set -- "${TEST_LABELS[@]}"
fi

echo "Running backend tests with local Docker Postgres..."
exec "$PYTHON_BIN" manage.py test "$@" -v 1 "${KEEPDB_ARGS[@]}"

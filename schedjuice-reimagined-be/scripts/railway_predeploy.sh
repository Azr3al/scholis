#!/bin/sh
set -e

# Railway preDeploy runs for every service that shares railway.json.
# Only the REST API should apply DB migrations; workers/brokers must skip.
#
# Detection order:
# 1. RUN_MIGRATE_SCHEMAS=true|false — explicit per-service override
# 2. START_COMMAND contains "daphne" — REST API ASGI service

case "${RUN_MIGRATE_SCHEMAS:-}" in
  true|1|yes|TRUE|YES)
    echo "Running migrate_schemas (RUN_MIGRATE_SCHEMAS=${RUN_MIGRATE_SCHEMAS})"
    exec python manage.py migrate_schemas --noinput
    ;;
  false|0|no|FALSE|NO)
    echo "Skipping migrate_schemas (RUN_MIGRATE_SCHEMAS=${RUN_MIGRATE_SCHEMAS})"
    exit 0
    ;;
esac

case "${START_COMMAND:-}" in
  *daphne*)
    echo "Running migrate_schemas (REST API daphne service)"
    exec python manage.py migrate_schemas --noinput
    ;;
  *)
    echo "Skipping migrate_schemas (service START_COMMAND=${START_COMMAND:-<unset>})"
    exit 0
    ;;
esac

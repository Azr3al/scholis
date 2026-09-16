#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$REPO_ROOT/scripts/run_backend_tests.sh" \
  app_attendance.tests.test_checkout.TeacherCheckoutCappingTenantAwareTest

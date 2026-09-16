"""
Tenant-aware Celery task base for django-tenant-schemas compatibility.

Celery workers run outside the request context, so HTTP headers (e.g. X-Tenant)
are not available. Tasks that access tenant-scoped models must run inside
schema_context(schema_name). Use TenantTask or pass schema_name explicitly.

Usage:
    from celery import shared_task
    from app_utils.celery_tasks import TenantTask

    @shared_task(base=TenantTask, bind=True)
    def my_tenant_task(self, schema_name: str, ...):
        # schema_context(schema_name) is already set by TenantTask
        ...
"""
from celery import Task
from tenant_schemas.utils import schema_context


class TenantTask(Task):
    """
    Celery task base that runs the task body inside schema_context(schema_name).

    The first positional argument must be schema_name (str). The task will
    set the database search path to that schema before executing.
    """

    def __call__(self, *args, **kwargs):
        if args and isinstance(args[0], str):
            schema_name = args[0]
            with schema_context(schema_name):
                return self.run(*args, **kwargs)
        return self.run(*args, **kwargs)

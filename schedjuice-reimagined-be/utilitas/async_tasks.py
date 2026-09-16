"""Decorators that turn ordinary functions into tenant-aware django-q tasks."""
from __future__ import annotations

import functools
import logging
from typing import Callable, Type

from django.db.models import Model
from django_q.tasks import async_task
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization

logger = logging.getLogger(__name__)


def tenant_async(*, entity: Type[Model] | None = None, on_missing_entity: str = "warn"):
    """
    Wrap an async task whose first arg is an entity id and second is schema_name.

    The wrapped function is invoked as `fn(entity, tenant, *rest, **kwargs)`. The wrapper
    handles public-schema tenant lookup, schema switch, entity fetch, and not-found logging.

    on_missing_entity: "warn" (default) returns None; "raise" propagates a LookupError;
    "passthrough" calls fn(None, tenant, *rest, **kwargs).
    """

    def decorator(fn: Callable):
        @functools.wraps(fn)
        def wrapper(entity_id, schema_name, *args, **kwargs):
            with schema_context(get_public_schema_name()):
                tenant = Organization.objects.filter(schema_name=schema_name).first()
            if tenant is None:
                logger.warning(
                    "%s: tenant not found for schema_name=%s",
                    fn.__name__,
                    schema_name,
                )
                return None

            with schema_context(schema_name):
                obj = None
                if entity is not None:
                    obj = entity.objects.filter(id=entity_id).first()
                    if obj is None:
                        if on_missing_entity == "raise":
                            raise LookupError(
                                f"{entity.__name__}({entity_id}) not in {schema_name}"
                            )
                        if on_missing_entity == "warn":
                            logger.warning(
                                "%s: %s %s not found in schema %s",
                                fn.__name__,
                                entity.__name__,
                                entity_id,
                                schema_name,
                            )
                            return None
                return fn(
                    obj if entity is not None else entity_id,
                    tenant,
                    *args,
                    **kwargs,
                )

        wrapper.__wrapped__ = fn
        return wrapper

    return decorator


def django_q_task(fn: Callable) -> Callable:
    """
    Mark function as a django-q task. Adds `.delay(*args, **kwargs)` that invokes
    `async_task("module.fn_name", *args, **kwargs)`. Preserves direct callability.
    """
    dotted = f"{fn.__module__}.{fn.__name__}"

    def delay(*args, **kwargs):
        return async_task(dotted, *args, **kwargs)

    fn.delay = delay
    fn.dotted_path = dotted
    return fn

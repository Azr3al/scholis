"""
Connecting a tenant to Scholis.

One tenant is one school is one Scholis organisation. ``connect_tenant`` is the
only thing that creates that relationship, and it is idempotent: a caller that
times out and retries must get back the connection it already made rather than a
second organisation with half the papers in each.

The order of operations is not arbitrary. The webhook URL embeds this
connection's routing token, so the row has to exist before the endpoint can be
registered; and registering an endpoint needs the org credential, so the org has
to be provisioned first. Each step is recorded as it completes, so a failure
halfway leaves something re-runnable rather than something half-configured and
silent about it.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from django.db import transaction

from app_scholis.client import ScholisClient
from app_scholis.conf import ScholisNotConfigured, get_settings
from app_scholis.errors import ScholisError, ScholisNotConfiguredError
from app_scholis.models import ScholisConnection

logger = logging.getLogger(__name__)


class ConnectionIncomplete(ScholisError):
    """
    The organisation exists at Scholis but this tenant has no usable key.

    Scholis returns the org secret only on the call that created it, and will not
    mint another on a retry -- quietly handing out credentials nobody recorded is
    exactly what it refuses to do. So this is a human step: somebody has to create
    a key in Scholis's dashboard, or rotate one, and paste it in.
    """


@dataclass(frozen=True)
class ConnectionStatus:
    connection: ScholisConnection
    created: bool
    webhook_registered: bool


def current_schema_name() -> str:
    """
    The schema the caller is already inside.

    Set by the tenant middleware for a request and by ``TenantTask`` for a Celery
    task. Read rather than passed around because every caller here is already
    tenant-scoped by the time it runs.
    """
    from django.db import connection as db_connection

    schema = getattr(db_connection, "schema_name", "") or getattr(
        getattr(db_connection, "tenant", None), "schema_name", ""
    )
    if not schema:
        raise ScholisError(
            "Cannot resolve the current tenant schema; run inside a request or a "
            "TenantTask."
        )
    return schema


def get_active_connection() -> ScholisConnection | None:
    """The live connection for this tenant, or None if it has never connected."""
    return ScholisConnection.objects.filter(is_active=True).order_by("id").first()


def require_active_connection() -> ScholisConnection:
    connection = get_active_connection()
    if connection is None or not connection.has_credentials:
        raise ScholisError(
            "This school is not connected to Scholis yet.", code="not_connected"
        )
    return connection


def webhook_url(connection: ScholisConnection) -> str:
    """
    The absolute URL Scholis should post deliveries to.

    Built from ``SCHOLIS_WEBHOOK_PUBLIC_BASE`` rather than from the current
    request, because the request that registers it may arrive through a proxy, a
    tunnel or a load balancer whose host is not the one Scholis can reach. Getting
    this wrong does not fail loudly at registration time -- it fails days later as
    deliveries that never arrive.
    """
    try:
        configured = get_settings()
    except ScholisNotConfigured as e:
        raise ScholisNotConfiguredError(str(e)) from e
    if not configured.public_base:
        raise ScholisNotConfiguredError(
            "SCHOLIS_WEBHOOK_PUBLIC_BASE is not set, so there is no public URL to "
            "register for webhooks."
        )
    return f"{configured.public_base}/{connection.webhook_path}"


@transaction.atomic
def connect_tenant(
    *, school_name: str | None = None, external_ref: str | None = None
) -> ConnectionStatus:
    """
    Provision this tenant at Scholis and register a webhook endpoint.

    Safe to call repeatedly. Returns what it did rather than raising when there
    was nothing to do, so a settings screen can offer "Connect" without first
    having to know whether it is already connected.
    """
    schema = current_schema_name()
    ref = (external_ref or schema).strip()
    if not ref:
        raise ScholisError("An external reference is required to provision.")

    name = (school_name or _tenant_school_name() or schema).strip()

    connection, created = ScholisConnection.objects.get_or_create(
        external_ref=ref,
        defaults={"school_name": name, "is_active": True},
    )
    if created:
        logger.info("Scholis: created connection row for %s", ref)
    elif school_name and connection.school_name != name:
        connection.school_name = name

    # Already fully wired up: nothing to do, and re-provisioning would only risk
    # discovering that the key we hold has been rotated out from under us.
    if connection.has_credentials and connection.webhook_endpoint_id:
        return ConnectionStatus(
            connection=connection, created=False, webhook_registered=True
        )

    if not connection.has_credentials:
        _provision(connection, ref=ref, name=name)

    webhook_registered = connection.webhook_endpoint_id is not None
    if not webhook_registered:
        _register_webhook(connection)

    connection.save(update_fields=["updated_at"])
    return ConnectionStatus(
        connection=connection, created=created, webhook_registered=True
    )


def _provision(connection: ScholisConnection, *, ref: str, name: str) -> None:
    """Ask Scholis for an organisation and record the key it hands back."""
    platform = ScholisClient.for_platform()
    result = platform.provision_org(external_ref=ref, name=name)

    org_id = result.get("orgId")
    if org_id:
        connection.scholis_org_id = org_id
    connection.school_name = result.get("name") or name
    connection.connected_at = datetime.now(timezone.utc)

    key = result.get("key")
    if isinstance(key, dict) and key.get("token"):
        connection.set_api_key(
            key_id=str(key.get("keyId") or ""), token=str(key["token"])
        )
        connection.save()
        logger.info("Scholis: provisioned org %s for %s", org_id, ref)
        return

    # Scholis found an existing organisation and did not re-mint its secret. If
    # we hold a key from an earlier run that is fine; if we do not, no amount of
    # retrying will produce one.
    if not connection.has_credentials:
        raise ConnectionIncomplete(
            "That school already exists at Scholis but this tenant has no API key "
            "for it. Create or rotate one in Scholis and record it here."
        )
    connection.save()


def _register_webhook(connection: ScholisConnection) -> None:
    """
    Register the delivery endpoint and store the signing secret.

    The secret is shown once, by Scholis, at registration. Storing it in the same
    transaction that records the endpoint id is what makes that single showing
    survivable: there is no window where one is recorded and the other is not.
    """
    # Not named `org_client`: that would shadow the function on the right-hand
    # side and raise UnboundLocalError, because Python resolves the name as local
    # for the whole function once it is assigned anywhere in it.
    client = org_client(connection)
    url = webhook_url(connection)
    endpoint = client.add_webhook(url=url)

    signing_secret = endpoint.get("signingSecret")
    endpoint_id = endpoint.get("id")
    if not signing_secret or not endpoint_id:
        raise ScholisError(
            "Scholis registered the webhook but did not return a signing secret."
        )

    connection.set_webhook(
        endpoint_id=str(endpoint_id), signing_secret=str(signing_secret)
    )
    connection.save()
    logger.info(
        "Scholis: registered webhook %s for %s", endpoint_id, connection.external_ref
    )


def org_client(connection: ScholisConnection) -> ScholisClient:
    token = connection.api_token
    if not token:
        raise ScholisError(
            "This connection has no API key, so it cannot call Scholis.",
            code="no_credentials",
        )
    return ScholisClient(token=token)


def _tenant_school_name() -> str:
    """
    The organisation's own name, for the label Scholis shows in its dashboard.

    Best effort: a tenant whose Organisation row cannot be read still connects,
    because the schema name is a perfectly good identifier and a missing display
    name is not a reason to refuse.
    """
    try:
        from tenant_schemas.utils import get_tenant_model

        schema = current_schema_name()
        org = get_tenant_model().objects.filter(schema_name=schema).first()
        return (getattr(org, "name", "") or "").strip()
    except Exception as e:  # noqa: BLE001 - display name only, never load bearing
        logger.debug("Scholis: could not read tenant name: %s", e)
        return ""


__all__ = [
    "ConnectionIncomplete",
    "ConnectionStatus",
    "connect_tenant",
    "get_active_connection",
    "org_client",
    "require_active_connection",
    "webhook_url",
]

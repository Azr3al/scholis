from django.apps import AppConfig
from django.conf import settings


def _patch_silk_garbage_collect_deadlock_safe() -> None:
    """
    Silk runs garbage_collect() on every Request.save(). Under concurrent API traffic
    (e.g. multiple /courses/search in flight), parallel DELETEs on silk_response deadlock.
    Serialize GC with a Postgres advisory lock; skip if another worker holds it.
    """
    import silk.models as silk_models
    from django.db import OperationalError, connection

    if getattr(silk_models.Request.garbage_collect, "_schedjuice_patched", False):
        return

    _GC_LOCK_ID = 0x53494C4B  # "SILK"
    original_gc = silk_models.Request.garbage_collect.__func__

    @classmethod
    def safe_garbage_collect(cls, force=False):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_try_advisory_lock(%s)", [_GC_LOCK_ID])
                got_lock = cursor.fetchone()[0]
                if not got_lock:
                    return
                try:
                    return original_gc(cls, force=force)
                finally:
                    cursor.execute("SELECT pg_advisory_unlock(%s)", [_GC_LOCK_ID])
        except OperationalError:
            return

    safe_garbage_collect._schedjuice_patched = True
    silk_models.Request.garbage_collect = safe_garbage_collect


def _patch_silk_explain_safe_for_json_params() -> None:
    """
    Silk runs EXPLAIN in a ``finally`` after each captured SQL. It rebuilds parameters
    with ``force_str`` on every bind value. That breaks JSONField / jsonb binds (dicts,
    adapter wrappers, etc.): PostgreSQL then sees malformed JSON (e.g. Python repr with
    single quotes) and raises ``DataError`` or aborts the transaction.

    Runtime proof (editor-sync): validated ``intro_body`` / ``outro_body`` are already
    ``dict`` in ``QuizSerializer.update``, while the failure stack is still
    ``silk.sql._explain_query`` → ``cursor.execute(EXPLAIN ...)``.

    **Fix:** Do not run Silk EXPLAIN analysis at all for this project. Profiling still
    records query text and timing; only the optional ``analysis`` field stays empty.

    Must run after apps are ready (importing ``silk.sql`` loads silk models).
    """
    import silk.sql as silk_sql

    if getattr(silk_sql._explain_query, "_schedjuice_patched", False):
        return

    def _safe_explain_query(connection, query, params):
        return None

    _safe_explain_query._schedjuice_patched = True
    silk_sql._explain_query = _safe_explain_query


class AppChatConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_chat"

    def ready(self):
        import app_chat.signals  # noqa: F401
        import app_chat.signals_enrollment  # noqa: F401

        if getattr(settings, "SILK_ENABLED", False):
            _patch_silk_garbage_collect_deadlock_safe()
            _patch_silk_explain_safe_for_json_params()

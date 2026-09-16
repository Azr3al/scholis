"""Facade for in-process AI requests."""
from __future__ import annotations

import json

from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.client import AIResult, OpenAIClient
from app_ai.exceptions import AIPromptBlocked, AIRateLimited, AIUserQuotaExceeded
from app_ai.guardrails import evaluate_prompt
from app_ai.disambiguation import get_active_pending, try_resolve_pending_turn
from app_ai.confirmation import get_active_write_confirmation, try_resolve_pending_confirmation
from app_ai.models import AIRequestLog
from app_ai.quota import assert_quota_allows, assert_user_quota_allows
from app_ai.request_log import record_request_log
from app_ai.tools.base import Tool
from app_ai.tools.intent import TurnIntent, classify_turn_intent
from app_ai.tools.registry import (
    list_tools,
    list_tools_for_cache,
    list_tools_for_turn,
)
from app_organization.models import Organization

_WRITE_TOOL_BLOCKED_ERROR = "Tool not available for this turn."


def _append_dynamic_block(existing: str, block: str) -> str:
    block = (block or "").strip()
    if not block:
        return existing
    return f"{existing}\n\n{block}" if existing else block


def _write_tool_blocked(tool_calls: list[dict] | None) -> bool:
    if not tool_calls:
        return False
    return any(
        (call.get("error") or "") == _WRITE_TOOL_BLOCKED_ERROR for call in tool_calls
    )


def _select_tools(
    tools: list[Tool] | None,
    *,
    intent: TurnIntent,
    tenant: Organization | None,
) -> list[Tool]:
    if tools is not None:
        return tools
    if tenant is not None:
        return list_tools_for_turn(intent=intent, org=tenant)
    return list_tools()


class AIService:
    def __init__(self, client: OpenAIClient | None = None):
        self.client = client or OpenAIClient()

    def _current_tenant(self) -> Organization | None:
        schema = getattr(connection, "schema_name", None) or ""
        if not schema or schema == get_public_schema_name():
            return None
        with schema_context(get_public_schema_name()):
            return Organization.objects.filter(schema_name=schema).first()

    def run(
        self,
        prompt: str,
        user,
        *,
        channel_key: str | None = None,
        tools: list[Tool] | None = None,
        model: str | None = None,
        feature: str = "ai_query",
        system_context: str = "",
        history: list[dict[str, str]] | None = None,
        max_iterations: int | None = None,
    ) -> AIResult:
        tenant = self._current_tenant()
        resolved_model = model
        resolved_iterations = max_iterations
        dynamic_context = ""
        disambiguation_fast_path = False
        log_result: AIResult | None = None
        log_outcome = AIRequestLog.Outcome.SUCCESS
        log_response = ""
        log_error = ""
        available_tool_names: list[str] = []

        try:
            if tenant is not None:
                guard = evaluate_prompt(
                    prompt,
                    user=user,
                    org=tenant,
                    history=history,
                )
                if not guard.allowed:
                    if guard.reason == "rate_limited":
                        log_outcome = AIRequestLog.Outcome.RATE_LIMITED
                        log_response = guard.message or "Rate limited."
                        raise AIRateLimited(
                            guard.message or "Rate limited.",
                            guard.retry_after_seconds or 60,
                        )
                    log_outcome = AIRequestLog.Outcome.BLOCKED
                    log_response = guard.message or "Prompt blocked."
                    raise AIPromptBlocked(
                        guard.message or "Prompt blocked.",
                        reason=guard.reason,
                    )
                assert_user_quota_allows(
                    tenant, user.id if user is not None else None
                )
                assert_quota_allows(tenant)
                if not tenant.is_ai_enabled:
                    raise RuntimeError("AI is disabled for this organization.")
                from app_ai.tenant_context import (
                    build_system_context,
                    resolve_ai_model,
                    resolve_max_tool_iterations,
                )

                if not system_context:
                    system_context = build_system_context(tenant)
                if resolved_model is None:
                    resolved_model = resolve_ai_model(tenant)
                if resolved_iterations is None:
                    resolved_iterations = resolve_max_tool_iterations(tenant)

            if tenant is not None and channel_key:
                from app_ai.roster_intent import try_resolve_roster_switch

                switch_turn = try_resolve_roster_switch(
                    prompt=prompt,
                    user=user,
                    channel_key=channel_key,
                    org=tenant,
                )
                if switch_turn is not None:
                    if switch_turn.cancelled:
                        dynamic_context = _append_dynamic_block(
                            dynamic_context,
                            "The user cancelled the pending roster switch.",
                        )
                    elif switch_turn.executed and switch_turn.payload is not None:
                        dynamic_context = _append_dynamic_block(
                            dynamic_context,
                            f"Tool result: {json.dumps(switch_turn.payload, default=str)}",
                        )
                        disambiguation_fast_path = True
                    elif switch_turn.reminder:
                        dynamic_context = _append_dynamic_block(
                            dynamic_context,
                            f"Pending roster switch: {switch_turn.reminder}",
                        )
                        disambiguation_fast_path = True

                confirm_turn = try_resolve_pending_confirmation(
                    prompt=prompt,
                    user=user,
                    channel_key=channel_key,
                    org=tenant,
                )
                if confirm_turn is not None:
                    if confirm_turn.cancelled:
                        dynamic_context = _append_dynamic_block(
                            dynamic_context,
                            "The user cancelled the pending roster confirmation.",
                        )
                    elif confirm_turn.executed and confirm_turn.payload is not None:
                        dynamic_context = _append_dynamic_block(
                            dynamic_context,
                            f"Tool result: {json.dumps(confirm_turn.payload, default=str)}",
                        )
                        disambiguation_fast_path = True
                    elif confirm_turn.reminder:
                        dynamic_context = _append_dynamic_block(
                            dynamic_context,
                            f"Pending roster confirmation: {confirm_turn.reminder}",
                        )
                        disambiguation_fast_path = True

                pending_turn = try_resolve_pending_turn(
                    prompt=prompt,
                    user=user,
                    channel_key=channel_key,
                    org=tenant,
                )
                if pending_turn is not None:
                    if pending_turn.cancelled:
                        dynamic_context = _append_dynamic_block(
                            dynamic_context,
                            "The user cancelled the pending disambiguation.",
                        )
                    elif pending_turn.executed and pending_turn.payload is not None:
                        dynamic_context = _append_dynamic_block(
                            dynamic_context,
                            f"Tool result: {json.dumps(pending_turn.payload, default=str)}",
                        )
                        disambiguation_fast_path = True
                    elif pending_turn.reminder:
                        dynamic_context = _append_dynamic_block(
                            dynamic_context,
                            f"Pending disambiguation: {pending_turn.reminder}",
                        )
                        disambiguation_fast_path = True

            if tenant is not None:
                from app_ai.org_datetime import build_org_datetime_context

                dynamic_context = _append_dynamic_block(
                    dynamic_context,
                    build_org_datetime_context(tenant),
                )

            if user is not None:
                from app_ai.user_preferences import build_user_preferences_context

                dynamic_context = _append_dynamic_block(
                    dynamic_context,
                    build_user_preferences_context(user),
                )

            if user is not None and tenant is not None:
                from app_ai.actor_context import build_actor_context

                dynamic_context = _append_dynamic_block(
                    dynamic_context,
                    build_actor_context(user, org=tenant),
                )

            if disambiguation_fast_path:
                available_tool_names = []
                log_result = self.client.generate_with_tools(
                    prompt,
                    user=user,
                    tools=[],
                    model=resolved_model,
                    feature=feature,
                    system_context=system_context,
                    dynamic_context=dynamic_context,
                    history=history,
                    max_iterations=1,
                    channel_key=channel_key,
                    org=tenant,
                )
                log_outcome = log_result.outcome
                return log_result

            has_pending = False
            if tenant is not None and channel_key and user is not None:
                has_pending = bool(
                    get_active_write_confirmation(user=user, channel_key=channel_key)
                    or get_active_pending(user=user, channel_key=channel_key)
                )

            intent = classify_turn_intent(prompt, force_write=has_pending)
            if intent == TurnIntent.WRITE and not disambiguation_fast_path:
                from app_ai.prompts import build_roster_write_context

                dynamic_context = _append_dynamic_block(
                    dynamic_context,
                    build_roster_write_context(),
                )
            selected = _select_tools(tools, intent=intent, tenant=tenant)
            available_tool_names = [t.name for t in selected]
            cache_tools = list_tools_for_cache(tenant) if tenant is not None else None
            log_result = self.client.generate_with_tools(
                prompt,
                user=user,
                tools=selected,
                cache_tools=cache_tools,
                turn_intent=intent,
                model=resolved_model,
                feature=feature,
                system_context=system_context,
                dynamic_context=dynamic_context,
                history=history,
                max_iterations=resolved_iterations,
                channel_key=channel_key,
                org=tenant,
            )
            if intent == TurnIntent.READ and _write_tool_blocked(log_result.tool_calls):
                intent = TurnIntent.WRITE
                from app_ai.prompts import build_roster_write_context

                dynamic_context = _append_dynamic_block(
                    dynamic_context,
                    build_roster_write_context(),
                )
                selected = _select_tools(tools, intent=intent, tenant=tenant)
                available_tool_names = [t.name for t in selected]
                log_result = self.client.generate_with_tools(
                    prompt,
                    user=user,
                    tools=selected,
                    cache_tools=cache_tools,
                    turn_intent=intent,
                    model=resolved_model,
                    feature=feature,
                    system_context=system_context,
                    dynamic_context=dynamic_context,
                    history=history,
                    max_iterations=resolved_iterations,
                    channel_key=channel_key,
                    org=tenant,
                )
            log_outcome = log_result.outcome
            return log_result
        except AIPromptBlocked:
            raise
        except AIRateLimited:
            raise
        except AIUserQuotaExceeded:
            log_outcome = AIRequestLog.Outcome.USER_QUOTA_EXCEEDED
            log_response = "User monthly AI allowance exceeded."
            raise
        except Exception as exc:
            log_outcome = AIRequestLog.Outcome.ERROR
            log_error = type(exc).__name__
            raise
        finally:
            if tenant is not None:
                row = record_request_log(
                    user_id=getattr(user, "id", None),
                    feature=feature,
                    channel_key=channel_key,
                    prompt=prompt,
                    result=log_result,
                    outcome=log_outcome,
                    response_text=log_response,
                    error_type=log_error,
                )
                if (
                    row is not None
                    and log_outcome == AIRequestLog.Outcome.SUCCESS
                    and log_result is not None
                ):
                    from app_ai.tasks import judge_request_log_capability_gap

                    judge_request_log_capability_gap.delay(
                        row.id,
                        tenant.schema_name,
                        available_tool_names,
                    )

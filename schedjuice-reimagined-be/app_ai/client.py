"""OpenAI client with function-calling loop and usage capture."""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from app_ai.pricing import TokenUsage, resolve_model_name, usage_from_response
from app_ai.prompt_cache import build_prompt_cache_key
from app_ai.request_log import truncate_text
from app_ai.tools.adapters import to_openai
from app_ai.tools.base import Tool
from app_ai.tools.intent import TurnIntent
from app_ai.tools.limits import clamp_tool_payload
from app_ai.tools.registry import TOOL_REGISTRY, get_tool
from app_ai.tools.validation import ToolValidationError
from app_ai.usage import record_usage

logger = logging.getLogger(__name__)

_SESSION_CONTEXT_PREFIX = "Session context:\n"
_MAX_THINKING_STEPS = 10
_PROMPT_CACHE_TTL = "30m"
_REASONING_EFFORTS = frozenset({"none", "low", "medium", "high", "xhigh", "max"})


def _resolve_effort(value: str) -> str:
    effort = (value or "").strip().lower()
    if effort not in _REASONING_EFFORTS:
        raise ImproperlyConfigured(
            f"Invalid AI reasoning effort {value!r}; "
            f"expected one of {sorted(_REASONING_EFFORTS)}."
        )
    return effort


def _extract_reasoning_summary_text(output_items) -> str:
    chunks = []
    for item in output_items or []:
        if getattr(item, "type", "") != "reasoning":
            continue
        for part in getattr(item, "summary", None) or []:
            text = getattr(part, "text", "")
            if text:
                chunks.append(text)
    return "".join(chunks)


def _extract_message_text(output_items) -> str:
    chunks = []
    for item in output_items or []:
        if getattr(item, "type", "") != "message":
            continue
        for block in getattr(item, "content", None) or []:
            if getattr(block, "type", "") == "output_text":
                chunks.append(getattr(block, "text", "") or "")
    return "".join(chunks).strip()


def _function_call_items(output_items) -> list:
    return [i for i in output_items or [] if getattr(i, "type", "") == "function_call"]


def _finish_reason(response) -> str:
    status = str(getattr(response, "status", "") or "")
    details = getattr(response, "incomplete_details", None)
    reason = getattr(details, "reason", None) if details else None
    if reason:
        return f"{status}:{reason}"
    return status


def _append_thinking_step(
    steps: list[dict[str, Any]],
    *,
    iteration: int,
    output_items,
    usage: TokenUsage,
) -> None:
    if len(steps) >= _MAX_THINKING_STEPS:
        return
    text = truncate_text(_extract_reasoning_summary_text(output_items))
    thinking_tokens = usage.thinking_tokens
    if not text and thinking_tokens <= 0:
        return
    steps.append(
        {
            "iteration": iteration,
            "text": text,
            "thinking_tokens": thinking_tokens,
        }
    )


@dataclass
class AIResult:
    text: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    model: str = ""
    iterations: int = 0
    outcome: str = "success"
    total_tokens: int = 0
    latency_ms: int = 0
    error_type: str = ""
    thinking_steps: list[dict[str, Any]] = field(default_factory=list)


class OpenAIClient:
    def __init__(self, api_key: str | None = None, default_model: str | None = None):
        self.api_key = api_key or getattr(settings, "OPENAI_API_KEY", "")
        self.default_model = default_model or getattr(
            settings, "AI_DEFAULT_MODEL", "gpt-5.6-luna"
        )
        self.max_iterations = int(getattr(settings, "AI_MAX_TOOL_ITERATIONS", 5))

    def _build_client(self):
        from openai import OpenAI

        return OpenAI(api_key=self.api_key)

    def classify_prompt_scope(
        self,
        prompt: str,
        *,
        org_name: str,
        user,
        model: str | None = None,
    ) -> dict[str, Any]:
        """Return {"allowed": bool, "reason": str} for guardrail classifier."""
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")

        model_name = resolve_model_name(
            model
            or getattr(settings, "AI_GUARDRAIL_CLASSIFIER_MODEL", self.default_model)
        )
        client = self._build_client()
        system = (
            f"You classify whether a user message is in scope for the {org_name} "
            "school assistant. In scope: students, staff, courses, schedules, "
            "attendance, payments, school admin. Out of scope: general knowledge, "
            "math, trivia, creative writing, unrelated tasks. "
            'Reply with JSON only: {"allowed": boolean, "reason": string}.'
        )
        started = time.monotonic()
        response = client.responses.create(
            model=model_name,
            instructions=system,
            input=[{"role": "user", "content": prompt}],
            reasoning={
                "effort": _resolve_effort(
                    getattr(settings, "AI_GUARDRAIL_REASONING_EFFORT", "low")
                )
            },
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "guardrail_scope",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "allowed": {"type": "boolean"},
                            "reason": {"type": "string"},
                        },
                        "required": ["allowed", "reason"],
                        "additionalProperties": False,
                    },
                }
            },
        )
        usage = usage_from_response(getattr(response, "usage", None))
        latency_ms = int((time.monotonic() - started) * 1000)
        record_usage(
            user_id=getattr(user, "id", None),
            feature="ai_guardrail_classify",
            model=model_name,
            usage=usage,
            latency_ms=latency_ms,
            tool_iterations=1,
            status="success",
        )
        raw = _extract_message_text(getattr(response, "output", None) or [])
        parsed = json.loads(raw) if raw else {}
        return {
            "allowed": bool(parsed.get("allowed")),
            "reason": str(parsed.get("reason") or ""),
        }

    def judge_capability_gap(
        self,
        *,
        prompt: str,
        response_text: str,
        tool_calls: list[dict[str, Any]],
        available_tool_names: list[str],
        org_name: str,
        user,
        conversation_history: list[dict[str, Any]] | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        """Return capability gap judge JSON for a completed success turn."""
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")

        from app_ai.capability_gap.truncate import truncate_judge_payload

        model_name = resolve_model_name(
            model
            or getattr(
                settings,
                "AI_CAPABILITY_GAP_JUDGE_MODEL",
                getattr(settings, "AI_GUARDRAIL_CLASSIFIER_MODEL", self.default_model),
            )
        )
        client = self._build_client()
        system = (
            f"You evaluate whether a school assistant for {org_name} fully answered an "
            "in-scope school-operations question.\n\n"
            "A capability gap means the user's legitimate school-ops information need was "
            "NOT fully met because of missing tools, data not exposed to tools, RBAC/access "
            "policy, or disabled org features — NOT because search returned no matches or the "
            "user needs to clarify.\n\n"
            "Categories (use one or more in capability_gaps when is_capability_gap is true):\n"
            "- missing_tool: no available tool can fulfill the need\n"
            "- data_not_exposed: partial answer; deeper/historical data not in tool surface\n"
            "- access_policy: permission_denied or caller RBAC blocked a legitimate ask\n"
            "- feature_unavailable: org feature disabled or not configured\n"
            "- unknown: gap but category unclear\n\n"
            "NOT a capability gap: empty search results, ambiguous subject needing "
            "clarification, off-scope questions, tool-limit exhaustion.\n\n"
            "When conversation_history is non-empty:\n"
            "- Resolve the user's information need from the FULL thread, not the last "
            "message alone.\n"
            "- Short or vague follow-ups (e.g. \"what about X\", \"and Y?\", \"KET to CAE\") "
            "are common; interpret them using prior turns.\n"
            "- If the assistant's response reasonably addresses the follow-up given "
            "conversation_history, return is_capability_gap: false — even when the last "
            "message alone would be ambiguous.\n"
            "- Do not flag a gap because the response includes related data the user did "
            "not repeat in the follow-up if that is a reasonable interpretation of the "
            "thread.\n"
            "- Still flag genuine gaps when tools or data access prevented fulfilling "
            "the thread's intent.\n\n"
            "Text fields may be truncated for length. Evaluate capability gaps from the "
            "available excerpt and tool call outcomes, not from missing list rows.\n\n"
            'Reply with JSON only: {"is_capability_gap": boolean, "capability_gaps": string[], '
            '"user_intent_summary": string, "gap_reason": string, "suggested_surface": string, '
            '"domain": string}.'
        )
        payload = truncate_judge_payload(
            prompt=prompt,
            response_text=response_text,
            tool_calls=tool_calls,
            available_tool_names=available_tool_names,
            conversation_history=conversation_history,
        )
        started = time.monotonic()
        response = client.responses.create(
            model=model_name,
            instructions=system,
            input=[
                {
                    "role": "user",
                    "content": json.dumps(payload, default=str),
                }
            ],
            reasoning={
                "effort": _resolve_effort(
                    getattr(settings, "AI_CAPABILITY_GAP_REASONING_EFFORT", "medium")
                )
            },
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "capability_gap",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "is_capability_gap": {"type": "boolean"},
                            "capability_gaps": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "user_intent_summary": {"type": "string"},
                            "gap_reason": {"type": "string"},
                            "suggested_surface": {"type": "string"},
                            "domain": {"type": "string"},
                        },
                        "required": [
                            "is_capability_gap",
                            "capability_gaps",
                            "user_intent_summary",
                            "gap_reason",
                            "suggested_surface",
                            "domain",
                        ],
                        "additionalProperties": False,
                    },
                }
            },
        )
        usage = usage_from_response(getattr(response, "usage", None))
        latency_ms = int((time.monotonic() - started) * 1000)
        record_usage(
            user_id=getattr(user, "id", None),
            feature="ai_capability_gap_judge",
            model=model_name,
            usage=usage,
            latency_ms=latency_ms,
            tool_iterations=0,
            status="success",
        )
        raw = _extract_message_text(getattr(response, "output", None) or [])
        parsed = json.loads(raw) if raw else {}
        return {
            "is_capability_gap": bool(parsed.get("is_capability_gap")),
            "capability_gaps": parsed.get("capability_gaps") or [],
            "user_intent_summary": str(parsed.get("user_intent_summary") or ""),
            "gap_reason": str(parsed.get("gap_reason") or ""),
            "suggested_surface": str(parsed.get("suggested_surface") or ""),
            "domain": str(parsed.get("domain") or ""),
        }

    def _build_input(
        self,
        *,
        system_context: str,
        dynamic_context: str,
        history: list[dict[str, str]] | None,
        prompt: str,
        cache_key: str | None,
    ) -> list[Any]:
        items: list[Any] = []
        if system_context:
            block: dict[str, Any] = {"type": "input_text", "text": system_context}
            if cache_key:
                block["prompt_cache_breakpoint"] = {"mode": "explicit"}
            items.append({"role": "developer", "content": [block]})
        dynamic = (dynamic_context or "").strip()
        if dynamic:
            items.append(
                {"role": "user", "content": f"{_SESSION_CONTEXT_PREFIX}{dynamic}"}
            )
        for turn in history or []:
            text = (turn.get("text") or "").strip()
            if not text:
                continue
            role = "assistant" if turn.get("role") == "model" else "user"
            items.append({"role": role, "content": text})
        items.append({"role": "user", "content": prompt})
        return items

    def _build_request_kwargs(
        self,
        *,
        openai_tools: list[dict[str, Any]],
        cache_key: str | None,
        effort: str,
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "reasoning": {"effort": effort, "summary": "auto"},
            "store": False,
            "prompt_cache_options": {"mode": "explicit", "ttl": _PROMPT_CACHE_TTL},
        }
        if openai_tools:
            kwargs["tools"] = openai_tools
        if cache_key:
            kwargs["prompt_cache_key"] = cache_key
        return kwargs

    def generate_with_tools(
        self,
        prompt: str,
        *,
        user,
        tools: list[Tool] | None = None,
        cache_tools: list[Tool] | None = None,
        turn_intent: TurnIntent | None = None,
        model: str | None = None,
        feature: str = "ai_query",
        system_context: str = "",
        dynamic_context: str = "",
        history: list[dict[str, str]] | None = None,
        max_iterations: int | None = None,
        channel_key: str | None = None,
        org=None,
    ) -> AIResult:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")

        selected_tools = tools if tools is not None else list(TOOL_REGISTRY.values())
        allowed_tool_names = {t.name for t in selected_tools}
        cache_tool_list = cache_tools if cache_tools is not None else selected_tools
        model_name = resolve_model_name(model or self.default_model)
        client = self._build_client()
        openai_tools = to_openai(cache_tool_list)
        cache_key = build_prompt_cache_key(
            model_name=model_name,
            org=org,
            tool_declarations=openai_tools,
        )
        input_list = self._build_input(
            system_context=system_context,
            dynamic_context=dynamic_context,
            history=history,
            prompt=prompt,
            cache_key=cache_key,
        )
        request_kwargs = self._build_request_kwargs(
            openai_tools=openai_tools,
            cache_key=cache_key,
            effort=_resolve_effort(getattr(settings, "AI_REASONING_EFFORT", "high")),
        )

        tool_call_log: list[dict[str, Any]] = []
        thinking_steps: list[dict[str, Any]] = []
        iterations = 0
        final_text = ""
        loop_limit = max_iterations if max_iterations is not None else self.max_iterations
        request_started = time.monotonic()
        accumulated_tokens = 0

        while iterations < loop_limit:
            iterations += 1
            started = time.monotonic()
            status = "success"
            error_type = ""
            finish_reason = ""
            usage = TokenUsage()
            try:
                response = client.responses.create(
                    model=model_name,
                    input=input_list,
                    **request_kwargs,
                )
                usage = usage_from_response(getattr(response, "usage", None))
                accumulated_tokens += usage.total_tokens
                output_items = list(getattr(response, "output", None) or [])
                finish_reason = _finish_reason(response)

                function_calls = _function_call_items(output_items)
                if function_calls:
                    _append_thinking_step(
                        thinking_steps,
                        iteration=iterations,
                        output_items=output_items,
                        usage=usage,
                    )
                    input_list.extend(output_items)
                    for fc in function_calls:
                        name = fc.name
                        try:
                            raw_args = json.loads(fc.arguments or "{}")
                        except json.JSONDecodeError as exc:
                            entry = {
                                "name": name,
                                "ok": False,
                                "error": str(exc),
                            }
                            tool_call_log.append(entry)
                            payload = clamp_tool_payload({"error": str(exc)})
                            input_list.append(
                                {
                                    "type": "function_call_output",
                                    "call_id": fc.call_id,
                                    "output": json.dumps(payload, default=str),
                                }
                            )
                            continue
                        entry = {"name": name, "ok": False, "error": ""}
                        try:
                            if name not in allowed_tool_names:
                                entry["error"] = (
                                    "Tool not available for this organization."
                                )
                                tool_call_log.append(entry)
                                payload = clamp_tool_payload({"error": entry["error"]})
                                input_list.append(
                                    {
                                        "type": "function_call_output",
                                        "call_id": fc.call_id,
                                        "output": json.dumps(payload, default=str),
                                    }
                                )
                                continue
                            tool = get_tool(name)
                            if (
                                turn_intent == TurnIntent.READ
                                and tool.exposure == "write"
                                and not tool.always_available
                            ):
                                logger.info(
                                    "ai_tool_execution_blocked_read_turn tool=%s user_id=%s",
                                    name,
                                    getattr(user, "id", None),
                                )
                                entry["error"] = "Tool not available for this turn."
                                tool_call_log.append(entry)
                                payload = clamp_tool_payload({"error": entry["error"]})
                                input_list.append(
                                    {
                                        "type": "function_call_output",
                                        "call_id": fc.call_id,
                                        "output": json.dumps(payload, default=str),
                                    }
                                )
                                continue
                            args = tool.validate_args(dict(raw_args))
                            if tool.exposure == "write":
                                result = tool.run(
                                    args,
                                    user,
                                    channel_key=channel_key,
                                    org=org,
                                )
                            else:
                                result = tool.run(args, user)
                            payload = result
                            if isinstance(result, dict) and result.get("error"):
                                entry["ok"] = False
                                entry["error"] = result.get("message") or str(
                                    result["error"]
                                )
                            else:
                                entry["ok"] = True
                        except (KeyError, ToolValidationError) as exc:
                            entry["error"] = str(exc)
                            payload = {"error": str(exc)}
                        except Exception as exc:
                            logger.exception("tool_execution_failed tool=%s", name)
                            entry["error"] = str(exc)
                            payload = {"error": "Tool execution failed."}
                        tool_call_log.append(entry)
                        payload = clamp_tool_payload(payload)
                        input_list.append(
                            {
                                "type": "function_call_output",
                                "call_id": fc.call_id,
                                "output": json.dumps(payload, default=str),
                            }
                        )
                    latency_ms = int((time.monotonic() - started) * 1000)
                    record_usage(
                        user_id=getattr(user, "id", None),
                        feature=feature,
                        model=model_name,
                        usage=usage,
                        latency_ms=latency_ms,
                        tool_iterations=iterations,
                        status=status,
                        finish_reason=finish_reason,
                        tool_calls=[entry],
                    )
                    continue

                _append_thinking_step(
                    thinking_steps,
                    iteration=iterations,
                    output_items=output_items,
                    usage=usage,
                )
                final_text = _extract_message_text(output_items)
                latency_ms = int((time.monotonic() - started) * 1000)
                record_usage(
                    user_id=getattr(user, "id", None),
                    feature=feature,
                    model=model_name,
                    usage=usage,
                    latency_ms=latency_ms,
                    tool_iterations=iterations,
                    status=status,
                    finish_reason=finish_reason,
                    tool_calls=tool_call_log,
                )
                return AIResult(
                    text=final_text,
                    tool_calls=tool_call_log,
                    model=model_name,
                    iterations=iterations,
                    outcome="success",
                    total_tokens=accumulated_tokens,
                    latency_ms=int((time.monotonic() - request_started) * 1000),
                    thinking_steps=thinking_steps,
                )
            except Exception as exc:
                status = "error"
                error_type = type(exc).__name__
                latency_ms = int((time.monotonic() - started) * 1000)
                record_usage(
                    user_id=getattr(user, "id", None),
                    feature=feature,
                    model=model_name,
                    usage=usage,
                    latency_ms=latency_ms,
                    tool_iterations=iterations,
                    status=status,
                    error_type=error_type,
                    finish_reason=finish_reason,
                    tool_calls=tool_call_log,
                )
                raise

        return AIResult(
            text=final_text or "I could not complete that request within the tool limit.",
            tool_calls=tool_call_log,
            model=model_name,
            iterations=iterations,
            outcome="tool_limit_exceeded",
            total_tokens=accumulated_tokens,
            latency_ms=int((time.monotonic() - request_started) * 1000),
            thinking_steps=thinking_steps,
        )

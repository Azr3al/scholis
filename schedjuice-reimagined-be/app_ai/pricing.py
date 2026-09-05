"""OpenAI model pricing and cost computation."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, NamedTuple

from django.conf import settings

PRICING_VERSION = "2026-08-v1"

# Configured slugs that differ from the OpenAI API model id.
MODEL_ALIASES: dict[str, str] = {
    "gpt-5.6": "gpt-5.6-sol",
}

# USD per 1M tokens (input, output, thinking, cached_input, cache_write)
class ModelRates(NamedTuple):
    input: Decimal
    output: Decimal
    thinking: Decimal
    cached: Decimal
    cache_write: Decimal


MODEL_PRICING: dict[str, ModelRates] = {
    "gpt-5.6-luna": ModelRates(
        Decimal("0.20"),
        Decimal("1.20"),
        Decimal("1.20"),
        Decimal("0.02"),
        Decimal("0.25"),
    ),
    "gpt-5.6-terra": ModelRates(
        Decimal("2.00"),
        Decimal("12.00"),
        Decimal("12.00"),
        Decimal("0.20"),
        Decimal("2.50"),
    ),
    "gpt-5.6-sol": ModelRates(
        Decimal("5.00"),
        Decimal("30.00"),
        Decimal("30.00"),
        Decimal("0.50"),
        Decimal("6.25"),
    ),
}


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    cached_input_tokens: int = 0
    cache_write_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return (
            self.input_tokens
            + self.output_tokens
            + self.thinking_tokens
            + self.cached_input_tokens
        )


def resolve_model_name(model: str) -> str:
    """Map configured model slugs to OpenAI API model ids."""
    return MODEL_ALIASES.get(model, model)


def list_available_models() -> list[str]:
    """User-selectable model slugs (alias keys, not resolved API ids)."""
    alias_targets = set(MODEL_ALIASES.values())
    default_model = getattr(settings, "AI_DEFAULT_MODEL", "gpt-5.6-luna")
    models = [k for k in MODEL_PRICING if k not in alias_targets]
    return sorted(models, key=lambda m: (m != default_model, m))


def _rates_for_model(model: str) -> ModelRates:
    for candidate in (model, resolve_model_name(model)):
        if candidate in MODEL_PRICING:
            return MODEL_PRICING[candidate]
    return MODEL_PRICING["gpt-5.6-luna"]


def compute_cost(model: str, usage: TokenUsage) -> Decimal:
    rates = _rates_for_model(model)
    million = Decimal("1000000")
    plain_input = max(usage.input_tokens - usage.cache_write_tokens, 0)
    cost = (
        Decimal(plain_input) * rates.input
        + Decimal(usage.cache_write_tokens) * rates.cache_write
        + Decimal(usage.output_tokens) * rates.output
        + Decimal(usage.thinking_tokens) * rates.thinking
        + Decimal(usage.cached_input_tokens) * rates.cached
    ) / million
    return cost.quantize(Decimal("0.00000001"))


def apply_billing_markup(cost: Decimal) -> Decimal:
    markup = Decimal(str(getattr(settings, "AI_BILLING_MARKUP", 1.0)))
    return (cost * markup).quantize(Decimal("0.00000001"))


def cache_hit_rate(*, input_tokens: int, cached_input_tokens: int) -> float:
    denominator = input_tokens + cached_input_tokens
    if denominator <= 0:
        return 0.0
    return cached_input_tokens / denominator


def compute_cache_savings_usd(
    model: str, *, cached_input_tokens: int, cache_write_tokens: int = 0
) -> Decimal:
    if cached_input_tokens <= 0 and cache_write_tokens <= 0:
        return Decimal("0")
    rates = _rates_for_model(model)
    markup = Decimal(str(getattr(settings, "AI_BILLING_MARKUP", 1.0)))
    million = Decimal("1000000")
    saved = Decimal(cached_input_tokens) * (rates.input - rates.cached)
    penalty = Decimal(cache_write_tokens) * (rates.cache_write - rates.input)
    return ((saved - penalty) * markup / million).quantize(Decimal("0.00000001"))


def usage_from_response(usage: Any) -> TokenUsage:
    if usage is None:
        return TokenUsage()
    in_details = getattr(usage, "input_tokens_details", None)
    out_details = getattr(usage, "output_tokens_details", None)
    cached = int(getattr(in_details, "cached_tokens", 0) or 0)
    cache_write = int(getattr(in_details, "cache_write_tokens", 0) or 0)
    reasoning = int(getattr(out_details, "reasoning_tokens", 0) or 0)
    input_total = int(getattr(usage, "input_tokens", 0) or 0)
    output_total = int(getattr(usage, "output_tokens", 0) or 0)
    return TokenUsage(
        input_tokens=max(input_total - cached, 0),
        output_tokens=max(output_total - reasoning, 0),
        thinking_tokens=reasoning,
        cached_input_tokens=cached,
        cache_write_tokens=cache_write,
    )

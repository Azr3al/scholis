"""Per-tenant AI prompt and limit resolution."""
from __future__ import annotations

from django.conf import settings

from app_ai.org_datetime import build_org_datetime_context
from app_ai.prompts import build_platform_base_prompt
from app_organization.models import Organization

_DEFAULT_INSTRUCTIONS_LINE = (
    "Follow the scope rules above. Prioritize accurate lookups over guessing."
)


def get_default_instructions_line() -> str:
    return _DEFAULT_INSTRUCTIONS_LINE


def build_system_context(org: Organization) -> str:
    school = (org.ai_school_context or "").strip() or (
        "No additional school context provided."
    )
    instructions = (org.ai_assistant_instructions or "").strip() or _DEFAULT_INSTRUCTIONS_LINE
    fm_hm = (
        "enabled"
        if getattr(org, "is_fm_hm_course_display_enabled", False)
        else "disabled"
    )
    from app_ai.packs import iter_pack_prompt_snippets

    pack_bits = iter_pack_prompt_snippets(org)
    packs_block = ""
    if pack_bits:
        lines = "\n".join(f"- {snippet}" for _, snippet in pack_bits)
        packs_block = f"\n\nEnabled capability packs:\n{lines}"
    return (
        f"{build_platform_base_prompt(org)}\n\n"
        f"School context:\n{school}\n\n"
        f"FM/HM course filters: {fm_hm}"
        f"{packs_block}\n\n"
        f"Instructions:\n{instructions}"
    )


def build_system_context_preview(org: Organization) -> str:
    return f"{build_system_context(org)}\n\n{build_org_datetime_context(org)}"


def resolve_ai_model(org: Organization) -> str:
    return (org.ai_default_model or "").strip() or getattr(
        settings, "AI_DEFAULT_MODEL", "gpt-5.6-luna"
    )


def resolve_max_tool_iterations(org: Organization) -> int:
    val = getattr(org, "ai_max_tool_iterations", None)
    if val is None:
        return int(getattr(settings, "AI_MAX_TOOL_ITERATIONS", 5))
    return int(val)


def resolve_max_context_turns(org: Organization) -> int:
    val = getattr(org, "ai_max_context_turns", None)
    if val is None:
        val = 5
    return max(1, int(val))

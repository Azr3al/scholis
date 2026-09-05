# AI Guardrails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block off-topic and abusive AI prompts (math, trivia, spam) before the full Gemini tool loop, using shared guardrails on Telegram and web, with tenant-named refusal messages and read-only system prompt preview on the org AI settings page.

**Architecture:** New `app_ai/guardrails/` module with rate limit → heuristics → optional classifier pipeline. `AIService.run()` invokes `evaluate_prompt()` before quota/Gemini. Platform base prompt lives in `app_ai/prompts.py`; `build_system_context()` assembles three layers. Telegram binding optionally rejects obvious junk synchronously before django-q enqueue.

**Tech Stack:** Django, DRF, django-tenant-schemas, django-q, Google Gemini (`google-genai`), Django cache, Next.js, React Hook Form, Zod, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-06-27-ai-guardrails-design.md`

**Repos:** `schedjuice-reimagined-be` (primary), `schedjuice-reimagined-fe` (AI settings UI)

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/prompts.py` | Platform base prompt template + `build_platform_base_prompt(org)` |
| `app_ai/tenant_context.py` | Refactored assembly; exports preview helpers |
| `app_ai/guardrails/types.py` | `HeuristicVerdict`, `GuardrailResult` |
| `app_ai/guardrails/messages.py` | Refusal + rate-limit templates with `{org_name}` |
| `app_ai/guardrails/heuristics.py` | REJECT / ALLOW / UNCERTAIN pattern matching |
| `app_ai/guardrails/rate_limit.py` | Per-user sliding window via Django cache |
| `app_ai/guardrails/classifier.py` | Flash-lite structured JSON scope check |
| `app_ai/guardrails/__init__.py` | `evaluate_prompt()`, `quick_heuristic_check()` |
| `app_ai/exceptions.py` | `AIPromptBlocked`, `AIRateLimited` |
| `app_ai/service.py` | Guardrail gate before main call |
| `app_ai/client.py` | `classify_prompt_scope()` helper |
| `app_ai/views.py` | 422/429 handling |
| `app_telegram/binding.py` | Sync heuristic reject before enqueue |
| `app_telegram/tasks.py` | Catch guardrail exceptions |
| `app_organization/serializers.py` | Read-only preview fields on GET |
| `schedjuice_backend/settings.py` | Rate limit + classifier settings |
| `schedjuice-reimagined-fe/src/types/organization-ai-settings.ts` | Preview field types |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-settings/page.tsx` | System prompt card |

---

## Conventions for every task

- **Tests:** Django `TestCase` under `app_ai/tests/`, `app_telegram/tests/`, `app_organization/tests/`.
  - `@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")` where DB needed
  - `@override_settings(RBAC_ENFORCE="log_only")` where RBAC involved
  - Tenant ORM: `schema_context(self.schema_name)`; public org: `schema_context(get_public_schema_name())`
- **Run tests:** `python manage.py test app_ai.tests.test_guardrails_heuristics -v 2`
- **Run all guardrail tests:** `python manage.py test app_ai.tests.test_guardrails_heuristics app_ai.tests.test_guardrails_rate_limit app_ai.tests.test_guardrails_classifier app_ai.tests.test_tenant_context app_telegram.tests.test_ai_query app_organization.tests.test_ai_settings_api -v 2`
- **Commits:** Repo has `no-git-commits` rule — **do not `git commit`** unless the user asks.
- **No real network in tests:** mock `GeminiClient`, `TelegramClient`, classifier.

---

## Task 1: Platform prompts + tenant context refactor

**Files:**
- Create: `app_ai/prompts.py`
- Modify: `app_ai/tenant_context.py`
- Modify: `app_ai/tests/test_tenant_context.py`

- [ ] **Step 1: Write failing tests for platform base + preview helpers**

Add to `app_ai/tests/test_tenant_context.py`:

```python
from app_ai.prompts import build_platform_base_prompt
from app_ai.tenant_context import (
    build_system_context,
    build_system_context_preview,
    get_default_instructions_line,
)


class PlatformPromptTests(TestCase):
    def test_platform_base_includes_org_name_and_scope_rules(self):
        org = Organization(name="SDEC International School")
        text = build_platform_base_prompt(org)
        self.assertIn("SDEC International School", text)
        self.assertIn("Refuse general knowledge", text)

    def test_build_system_context_uses_platform_base(self):
        org = Organization(
            name="Teacher Su International School",
            ai_school_context="K-12 in Yangon.",
            ai_assistant_instructions="Be formal.",
        )
        text = build_system_context(org)
        self.assertIn("Teacher Su International School", text)
        self.assertIn("K-12 in Yangon.", text)
        self.assertIn("Be formal.", text)
        self.assertIn("School context:", text)

    def test_preview_matches_assembled_context(self):
        org = Organization(name="Demo School", ai_school_context="Small school.")
        self.assertEqual(build_system_context(org), build_system_context_preview(org))

    def test_default_instructions_when_org_blank(self):
        org = Organization(name="Demo School", ai_assistant_instructions="")
        text = build_system_context(org)
        self.assertIn(get_default_instructions_line(), text)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_tenant_context.PlatformPromptTests -v 2`  
Expected: FAIL — `ModuleNotFoundError: app_ai.prompts`

- [ ] **Step 3: Implement prompts + refactor tenant_context**

Create `app_ai/prompts.py`:

```python
"""Platform-wide AI prompt templates (read-only for tenants)."""
from __future__ import annotations

from app_organization.models import Organization

PLATFORM_BASE_TEMPLATE = """You are the assistant for {org_name}.

Scope: Only answer questions about this school's operations — students, staff,
courses, schedules, attendance, payments, and related admin tasks. Refuse general
knowledge, math, trivia, creative writing, and anything outside school
operations.

Be concise and accurate. Use available tools to look up live data. Do not invent
records."""


def build_platform_base_prompt(org: Organization) -> str:
    return PLATFORM_BASE_TEMPLATE.format(org_name=org.name)
```

Update `app_ai/tenant_context.py`:

```python
from app_ai.prompts import build_platform_base_prompt

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
    return (
        f"{build_platform_base_prompt(org)}\n\n"
        f"School context:\n{school}\n\n"
        f"Instructions:\n{instructions}"
    )


def build_system_context_preview(org: Organization) -> str:
    """Same as build_system_context — explicit name for API/FE."""
    return build_system_context(org)
```

Remove old `_DEFAULT_INSTRUCTIONS` that duplicated scope rules.

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_ai.tests.test_tenant_context -v 2`  
Expected: PASS

---

## Task 2: Guardrail types, messages, and exceptions

**Files:**
- Create: `app_ai/guardrails/types.py`
- Create: `app_ai/guardrails/messages.py`
- Modify: `app_ai/exceptions.py`
- Create: `app_ai/tests/test_guardrails_messages.py`

- [ ] **Step 1: Write failing tests for message templates**

Create `app_ai/tests/test_guardrails_messages.py`:

```python
from django.test import TestCase

from app_ai.guardrails.messages import blocked_message, rate_limited_message
from app_organization.models import Organization


class GuardrailMessageTests(TestCase):
    def test_blocked_message_uses_org_name_not_schedjuice(self):
        org = Organization(name="SDEC International School")
        msg = blocked_message(org)
        self.assertIn("SDEC International School", msg)
        self.assertNotIn("Schedjuice", msg)

    def test_rate_limited_message_includes_retry(self):
        msg = rate_limited_message(42)
        self.assertIn("42", msg)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_guardrails_messages -v 2`

- [ ] **Step 3: Implement types, messages, exceptions**

Create `app_ai/guardrails/types.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class HeuristicVerdict(str, Enum):
    REJECT = "reject"
    ALLOW = "allow"
    UNCERTAIN = "uncertain"


@dataclass(frozen=True)
class GuardrailResult:
    allowed: bool
    reason: str  # allowed | heuristic_reject | classifier_reject | rate_limited | empty_prompt
    message: str | None = None
    retry_after_seconds: int | None = None
```

Create `app_ai/guardrails/messages.py`:

```python
from __future__ import annotations

from app_organization.models import Organization

_BLOCKED_TEMPLATE = (
    "I can only help with {org_name} operations — things like students, staff, "
    "courses, schedules, and attendance. Try rephrasing your question."
)

_RATE_LIMITED_TEMPLATE = (
    "You're sending requests too quickly. Please wait {retry_after} seconds and try again."
)


def blocked_message(org: Organization) -> str:
    return _BLOCKED_TEMPLATE.format(org_name=org.name)


def rate_limited_message(retry_after: int) -> str:
    return _RATE_LIMITED_TEMPLATE.format(retry_after=retry_after)
```

Update `app_ai/exceptions.py`:

```python
class AIPromptBlocked(AIError):
    def __init__(self, message: str, reason: str = "prompt_blocked"):
        super().__init__(message)
        self.reason = reason
        self.message = message


class AIRateLimited(AIError):
    def __init__(self, message: str, retry_after_seconds: int):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds
        self.message = message
```

Create empty `app_ai/guardrails/__init__.py` (placeholder).

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_guardrails_messages -v 2`

---

## Task 3: Heuristics module

**Files:**
- Create: `app_ai/guardrails/heuristics.py`
- Create: `app_ai/tests/test_guardrails_heuristics.py`

- [ ] **Step 1: Write failing heuristic tests**

Create `app_ai/tests/test_guardrails_heuristics.py`:

```python
from django.test import TestCase

from app_ai.guardrails.heuristics import scan_heuristics
from app_ai.guardrails.types import HeuristicVerdict


class HeuristicRejectTests(TestCase):
    def test_pure_math_rejected(self):
        self.assertEqual(
            scan_heuristics("what is 2 + 2525 ?"),
            HeuristicVerdict.REJECT,
        )

    def test_trivia_rejected(self):
        self.assertEqual(
            scan_heuristics("what is the capital of France"),
            HeuristicVerdict.REJECT,
        )

    def test_creative_writing_rejected(self):
        self.assertEqual(
            scan_heuristics("write me a poem about cats"),
            HeuristicVerdict.REJECT,
        )

    def test_empty_rejected(self):
        self.assertEqual(scan_heuristics("   "), HeuristicVerdict.REJECT)


class HeuristicAllowTests(TestCase):
    def test_school_keywords_allowed(self):
        self.assertEqual(
            scan_heuristics("find students named Sarah in Grade 7"),
            HeuristicVerdict.ALLOW,
        )

    def test_staff_lookup_allowed(self):
        self.assertEqual(
            scan_heuristics("who teaches math this semester"),
            HeuristicVerdict.ALLOW,
        )


class HeuristicUncertainTests(TestCase):
    def test_short_name_lookup_uncertain(self):
        self.assertEqual(
            scan_heuristics("find Sarah"),
            HeuristicVerdict.UNCERTAIN,
        )


class HeuristicFollowUpTests(TestCase):
    def test_follow_up_without_keywords_allowed_with_history(self):
        history = [
            {"role": "user", "text": "find students named Sarah"},
            {"role": "model", "text": "Found 2 students named Sarah."},
        ]
        self.assertEqual(
            scan_heuristics("what courses do they teach", history=history),
            HeuristicVerdict.ALLOW,
        )
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_guardrails_heuristics -v 2`

- [ ] **Step 3: Implement heuristics**

Create `app_ai/guardrails/heuristics.py`:

```python
from __future__ import annotations

import re

from app_ai.guardrails.types import HeuristicVerdict

_SCHOOL_KEYWORDS = re.compile(
    r"\b("
    r"student|students|teacher|teachers|staff|course|courses|class|classes|"
    r"schedule|attendance|payment|payments|enroll|grade|program|intake|"
    r"roster|subject|section|parent|parents|admin|school|timetable|lesson"
    r")\b",
    re.IGNORECASE,
)

_MATH_PATTERN = re.compile(
    r"(?:"
    r"what\s+is\s+[\d\s+\-*/().]+[\?\!]?"
    r"|^[\d\s+\-*/().=]+\?$"
    r"|\bcalculate\b.*[\d+\-*/]"
    r"|\b\d+\s*[\+\-\*/]\s*\d+"
    r")",
    re.IGNORECASE,
)

_TRIVIA_PATTERN = re.compile(
    r"\b(capital of|who won|when was|how old is|trivia|fun fact)\b",
    re.IGNORECASE,
)

_CREATIVE_PATTERN = re.compile(
    r"\b(write (?:me )?(?:a )?(?:poem|story|essay|song)|explain quantum|"
    r"help me with my homework essay)\b",
    re.IGNORECASE,
)

_FOLLOW_UP_PATTERN = re.compile(
    r"\b(what about|tell me more|and theirs|their courses|those students|"
    r"same (?:person|student|teacher))\b",
    re.IGNORECASE,
)


def scan_heuristics(
    prompt: str,
    *,
    history: list[dict[str, str]] | None = None,
) -> HeuristicVerdict:
    text = (prompt or "").strip()
    if not text:
        return HeuristicVerdict.REJECT

    if _MATH_PATTERN.search(text) or _TRIVIA_PATTERN.search(text) or _CREATIVE_PATTERN.search(text):
        return HeuristicVerdict.REJECT

    if _SCHOOL_KEYWORDS.search(text):
        return HeuristicVerdict.ALLOW

    if history and _has_in_scope_history(history):
        if _FOLLOW_UP_PATTERN.search(text) or len(text.split()) <= 8:
            return HeuristicVerdict.ALLOW

    return HeuristicVerdict.UNCERTAIN


def _has_in_scope_history(history: list[dict[str, str]]) -> bool:
    """True when recent turns look like a normal assistant exchange."""
    if len(history) < 2:
        return False
    last_model = history[-1] if history[-1].get("role") == "model" else None
    if last_model is None:
        for turn in reversed(history):
            if turn.get("role") == "model" and (turn.get("text") or "").strip():
                last_model = turn
                break
    return bool(last_model and (last_model.get("text") or "").strip())
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_guardrails_heuristics -v 2`

---

## Task 4: Rate limiting

**Files:**
- Create: `app_ai/guardrails/rate_limit.py`
- Modify: `schedjuice_backend/settings.py`
- Create: `app_ai/tests/test_guardrails_rate_limit.py`

- [ ] **Step 1: Write failing rate limit tests**

Create `app_ai/tests/test_guardrails_rate_limit.py`:

```python
from django.core.cache import cache
from django.test import TestCase, override_settings

from app_ai.guardrails.rate_limit import check_ai_rate_limit


@override_settings(AI_RATE_LIMIT_PER_USER=2, AI_RATE_LIMIT_WINDOW_SECONDS=3600)
class RateLimitTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_allows_under_limit(self):
        allowed, retry = check_ai_rate_limit(schema_name="xschedjuice", user_id=1)
        self.assertTrue(allowed)
        self.assertEqual(retry, 0)

    def test_blocks_over_limit(self):
        check_ai_rate_limit(schema_name="xschedjuice", user_id=1)
        check_ai_rate_limit(schema_name="xschedjuice", user_id=1)
        allowed, retry = check_ai_rate_limit(schema_name="xschedjuice", user_id=1)
        self.assertFalse(allowed)
        self.assertGreater(retry, 0)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_guardrails_rate_limit -v 2`

- [ ] **Step 3: Implement rate limit + settings**

Create `app_ai/guardrails/rate_limit.py`:

```python
from __future__ import annotations

import time

from django.conf import settings
from django.core.cache import cache


def check_ai_rate_limit(*, schema_name: str, user_id: int) -> tuple[bool, int]:
    limit = int(getattr(settings, "AI_RATE_LIMIT_PER_USER", 30))
    window = int(getattr(settings, "AI_RATE_LIMIT_WINDOW_SECONDS", 3600))
    key = f"ai_query_rate:{schema_name}:{user_id}"
    now = int(time.time())
    window_start = now - window
    existing = cache.get(key) or []
    existing = [t for t in existing if t > window_start]
    if len(existing) >= limit:
        retry_after = int(existing[0]) + window - now
        return False, max(1, retry_after)
    existing.append(now)
    cache.set(key, existing, timeout=window + 60)
    return True, 0
```

Add to `schedjuice_backend/settings.py` (near other `AI_*` settings):

```python
AI_RATE_LIMIT_PER_USER = config("AI_RATE_LIMIT_PER_USER", default=30, cast=int)
AI_RATE_LIMIT_WINDOW_SECONDS = config("AI_RATE_LIMIT_WINDOW_SECONDS", default=3600, cast=int)
AI_GUARDRAIL_CLASSIFIER_MODEL = config(
    "AI_GUARDRAIL_CLASSIFIER_MODEL", default="gemini-3.1-flash-lite"
)
AI_GUARDRAIL_FAIL_OPEN = config("AI_GUARDRAIL_FAIL_OPEN", default=True, cast=bool)
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_guardrails_rate_limit -v 2`

---

## Task 5: Classifier + evaluate_prompt orchestrator

**Files:**
- Create: `app_ai/guardrails/classifier.py`
- Modify: `app_ai/client.py`
- Modify: `app_ai/guardrails/__init__.py`
- Create: `app_ai/tests/test_guardrails_classifier.py`
- Create: `app_ai/tests/test_guardrails_evaluate.py`

- [ ] **Step 1: Write failing classifier + evaluate tests**

Create `app_ai/tests/test_guardrails_classifier.py`:

```python
from unittest.mock import MagicMock, patch

from django.test import TestCase

from app_ai.guardrails.classifier import classify_prompt
from app_organization.models import Organization


class ClassifierTests(TestCase):
    @patch("app_ai.guardrails.classifier.GeminiClient")
    def test_classifier_allowed(self, MockClient):
        MockClient.return_value.classify_prompt_scope.return_value = {
            "allowed": True,
            "reason": "school lookup",
        }
        org = Organization(name="Demo School", schema_name="demo")
        result = classify_prompt("find Sarah", org=org, user=MagicMock(id=1))
        self.assertTrue(result["allowed"])

    @patch("app_ai.guardrails.classifier.GeminiClient")
    def test_classifier_rejected(self, MockClient):
        MockClient.return_value.classify_prompt_scope.return_value = {
            "allowed": False,
            "reason": "general knowledge",
        }
        org = Organization(name="Demo School", schema_name="demo")
        result = classify_prompt("random question", org=org, user=MagicMock(id=1))
        self.assertFalse(result["allowed"])
```

Create `app_ai/tests/test_guardrails_evaluate.py`:

```python
from unittest.mock import MagicMock, patch

from django.test import TestCase

from app_ai.guardrails import evaluate_prompt
from app_organization.models import Organization


class EvaluatePromptTests(TestCase):
    def setUp(self):
        self.org = Organization(name="Teacher Su International School", schema_name="xschedjuice")
        self.user = MagicMock(id=1)

    @patch("app_ai.guardrails.check_ai_rate_limit", return_value=(True, 0))
    def test_math_blocked_without_classifier(self, _mock_rl):
        result = evaluate_prompt("what is 2 + 2525", user=self.user, org=self.org)
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "heuristic_reject")
        self.assertIn("Teacher Su International School", result.message or "")

    @patch("app_ai.guardrails.classify_prompt")
    @patch("app_ai.guardrails.check_ai_rate_limit", return_value=(True, 0))
    def test_uncertain_calls_classifier(self, _mock_rl, mock_classify):
        mock_classify.return_value = {"allowed": True, "reason": "ok"}
        result = evaluate_prompt("find Sarah", user=self.user, org=self.org)
        self.assertTrue(result.allowed)
        mock_classify.assert_called_once()

    @patch("app_ai.guardrails.check_ai_rate_limit", return_value=(False, 120))
    def test_rate_limited(self, _mock_rl):
        result = evaluate_prompt("find students", user=self.user, org=self.org)
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "rate_limited")
        self.assertEqual(result.retry_after_seconds, 120)
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python manage.py test app_ai.tests.test_guardrails_classifier app_ai.tests.test_guardrails_evaluate -v 2`

- [ ] **Step 3: Implement classifier on GeminiClient**

Add to `app_ai/client.py` (after `AIResult` dataclass):

```python
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
            raise RuntimeError("GEMINI_API_KEY is not configured.")

        from google.genai import types

        model_name = resolve_model_name(
            model or getattr(settings, "AI_GUARDRAIL_CLASSIFIER_MODEL", self.default_model)
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
        response = client.models.generate_content(
            model=model_name,
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
            config=types.GenerateContentConfig(
                system_instruction=system,
                response_mime_type="application/json",
            ),
        )
        usage = usage_from_metadata(getattr(response, "usage_metadata", None))
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
        raw = (response.text or "").strip()
        parsed = json.loads(raw) if raw else {}
        return {
            "allowed": bool(parsed.get("allowed")),
            "reason": str(parsed.get("reason") or ""),
        }
```

Create `app_ai/guardrails/classifier.py`:

```python
from __future__ import annotations

import logging

from django.conf import settings

from app_ai.client import GeminiClient
from app_organization.models import Organization

logger = logging.getLogger(__name__)


def classify_prompt(prompt: str, *, org: Organization, user) -> dict:
    client = GeminiClient()
    return client.classify_prompt_scope(prompt, org_name=org.name, user=user)
```

Implement `app_ai/guardrails/__init__.py`:

```python
from __future__ import annotations

import logging

from django.conf import settings

from app_ai.guardrails.classifier import classify_prompt
from app_ai.guardrails.heuristics import scan_heuristics
from app_ai.guardrails.messages import blocked_message, rate_limited_message
from app_ai.guardrails.rate_limit import check_ai_rate_limit
from app_ai.guardrails.types import GuardrailResult, HeuristicVerdict

logger = logging.getLogger(__name__)


def quick_heuristic_check(prompt: str, *, history: list | None = None) -> GuardrailResult | None:
    """Sync path for Telegram webhook — heuristics only, no rate limit/classifier."""
    verdict = scan_heuristics(prompt, history=history)
    if verdict == HeuristicVerdict.REJECT:
        return GuardrailResult(
            allowed=False,
            reason="heuristic_reject",
            message=None,  # caller fills with blocked_message(org)
        )
    return None


def evaluate_prompt(
    prompt: str,
    *,
    user,
    org,
    history: list[dict[str, str]] | None = None,
) -> GuardrailResult:
    text = (prompt or "").strip()
    if not text:
        return GuardrailResult(
            allowed=False,
            reason="empty_prompt",
            message=blocked_message(org),
        )

    allowed_rl, retry = check_ai_rate_limit(
        schema_name=org.schema_name,
        user_id=getattr(user, "id", 0),
    )
    if not allowed_rl:
        return GuardrailResult(
            allowed=False,
            reason="rate_limited",
            message=rate_limited_message(retry),
            retry_after_seconds=retry,
        )

    verdict = scan_heuristics(text, history=history)
    if verdict == HeuristicVerdict.REJECT:
        return GuardrailResult(
            allowed=False,
            reason="heuristic_reject",
            message=blocked_message(org),
        )
    if verdict == HeuristicVerdict.ALLOW:
        return GuardrailResult(allowed=True, reason="allowed")

    try:
        result = classify_prompt(text, org=org, user=user)
    except Exception:
        logger.warning("guardrail classifier failed", exc_info=True)
        if getattr(settings, "AI_GUARDRAIL_FAIL_OPEN", True):
            return GuardrailResult(allowed=True, reason="classifier_fail_open")
        return GuardrailResult(
            allowed=False,
            reason="classifier_error",
            message=blocked_message(org),
        )

    if result.get("allowed"):
        return GuardrailResult(allowed=True, reason="allowed")
    return GuardrailResult(
        allowed=False,
        reason="classifier_reject",
        message=blocked_message(org),
    )
```

Fix `quick_heuristic_check` to accept org for message — update binding to call `blocked_message(org)` when result is not None.

- [ ] **Step 4: Run tests — expect PASS**

Run: `python manage.py test app_ai.tests.test_guardrails_classifier app_ai.tests.test_guardrails_evaluate -v 2`

---

## Task 6: Wire guardrails into AIService

**Files:**
- Modify: `app_ai/service.py`
- Create: `app_ai/tests/test_service_guardrails.py`

- [ ] **Step 1: Write failing service integration test**

Create `app_ai/tests/test_service_guardrails.py`:

```python
from unittest.mock import MagicMock, patch

from django.test import TestCase

from app_ai.exceptions import AIPromptBlocked, AIRateLimited
from app_ai.service import AIService
from app_organization.models import Organization


class AIServiceGuardrailTests(TestCase):
    @patch("app_ai.service.AIService._current_tenant")
    @patch("app_ai.guardrails.evaluate_prompt")
    def test_blocked_prompt_raises(self, mock_eval, mock_tenant):
        org = Organization(name="SDEC International School", schema_name="xschedjuice", is_ai_enabled=True)
        mock_tenant.return_value = org
        mock_eval.return_value = MagicMock(
            allowed=False,
            reason="heuristic_reject",
            message="I can only help with SDEC International School operations — things like students, staff, courses, schedules, and attendance. Try rephrasing your question.",
            retry_after_seconds=None,
        )
        with self.assertRaises(AIPromptBlocked) as ctx:
            AIService(client=MagicMock()).run("what is 2+2", MagicMock(id=1))
        self.assertIn("SDEC International School", str(ctx.exception.message))

    @patch("app_ai.service.AIService._current_tenant")
    @patch("app_ai.guardrails.evaluate_prompt")
    def test_rate_limited_raises(self, mock_eval, mock_tenant):
        org = Organization(name="Demo", schema_name="xschedjuice", is_ai_enabled=True)
        mock_tenant.return_value = org
        mock_eval.return_value = MagicMock(
            allowed=False,
            reason="rate_limited",
            message="slow down",
            retry_after_seconds=60,
        )
        with self.assertRaises(AIRateLimited):
            AIService(client=MagicMock()).run("find students", MagicMock(id=1))
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_ai.tests.test_service_guardrails -v 2`

- [ ] **Step 3: Update AIService.run**

At top of `app_ai/service.py` add imports:

```python
from app_ai.exceptions import AIPromptBlocked, AIRateLimited
from app_ai.guardrails import evaluate_prompt
```

Inside `run()`, after resolving `tenant` and before `assert_quota_allows`:

```python
        if tenant is not None:
            guard = evaluate_prompt(
                prompt,
                user=user,
                org=tenant,
                history=history,
            )
            if not guard.allowed:
                if guard.reason == "rate_limited":
                    raise AIRateLimited(
                        guard.message or "Rate limited.",
                        guard.retry_after_seconds or 60,
                    )
                raise AIPromptBlocked(
                    guard.message or "Prompt blocked.",
                    reason=guard.reason,
                )
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_service_guardrails -v 2`

---

## Task 7: Web AIQueryView + Telegram integration

**Files:**
- Modify: `app_ai/views.py`
- Modify: `app_telegram/tasks.py`
- Modify: `app_telegram/binding.py`
- Modify: `app_telegram/tests/test_ai_query.py`
- Create: `app_ai/tests/test_ai_query_view_guardrails.py`

- [ ] **Step 1: Write failing view + telegram tests**

Add to `app_telegram/tests/test_ai_query.py`:

```python
    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_blocked_math_sends_refusal_with_org_name(self, MockAIService, MockClient):
        from app_ai.exceptions import AIPromptBlocked

        MockAIService.return_value.run.side_effect = AIPromptBlocked(
            f"I can only help with {self.org.name} operations — things like students, staff, courses, schedules, and attendance. Try rephrasing your question.",
            reason="heuristic_reject",
        )
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="what is 2 + 2525",
            )
        MockClient.return_value.send_message.assert_called_once()
        sent_text = MockClient.return_value.send_message.call_args[0][1]
        self.assertIn(self.org.name, sent_text)
```

Add to `app_telegram/tests/test_ai_query.py` in `TelegramFreeTextHandlerTests`:

```python
    @patch("app_telegram.binding.TelegramClient")
    @patch("app_telegram.tasks.run_ai_query")
    def test_obvious_math_rejected_sync_without_enqueue(self, mock_run_ai_query, MockClient):
        with schema_context(self.schema_name):
            handle_message(
                self.org,
                _private_message(
                    tg_user_id=self.admin.telegram_user_id,
                    chat_id=self.admin.telegram_chat_id,
                    text="what is 2 + 2525 ?",
                    message_id=100,
                ),
            )
        mock_run_ai_query.delay.assert_not_called()
        MockClient.return_value.send_message.assert_called()
        sent = MockClient.return_value.send_message.call_args[0][1]
        self.assertIn(self.org.name, sent)
```

Create `app_ai/tests/test_ai_query_view_guardrails.py`:

```python
import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.exceptions import AIPromptBlocked, AIRateLimited
from app_auth.models import User
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AIQueryViewGuardrailTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.credentials(HTTP_TENANT=self.schema_name)

    @patch("app_ai.views.AIService")
    def test_prompt_blocked_returns_422(self, MockService):
        MockService.return_value.run.side_effect = AIPromptBlocked(
            "blocked", reason="heuristic_reject"
        )
        resp = self.client.post(
            "/api/v1/ai/query",
            {"prompt": "what is 2+2"},
            format="json",
        )
        self.assertEqual(resp.status_code, 422)
        self.assertEqual(resp.json()["code"], "prompt_blocked")

    @patch("app_ai.views.AIService")
    def test_rate_limited_returns_429(self, MockService):
        MockService.return_value.run.side_effect = AIRateLimited("slow", 90)
        resp = self.client.post(
            "/api/v1/ai/query",
            {"prompt": "find students"},
            format="json",
        )
        self.assertEqual(resp.status_code, 429)
        self.assertEqual(resp.json()["code"], "rate_limited")
        self.assertEqual(resp.json()["retry_after_seconds"], 90)
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python manage.py test app_telegram.tests.test_ai_query app_ai.tests.test_ai_query_view_guardrails -v 2`

- [ ] **Step 3: Implement view + telegram handlers**

Update `app_ai/views.py`:

```python
from app_ai.exceptions import AIPromptBlocked, AIQuotaExceeded, AIRateLimited
```

In `post()` after `AIQuotaExceeded` handler, add:

```python
        except AIPromptBlocked as exc:
            return self.send_response(
                True,
                "prompt_blocked",
                {"code": "prompt_blocked", "message": exc.message, "reason": exc.reason},
                status=422,
            )
        except AIRateLimited as exc:
            return self.send_response(
                True,
                "rate_limited",
                {
                    "code": "rate_limited",
                    "message": exc.message,
                    "retry_after_seconds": exc.retry_after_seconds,
                },
                status=429,
            )
```

Update `app_telegram/tasks.py`:

```python
from app_ai.exceptions import AIPromptBlocked, AIRateLimited
```

Wrap `AIService().run(...)` except block:

```python
    except AIPromptBlocked as exc:
        _send_reply(client, chat_id, exc.message, **reply_kw)
    except AIRateLimited as exc:
        _send_reply(client, chat_id, exc.message, **reply_kw)
```

Update `app_telegram/binding.py` in `_handle_free_text_query`, after AI enabled check and **before** ack reaction:

```python
    from app_ai.guardrails import quick_heuristic_check
    from app_ai.guardrails.messages import blocked_message

    from app_telegram.context import build_telegram_ai_history

    history = build_telegram_ai_history(message=message, user=user, org=tenant)
    quick = quick_heuristic_check(text, history=history)
    if quick is not None:
        _reply(tenant, chat["id"], blocked_message(tenant))
        return
```

Move `build_telegram_ai_history` call before reaction so follow-ups work in sync path.

- [ ] **Step 4: Run tests — expect PASS**

Run: `python manage.py test app_telegram.tests.test_ai_query app_ai.tests.test_ai_query_view_guardrails -v 2`

---

## Task 8: AI settings API preview fields

**Files:**
- Modify: `app_organization/serializers.py`
- Modify: `app_organization/tests/test_ai_settings_api.py`

- [ ] **Step 1: Write failing API test**

Add to `app_organization/tests/test_ai_settings_api.py`:

```python
    def test_get_includes_system_prompt_preview_fields(self):
        with schema_context(get_public_schema_name()):
            self.org.ai_school_context = "K-12 school."
            self.org.save(update_fields=["ai_school_context"])
        resp = self._client(self.admin).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertIn("ai_platform_base_prompt", data)
        self.assertIn("ai_system_prompt_preview", data)
        self.assertIn(self.org.name, data["ai_platform_base_prompt"])
        self.assertIn("K-12 school.", data["ai_system_prompt_preview"])
```

Add PATCH rejection test — sending `ai_platform_base_prompt` should be ignored (not in writable fields):

```python
    def test_patch_cannot_overwrite_platform_base_prompt(self):
        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {"ai_platform_base_prompt": "malicious override"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("malicious override", resp.json()["data"]["ai_platform_base_prompt"])
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_organization.tests.test_ai_settings_api -v 2`

- [ ] **Step 3: Update serializer**

In `OrganizationAISettingsSerializer`:

```python
from app_ai.prompts import build_platform_base_prompt
from app_ai.tenant_context import build_system_context_preview

class OrganizationAISettingsSerializer(BaseModelSerializer):
    ai_platform_base_prompt = serializers.SerializerMethodField()
    ai_system_prompt_preview = serializers.SerializerMethodField()

    class Meta:
        fields = [
            ...
            "ai_platform_base_prompt",
            "ai_system_prompt_preview",
        ]
        read_only_fields = ["name", "ai_platform_base_prompt", "ai_system_prompt_preview"]

    def get_ai_platform_base_prompt(self, obj):
        return build_platform_base_prompt(obj)

    def get_ai_system_prompt_preview(self, obj):
        return build_system_context_preview(obj)
```

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_organization.tests.test_ai_settings_api -v 2`

---

## Task 9: Frontend — AI settings system prompt card

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/organization-ai-settings.ts`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-settings/page.tsx`

- [ ] **Step 1: Update Zod schema**

In `organization-ai-settings.ts`, add to schema object:

```typescript
  ai_platform_base_prompt: z.string().describe("Platform rules (read-only)"),
  ai_system_prompt_preview: z.string().describe("Full assembled prompt preview"),
```

Add to edit schema — omit both (read-only):

```typescript
export const organizationAiSettingsEditSchema = organizationAiSettingsSchema
  .omit({ name: true, ai_platform_base_prompt: true, ai_system_prompt_preview: true });
```

- [ ] **Step 2: Update AI settings page**

In `page.tsx`, add a **System prompt** card **above** the General card:

```tsx
            <Card>
              <CardHeader>
                <CardTitle>System prompt</CardTitle>
                <CardDescription>
                  Platform rules are fixed. Add school context and optional behavior
                  rules below. Preview shows the full prompt sent to the AI.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormItem>
                  <FormLabel>Platform rules (read-only)</FormLabel>
                  <Textarea
                    rows={8}
                    readOnly
                    className="bg-muted"
                    value={settingsQuery.data?.ai_platform_base_prompt ?? ""}
                  />
                </FormItem>
                <FormField
                  control={form.control}
                  name="ai_school_context"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>School context</FormLabel>
                      <FormControl>
                        <Textarea rows={5} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ai_assistant_instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional instructions</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel>Preview — full prompt sent to the AI</FormLabel>
                  <Textarea
                    rows={10}
                    readOnly
                    className="bg-muted font-mono text-xs"
                    value={settingsQuery.data?.ai_system_prompt_preview ?? ""}
                  />
                  <FormDescription>
                    Updates after you save changes.
                  </FormDescription>
                </FormItem>
              </CardContent>
            </Card>
```

Remove duplicate **School context** and **Assistant behavior** cards lower on the page.

- [ ] **Step 3: Manual verify**

Run FE dev server, open `/organizations/ai-settings`, confirm:
- Platform rules textarea is read-only and shows org name
- Preview textarea shows assembled prompt
- Save still works for editable fields

---

## Task 10: Final verification

- [ ] **Step 1: Run full backend test suite for guardrails**

Run:

```bash
cd schedjuice-reimagined-be
python manage.py test \
  app_ai.tests.test_tenant_context \
  app_ai.tests.test_guardrails_messages \
  app_ai.tests.test_guardrails_heuristics \
  app_ai.tests.test_guardrails_rate_limit \
  app_ai.tests.test_guardrails_classifier \
  app_ai.tests.test_guardrails_evaluate \
  app_ai.tests.test_service_guardrails \
  app_ai.tests.test_ai_query_view_guardrails \
  app_telegram.tests.test_ai_query \
  app_organization.tests.test_ai_settings_api \
  -v 2
```

Expected: all PASS

- [ ] **Step 2: Update spec status**

In `docs/superpowers/specs/2026-06-27-ai-guardrails-design.md`, set `Status: Approved`.

- [ ] **Step 3: Smoke test (optional, manual)**

1. Telegram: send `what is 2 + 2525 ?` → refusal with tenant name, no AI answer
2. Telegram: send `find students named Sarah` → normal AI response
3. Web: POST `/api/v1/ai/query` with math prompt → 422 `prompt_blocked`

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Heuristic REJECT (math, trivia, creative) | Task 3 |
| Heuristic ALLOW (keywords, follow-ups) | Task 3 |
| Classifier on UNCERTAIN | Task 5 |
| Fail open on classifier error | Task 5 (`evaluate_prompt`) |
| Tenant-named refusal message | Task 2 |
| Rate limit before heuristics | Task 4, 5 |
| Shared guardrails Telegram + web | Task 6, 7 |
| Sync Telegram heuristic reject | Task 7 |
| No exchange row on block | Task 7 (existing create only on success) |
| Platform base prompt in code | Task 1 |
| System prompt preview on API | Task 8 |
| AI settings FE card | Task 9 |
| Settings env vars | Task 4 |
| Usage feature `ai_guardrail_classify` | Task 5 |

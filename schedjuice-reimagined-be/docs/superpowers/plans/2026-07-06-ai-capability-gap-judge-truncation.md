# AI Capability Gap Judge — Input Truncation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap capability gap judge LLM input with per-field character limits at `GeminiClient.judge_capability_gap()` to reduce token cost on list-heavy turns without changing `AIRequestLog` storage.

**Architecture:** New `truncate_judge_payload()` in `app_ai/capability_gap/truncate.py` applies judge-specific limits (500/800 for current turn, 400/600 for history) with a `… [truncated]` suffix. `GeminiClient.judge_capability_gap()` calls it immediately before `json.dumps`. Constants live in `capability_gap/constants.py`. History builder unchanged — client is the single judge boundary.

**Tech Stack:** Django 5, google-genai SDK, existing `AIRequestLog` / django-q judge pipeline

**Spec:** `docs/superpowers/specs/2026-07-06-ai-capability-gap-judge-truncation-design.md`

---

## File map

| File | Action |
| --- | --- |
| `app_ai/capability_gap/constants.py` | Add judge limit constants |
| `app_ai/capability_gap/truncate.py` | Create — `truncate_judge_text`, `truncate_judge_payload` |
| `app_ai/client.py` | Call `truncate_judge_payload()`; append system prompt line |
| `app_ai/tests/test_capability_gap_judge_truncate.py` | Create — unit tests for truncation helpers |
| `app_ai/tests/test_capability_gap_judge_client.py` | Extend — payload limits + system prompt |

---

### Task 1: Judge truncation constants

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/capability_gap/constants.py`

- [ ] **Step 1: Add constants**

Append to `app_ai/capability_gap/constants.py` after `VALID_CAPABILITY_GAPS`:

```python
JUDGE_PROMPT_MAX_CHARS = 500
JUDGE_RESPONSE_MAX_CHARS = 800
JUDGE_HISTORY_USER_MAX_CHARS = 400
JUDGE_HISTORY_MODEL_MAX_CHARS = 600
JUDGE_TRUNCATION_SUFFIX = "… [truncated]"
```

- [ ] **Step 2: Commit**

```bash
cd schedjuice-reimagined-be
git add app_ai/capability_gap/constants.py
git commit -m "chore: add capability gap judge truncation constants"
```

---

### Task 2: `truncate_judge_text` helper

**Files:**
- Create: `schedjuice-reimagined-be/app_ai/capability_gap/truncate.py`
- Create: `schedjuice-reimagined-be/app_ai/tests/test_capability_gap_judge_truncate.py`

- [ ] **Step 1: Write the failing tests**

Create `app_ai/tests/test_capability_gap_judge_truncate.py`:

```python
from django.test import TestCase

from app_ai.capability_gap.constants import JUDGE_TRUNCATION_SUFFIX
from app_ai.capability_gap.truncate import truncate_judge_text


class TruncateJudgeTextTests(TestCase):
    def test_under_limit_unchanged(self):
        self.assertEqual(truncate_judge_text("hello", 500), "hello")

    def test_strips_whitespace(self):
        self.assertEqual(truncate_judge_text("  hi  ", 500), "hi")

    def test_empty_returns_empty(self):
        self.assertEqual(truncate_judge_text("", 500), "")
        self.assertEqual(truncate_judge_text(None, 500), "")

    def test_over_limit_exact_length_with_suffix(self):
        limit = 50
        long_text = "x" * 100
        result = truncate_judge_text(long_text, limit)
        self.assertEqual(len(result), limit)
        self.assertTrue(result.endswith(JUDGE_TRUNCATION_SUFFIX))

    def test_exactly_at_limit_no_suffix(self):
        text = "a" * 50
        self.assertEqual(truncate_judge_text(text, 50), text)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_judge_truncate.TruncateJudgeTextTests
```

Expected: FAIL — `ModuleNotFoundError` or `ImportError` for `truncate_judge_text`

- [ ] **Step 3: Implement `truncate_judge_text`**

Create `app_ai/capability_gap/truncate.py` with:

```python
from __future__ import annotations

from app_ai.capability_gap.constants import (
    JUDGE_HISTORY_MODEL_MAX_CHARS,
    JUDGE_HISTORY_USER_MAX_CHARS,
    JUDGE_PROMPT_MAX_CHARS,
    JUDGE_RESPONSE_MAX_CHARS,
    JUDGE_TRUNCATION_SUFFIX,
)


def truncate_judge_text(value: str | None, limit: int) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    prefix_len = limit - len(JUDGE_TRUNCATION_SUFFIX)
    return text[:prefix_len] + JUDGE_TRUNCATION_SUFFIX
```

(Leave `truncate_judge_payload` for Task 3 — tests only import `truncate_judge_text` for now.)

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_judge_truncate.TruncateJudgeTextTests
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app_ai/capability_gap/truncate.py app_ai/tests/test_capability_gap_judge_truncate.py
git commit -m "feat: add truncate_judge_text for capability gap judge"
```

---

### Task 3: `truncate_judge_payload` helper

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/capability_gap/truncate.py`
- Modify: `schedjuice-reimagined-be/app_ai/tests/test_capability_gap_judge_truncate.py`

- [ ] **Step 1: Write the failing tests**

Append to `app_ai/tests/test_capability_gap_judge_truncate.py`:

```python
from app_ai.capability_gap.constants import (
    JUDGE_HISTORY_MODEL_MAX_CHARS,
    JUDGE_HISTORY_USER_MAX_CHARS,
    JUDGE_PROMPT_MAX_CHARS,
    JUDGE_RESPONSE_MAX_CHARS,
    JUDGE_TRUNCATION_SUFFIX,
)
from app_ai.capability_gap.truncate import truncate_judge_payload


class TruncateJudgePayloadTests(TestCase):
    def test_current_turn_limits(self):
        payload = truncate_judge_payload(
            prompt="p" * 600,
            response_text="r" * 900,
            tool_calls=[],
            available_tool_names=[],
            conversation_history=None,
        )
        self.assertEqual(len(payload["prompt"]), JUDGE_PROMPT_MAX_CHARS)
        self.assertTrue(payload["prompt"].endswith(JUDGE_TRUNCATION_SUFFIX))
        self.assertEqual(len(payload["response_text"]), JUDGE_RESPONSE_MAX_CHARS)
        self.assertTrue(payload["response_text"].endswith(JUDGE_TRUNCATION_SUFFIX))

    def test_history_role_specific_limits(self):
        history = [
            {"role": "user", "text": "u" * 500},
            {"role": "model", "text": "m" * 700},
        ]
        payload = truncate_judge_payload(
            prompt="ok",
            response_text="ok",
            tool_calls=[],
            available_tool_names=[],
            conversation_history=history,
        )
        self.assertEqual(
            len(payload["conversation_history"][0]["text"]),
            JUDGE_HISTORY_USER_MAX_CHARS,
        )
        self.assertEqual(
            len(payload["conversation_history"][1]["text"]),
            JUDGE_HISTORY_MODEL_MAX_CHARS,
        )

    def test_unknown_history_role_uses_user_limit(self):
        payload = truncate_judge_payload(
            prompt="ok",
            response_text="ok",
            tool_calls=[],
            available_tool_names=[],
            conversation_history=[{"role": "system", "text": "s" * 500}],
        )
        self.assertEqual(
            len(payload["conversation_history"][0]["text"]),
            JUDGE_HISTORY_USER_MAX_CHARS,
        )

    def test_tool_fields_pass_through(self):
        tool_calls = [{"name": "search_courses", "ok": True, "error": ""}]
        names = ["search_courses", "search_users"]
        payload = truncate_judge_payload(
            prompt="ok",
            response_text="ok",
            tool_calls=tool_calls,
            available_tool_names=names,
            conversation_history=[],
        )
        self.assertIs(payload["tool_calls"], tool_calls)
        self.assertIs(payload["available_tool_names"], names)

    def test_none_history_becomes_empty_list(self):
        payload = truncate_judge_payload(
            prompt="ok",
            response_text="ok",
            tool_calls=[],
            available_tool_names=[],
            conversation_history=None,
        )
        self.assertEqual(payload["conversation_history"], [])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_judge_truncate.TruncateJudgePayloadTests
```

Expected: FAIL — `ImportError: cannot import name 'truncate_judge_payload'`

- [ ] **Step 3: Implement `truncate_judge_payload`**

Add to `app_ai/capability_gap/truncate.py`:

```python
def _history_text_limit(role: str) -> int:
    if role == "model":
        return JUDGE_HISTORY_MODEL_MAX_CHARS
    return JUDGE_HISTORY_USER_MAX_CHARS


def truncate_judge_payload(
    *,
    prompt: str,
    response_text: str,
    tool_calls: list[dict],
    available_tool_names: list[str],
    conversation_history: list[dict[str, str]] | None,
) -> dict:
    capped_history: list[dict[str, str]] = []
    for turn in conversation_history or []:
        role = str(turn.get("role") or "user")
        capped_history.append(
            {
                "role": role,
                "text": truncate_judge_text(
                    turn.get("text"),
                    _history_text_limit(role),
                ),
            }
        )
    return {
        "prompt": truncate_judge_text(prompt, JUDGE_PROMPT_MAX_CHARS),
        "response_text": truncate_judge_text(response_text, JUDGE_RESPONSE_MAX_CHARS),
        "tool_calls": tool_calls,
        "available_tool_names": available_tool_names,
        "conversation_history": capped_history,
    }
```

- [ ] **Step 4: Run full truncate test module**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_judge_truncate
```

Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add app_ai/capability_gap/truncate.py app_ai/tests/test_capability_gap_judge_truncate.py
git commit -m "feat: add truncate_judge_payload for capability gap judge"
```

---

### Task 4: GeminiClient integration

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/client.py` (around lines 171–209)

- [ ] **Step 1: Import and call `truncate_judge_payload`**

At top of `app_ai/client.py`, add import:

```python
from app_ai.capability_gap.truncate import truncate_judge_payload
```

In `judge_capability_gap`, append to the system instruction string (before the JSON reply line):

```python
            "Text fields may be truncated for length. Evaluate capability gaps from the "
            "available excerpt and tool call outcomes, not from missing list rows.\n\n"
```

Replace the inline `payload = {...}` block with:

```python
        payload = truncate_judge_payload(
            prompt=prompt,
            response_text=response_text,
            tool_calls=tool_calls,
            available_tool_names=available_tool_names,
            conversation_history=conversation_history,
        )
```

- [ ] **Step 2: Run existing client test (should still pass for short inputs)**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_judge_client
```

Expected: PASS (short fixtures unchanged)

- [ ] **Step 3: Commit**

```bash
git add app_ai/client.py
git commit -m "feat: truncate capability gap judge payload at client boundary"
```

---

### Task 5: Client truncation tests

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/tests/test_capability_gap_judge_client.py`

- [ ] **Step 1: Write the failing tests**

Append to `CapabilityGapJudgeClientTests`:

```python
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.GeminiClient._build_client")
    def test_payload_truncates_long_text_fields(self, mock_build, _usage):
        mock_response = MagicMock()
        mock_response.candidates = [
            MagicMock(
                content=MagicMock(
                    parts=[
                        MagicMock(
                            text='{"is_capability_gap": false, "capability_gaps": []}'
                        )
                    ]
                )
            )
        ]
        mock_response.usage_metadata = None
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        mock_build.return_value = mock_client

        long_history = [{"role": "user", "text": "h" * 1000}]
        GeminiClient().judge_capability_gap(
            prompt="p" * 1000,
            response_text="r" * 2000,
            tool_calls=[{"name": "search_courses", "ok": True, "error": ""}],
            available_tool_names=["search_courses"],
            conversation_history=long_history,
            org_name="Demo School",
            user=MagicMock(id=1),
        )

        _args, kwargs = mock_client.models.generate_content.call_args
        user_part = kwargs["contents"][0].parts[0].text
        payload = json.loads(user_part)
        self.assertLessEqual(len(payload["prompt"]), 500)
        self.assertLessEqual(len(payload["response_text"]), 800)
        self.assertLessEqual(len(payload["conversation_history"][0]["text"]), 400)
        self.assertEqual(
            payload["tool_calls"],
            [{"name": "search_courses", "ok": True, "error": ""}],
        )

    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.GeminiClient._build_client")
    def test_system_prompt_mentions_truncation(self, mock_build, _usage):
        mock_response = MagicMock()
        mock_response.candidates = [
            MagicMock(
                content=MagicMock(
                    parts=[
                        MagicMock(
                            text='{"is_capability_gap": false, "capability_gaps": []}'
                        )
                    ]
                )
            )
        ]
        mock_response.usage_metadata = None
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        mock_build.return_value = mock_client

        GeminiClient().judge_capability_gap(
            prompt="ok",
            response_text="ok",
            tool_calls=[],
            available_tool_names=[],
            conversation_history=[],
            org_name="Demo School",
            user=MagicMock(id=1),
        )

        _args, kwargs = mock_client.models.generate_content.call_args
        system = kwargs["config"].system_instruction.lower()
        self.assertIn("truncated", system)
        self.assertIn("missing list rows", system)
```

- [ ] **Step 2: Run client tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_judge_client
```

Expected: PASS (3 tests)

- [ ] **Step 3: Commit**

```bash
git add app_ai/tests/test_capability_gap_judge_client.py
git commit -m "test: verify capability gap judge client truncates payload"
```

---

### Task 6: Regression sweep

**Files:** (none — verification only)

- [ ] **Step 1: Run related judge test modules**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_judge
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_task
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_history
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_judge_truncate
./scripts/run_backend_tests.sh app_ai.tests.test_capability_gap_judge_client
```

Expected: all PASS

- [ ] **Step 2: Update spec status (optional)**

In `docs/superpowers/specs/2026-07-06-ai-capability-gap-judge-truncation-design.md`, change `**Status:** Draft` to `**Status:** Implemented (2026-07-06)`.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Per-field limits 500/800/400/600 | Task 1, 3 |
| `… [truncated]` suffix | Task 2 |
| Single boundary at client | Task 4 |
| `tool_calls` unchanged | Task 3 |
| System prompt truncation note | Task 4, 5 |
| History builder unchanged | (no task — intentional) |
| Unit tests for helpers | Task 2, 3 |
| Client payload tests | Task 5 |
| Regression on judge/task/history | Task 6 |

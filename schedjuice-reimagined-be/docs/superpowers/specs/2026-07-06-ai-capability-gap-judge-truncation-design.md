# AI Capability Gap Judge — Input Truncation

**Date:** 2026-07-06  
**Status:** Implemented (2026-07-06)  
**Repo:** `schedjuice-reimagined-be`  
**Builds on:**
- `docs/superpowers/specs/2026-06-29-ai-capability-gap-failures-design.md`
- `docs/superpowers/specs/2026-07-06-ai-capability-gap-judge-history-design.md`

## 1. Problem

The capability gap judge runs asynchronously on every successful AI turn via
`GeminiClient.judge_capability_gap()`. Its JSON payload includes `prompt`,
`response_text`, `tool_calls`, `available_tool_names`, and (for Telegram)
`conversation_history`.

`AIRequestLog` already truncates stored `prompt` and `response_text` at **2000
chars** at write time, and `build_judge_history_for_request_log()` applies the
same 2000-char limit per history turn. That is appropriate for persistence but
too large for the judge:

- **Cost / latency:** List-heavy responses (course enrollments, user search
  results) can send thousands of tokens per judge call with little diagnostic
  value.
- **Hygiene:** The judge only needs user intent, whether tools ran, and whether
  the answer met the need — not full tabular output.

Stacked history amplifies the problem: up to `org.ai_max_context_turns` prior
turns (default 5) × 2000 chars can produce ~20k+ chars of dense list text in a
single judge payload.

## 2. Goals (v1)

1. **Cap judge input** with per-field character limits tuned for gap detection.
2. **Prioritize the current turn** over history (tighter limits on prior turns).
3. **Single truncation boundary** at `GeminiClient.judge_capability_gap()` so
   live task, backfill command, and tests behave identically.
4. **Preserve fail-open behavior** — truncation is deterministic and must not
   block judging.

## 3. Non-goals (v1)

- Changing `AIRequestLog` storage limits (remain 2000 chars).
- List-aware or semantic summarization of responses.
- Total-payload budget trimming (per-field limits only for v1).
- Django settings for runtime tuning (constants only).
- Truncating guardrail classifier or main-model inputs.

## 4. Key decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Truncation strategy | **Per-field char limits** (not total budget) |
| 2 | Boundary | **`GeminiClient.judge_capability_gap()`** before `json.dumps` |
| 3 | Current vs history | **Tighter limits on history** than current turn |
| 4 | Suffix | **`… [truncated]`** when text is cut |
| 5 | `tool_calls` | **Unchanged** (`{name, ok, error}` only) |
| 6 | History builder | **Keep 2000-char DB parity**; client re-truncates to judge limits |

### Alternatives considered

| Approach | Why not v1 |
| --- | --- |
| Total payload budget (trim history first) | User chose per-field limits |
| Truncate in `history.py` only | Misses current `prompt`/`response_text`; two boundaries |
| Same limits for current and history | Higher cost; user chose tighter history |

---

## 5. Limits

| Field | Limit (chars) |
| --- | --- |
| Current `prompt` | **500** |
| Current `response_text` | **800** |
| History `user` turn | **400** |
| History `model` turn | **600** |
| `tool_calls` | unchanged |
| `available_tool_names` | unchanged |

**Worst-case text budget (5 prior turns + current):**  
`5 × (400 + 600) + 500 + 800 = 5,800` chars of text fields, plus small JSON
overhead for tools — down from ~22k+ under the old 2000-per-field stacking.

Constants live in `app_ai/capability_gap/constants.py`:

```python
JUDGE_PROMPT_MAX_CHARS = 500
JUDGE_RESPONSE_MAX_CHARS = 800
JUDGE_HISTORY_USER_MAX_CHARS = 400
JUDGE_HISTORY_MODEL_MAX_CHARS = 600
JUDGE_TRUNCATION_SUFFIX = "… [truncated]"
```

---

## 6. Truncation module

New file: `app_ai/capability_gap/truncate.py`

### 6.1 `truncate_judge_text(value, limit) -> str`

1. `text = (value or "").strip()`
2. If `len(text) <= limit`, return `text`.
3. Otherwise return `text[: limit - len(suffix)] + suffix` so final length is
   **exactly** `limit`.

Reuse the strip-first pattern from `app_ai.request_log.truncate_text`; do not
call `truncate_text` directly (no suffix, different limits).

### 6.2 `truncate_judge_payload(...) -> dict`

Input mirrors the judge payload fields:

```python
def truncate_judge_payload(
    *,
    prompt: str,
    response_text: str,
    tool_calls: list[dict],
    available_tool_names: list[str],
    conversation_history: list[dict[str, str]] | None,
) -> dict:
    ...
```

Behavior:

- `prompt` → `truncate_judge_text(prompt, JUDGE_PROMPT_MAX_CHARS)`
- `response_text` → `truncate_judge_text(response_text, JUDGE_RESPONSE_MAX_CHARS)`
- `conversation_history` → for each `{"role", "text"}` entry:
  - `role == "user"` → `JUDGE_HISTORY_USER_MAX_CHARS`
  - `role == "model"` → `JUDGE_HISTORY_MODEL_MAX_CHARS`
  - unknown role → treat as `user` limit (defensive)
- `tool_calls` and `available_tool_names` → pass through unchanged
- Return the capped dict ready for `json.dumps`

---

## 7. Client integration

In `GeminiClient.judge_capability_gap()` (`app_ai/client.py`):

```python
from app_ai.capability_gap.truncate import truncate_judge_payload

payload = truncate_judge_payload(
    prompt=prompt,
    response_text=response_text,
    tool_calls=tool_calls,
    available_tool_names=available_tool_names,
    conversation_history=conversation_history,
)
```

Replace the current inline `payload = {...}` dict construction.

### 7.1 System prompt addition

Append to the existing capability gap judge system instruction:

```
Text fields may be truncated for length. Evaluate capability gaps from the
available excerpt and tool call outcomes, not from missing list rows.
```

Do **not** enable `include_thoughts` for the judge call (unchanged).

---

## 8. Pipeline (unchanged except client)

```
record_request_log()  # still 2000-char storage
  → judge_request_log_capability_gap (django-q)
  → judge_capability_gap()
  → classify_capability_gap()
  → GeminiClient.judge_capability_gap()
       └── truncate_judge_payload()   # NEW
  → Gemini API
```

`build_judge_history_for_request_log()` unchanged — still returns up to N prior
turns at 2000 chars; client tightens at send time.

Backfill command `judge_ai_request_log_capability_gaps` benefits automatically
(same client path).

---

## 9. Edge cases

| Case | Behavior |
| --- | --- |
| Empty prompt / response | `strip()` → `""`; no suffix |
| Text exactly at limit | Unchanged; no suffix |
| History turn with empty `text` | `""`; model turn still skipped upstream in history builder |
| Very long single-word string | Hard cut at char boundary (no word-aware break) |
| `conversation_history` is `None` | Treated as `[]` in payload |
| Judge API error | Fail open → row stays `success` (unchanged) |

---

## 10. Testing

### 10.1 Unit — `app_ai/tests/test_capability_gap_judge_truncate.py` (new)

- `truncate_judge_text` under limit → unchanged
- Over limit → length exactly equals limit, ends with `… [truncated]`
- `truncate_judge_payload` applies 500/800 to current fields
- History user/model turns get 400/600 respectively
- `tool_calls` and `available_tool_names` pass through untouched
- Unknown history role uses user limit

### 10.2 Unit — extend `test_capability_gap_judge_client.py`

- Long prompt/response/history in client call → payload respects limits
- System prompt contains truncation guidance

### 10.3 Regression

- Existing judge orchestration tests (`test_capability_gap_judge.py`,
  `test_capability_gap_task.py`) should pass without change (short fixtures).

---

## 11. Rollout

1. Deploy backend change (no migration).
2. Monitor `ai_capability_gap_judge` usage tokens / latency over 48h — expect
   decrease on list-heavy turns.
3. No backfill needed; applies to new judge calls only.

---

## 12. Files touched (implementation reference)

| File | Change |
| --- | --- |
| `app_ai/capability_gap/constants.py` | Add judge limit constants |
| `app_ai/capability_gap/truncate.py` | **New** — truncation helpers |
| `app_ai/client.py` | Call `truncate_judge_payload()`; system prompt line |
| `app_ai/tests/test_capability_gap_judge_truncate.py` | **New** |
| `app_ai/tests/test_capability_gap_judge_client.py` | Extend |

No frontend changes. No migrations.

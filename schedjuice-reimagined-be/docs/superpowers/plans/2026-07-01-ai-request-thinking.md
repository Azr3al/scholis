# AI Request Thinking Summaries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture Gemini thinking summaries per tool-loop iteration, store them on `AIRequestLog`, expose a paginated **Requests** explorer under org AI Usage, and show reasoning in expanded request/failure rows.

**Architecture:** Enable `include_thoughts` in `generate_with_tools`, accumulate `thinking_steps` on `AIResult`, persist via `record_request_log`. Add `build_requests_list()` API mirroring failures reporting. FE adds a Requests tab with expandable reasoning steps.

**Tech Stack:** Django/DRF, django-tenant-schemas, google-genai SDK, Next.js App Router, TanStack Query, Zod, nuqs, shadcn UI.

**Spec:** `docs/superpowers/specs/2026-07-01-ai-request-thinking-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/models.py` | Add `thinking_steps` JSONField |
| `app_ai/migrations/0005_airequestlog_thinking_steps.py` | Migration (generated) |
| `app_ai/client.py` | `ThinkingConfig`, extract thoughts, extend `AIResult` |
| `app_ai/request_log.py` | Persist `thinking_steps` |
| `app_ai/reporting.py` | Shared row serializer; `build_requests_list()`; add field to failures |
| `app_ai/usage_views.py` | `PlatformAIUsageRequestsView` |
| `app_ai/urls.py` | `platform/ai-usage/requests` |
| `app_organization/views.py` | `OrganizationAIUsageRequestsView` |
| `app_organization/urls.py` | `organizations/<id>/ai-usage/requests` |
| `app_ai/tests/test_client_thinking.py` | Thought extraction unit tests |
| `app_ai/tests/test_request_log.py` | Persistence tests |
| `app_ai/tests/test_requests_reporting.py` | `build_requests_list` tests |
| `app_ai/tests/test_requests_api.py` | API tests |
| `schedjuice-reimagined-fe/src/types/ai-usage.ts` | Schemas + types |
| `schedjuice-reimagined-fe/src/app/client-api/ai-usage.ts` | `fetchOrgAiUsageRequests` |
| `schedjuice-reimagined-fe/src/components/org/ai/thinking-steps-block.tsx` | Reusable reasoning UI |
| `schedjuice-reimagined-fe/src/components/org/ai/requests-table.tsx` | Requests table |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-requests-pane.tsx` | Requests pane |
| `schedjuice-reimagined-fe/src/components/org/ai/failures-table.tsx` | Add reasoning block |
| `schedjuice-reimagined-fe/src/components/org/ai/ai-usage-tabs.tsx` | Requests tab |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-section.tsx` | Wire pane |
| `schedjuice-reimagined-fe/src/lib/org/org-section-href.ts` | `OrgAiPane` type |
| `schedjuice-reimagined-fe/src/components/org/record/use-org-section.ts` | Pane routing |

---

## Conventions

- **BE tests:** Always use `./scripts/run_backend_tests.sh <target>` or `manage.py test … --keepdb --noinput`.
- **FE tests:** `npm test -- ai-usage` (or project test runner for types).
- **Do not commit** unless user asks (repo rule).

---

## Task 1: `thinking_steps` model field

**Files:**
- Modify: `app_ai/models.py`
- Create: migration via `makemigrations`
- Modify: `app_ai/tests/test_request_log.py`

- [ ] **Step 1: Write failing persistence test**

Add to `app_ai/tests/test_request_log.py`:

```python
def test_record_request_log_persists_thinking_steps(self):
    from app_ai.client import AIResult
    from app_ai.request_log import record_request_log

    result = AIResult(
        text="Done.",
        thinking_steps=[
            {"iteration": 1, "text": "Search for course", "thinking_tokens": 50},
            {"iteration": 2, "text": "Fetch roster", "thinking_tokens": 30},
        ],
        model="gemini-3.1-flash-lite",
        iterations=2,
        total_tokens=500,
        latency_ms=1200,
    )
    with schema_context(self.org.schema_name):
        row = record_request_log(
            user_id=1,
            feature="telegram_query",
            channel_key="telegram:1",
            prompt="Who teaches Math 101?",
            result=result,
            outcome="success",
        )
    with schema_context(get_public_schema_name()):
        saved = AIRequestLog.objects.get(pk=row.pk)
    self.assertEqual(len(saved.thinking_steps), 2)
    self.assertEqual(saved.thinking_steps[0]["iteration"], 1)
    self.assertEqual(saved.thinking_steps[1]["thinking_tokens"], 30)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_request_log`

- [ ] **Step 3: Add field to model**

In `AIRequestLog` (`app_ai/models.py`):

```python
thinking_steps = models.JSONField(default=list, blank=True)
```

- [ ] **Step 4: Migrate**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_ai --name airequestlog_thinking_steps
./env/bin/python manage.py migrate_schemas --shared
```

- [ ] **Step 5: Run test — expect PASS**

---

## Task 2: Capture thinking in `GeminiClient`

**Files:**
- Modify: `app_ai/client.py`
- Modify: `app_ai/request_log.py`
- Create: `app_ai/tests/test_client_thinking.py`

- [ ] **Step 1: Write failing extraction test**

Create `app_ai/tests/test_client_thinking.py`:

```python
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_ai.client import GeminiClient, _extract_thought_text_from_parts


class ExtractThoughtTextTests(SimpleTestCase):
    def test_joins_thought_parts_only(self):
        thought = MagicMock(text="Plan: search courses", thought=True)
        answer = MagicMock(text="Here is the answer", thought=False)
        self.assertEqual(
            _extract_thought_text_from_parts([thought, answer]),
            "Plan: search courses",
        )

    def test_empty_when_no_thought_parts(self):
        answer = MagicMock(text="Answer only", thought=False)
        self.assertEqual(_extract_thought_text_from_parts([answer]), "")


@override_settings(GEMINI_API_KEY="test-key", AI_MAX_TOOL_ITERATIONS=1)
@patch("google.genai.types.Content", MagicMock)
class GeminiThinkingCaptureTests(SimpleTestCase):
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.get_or_create_system_cache", return_value=None)
    @patch("app_ai.client.GeminiClient._build_client")
    def test_final_response_includes_thinking_steps(
        self, mock_build, _cache, _usage
    ):
        thought_part = MagicMock(text="Reason about roster", thought=True)
        text_part = MagicMock(text="The teacher is Alice.", thought=False, function_call=None)
        candidate = MagicMock(
            content=MagicMock(parts=[thought_part, text_part]),
            finish_reason="STOP",
        )
        response = MagicMock(candidates=[candidate], usage_metadata=MagicMock(
            prompt_token_count=100,
            candidates_token_count=20,
            thoughts_token_count=15,
            cached_content_token_count=0,
        ))
        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.models.generate_content.return_value = response

        client = GeminiClient()
        result = client.generate_with_tools(
            "Who teaches Math?",
            user=MagicMock(id=1),
            tools=[],
            cache_tools=[],
            feature="telegram_query",
            max_iterations=1,
        )

        self.assertEqual(len(result.thinking_steps), 1)
        self.assertEqual(result.thinking_steps[0]["iteration"], 1)
        self.assertIn("Reason about roster", result.thinking_steps[0]["text"])
        self.assertEqual(result.thinking_steps[0]["thinking_tokens"], 15)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_client_thinking`

- [ ] **Step 3: Implement in `client.py`**

Add module-level helper:

```python
_MAX_THINKING_STEPS = 10

def _extract_thought_text_from_parts(parts) -> str:
    return "".join(
        p.text for p in (parts or [])
        if getattr(p, "thought", False) and getattr(p, "text", None)
    )

def _append_thinking_step(
    steps: list[dict[str, Any]],
    *,
    iteration: int,
    parts,
    usage: TokenUsage,
) -> None:
    if len(steps) >= _MAX_THINKING_STEPS:
        return
    from app_ai.request_log import truncate_text

    steps.append(
        {
            "iteration": iteration,
            "text": truncate_text(_extract_thought_text_from_parts(parts)),
            "thinking_tokens": usage.thinking_tokens,
        }
    )
```

Extend `AIResult`:

```python
thinking_steps: list[dict[str, Any]] = field(default_factory=list)
```

Update `_build_generate_config` to always pass thinking config. Example for non-cached path:

```python
gen_config_kwargs["thinking_config"] = types_module.ThinkingConfig(include_thoughts=True)
```

For cached path:

```python
return types_module.GenerateContentConfig(
    cached_content=cached_content_name,
    thinking_config=types_module.ThinkingConfig(include_thoughts=True),
)
```

In `generate_with_tools` loop, initialize `thinking_steps: list[dict] = []` and after parsing `parts` on each iteration call `_append_thinking_step(...)`. Include `thinking_steps` on all `AIResult` returns (success and tool_limit_exceeded).

Verify `GenerateContentConfig` merge does not drop `tools` / `system_instruction` on non-cached path.

- [ ] **Step 4: Wire `record_request_log`**

Add parameter and persist:

```python
def record_request_log(..., thinking_steps: list | None = None, ...):
    ...
    if result is not None:
        ...
        thinking_steps = thinking_steps if thinking_steps is not None else result.thinking_steps
    else:
        thinking_steps = thinking_steps or []
    ...
    kwargs["thinking_steps"] = thinking_steps[:10]
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_client_thinking app_ai.tests.test_request_log`

---

## Task 3: Requests reporting + API

**Files:**
- Modify: `app_ai/reporting.py`
- Modify: `app_ai/usage_views.py`
- Modify: `app_ai/urls.py`
- Modify: `app_organization/views.py`
- Modify: `app_organization/urls.py`
- Create: `app_ai/tests/test_requests_reporting.py`
- Create: `app_ai/tests/test_requests_api.py`

- [ ] **Step 1: Write failing reporting test**

```python
def test_build_requests_list_includes_all_outcomes_and_thinking_steps(self):
    with schema_context(get_public_schema_name()):
        AIRequestLog.objects.create(
            tenant=self.org,
            user_id=1,
            feature="telegram_query",
            prompt="Hi",
            response_text="Hello",
            outcome=AIRequestLog.Outcome.SUCCESS,
            thinking_steps=[{"iteration": 1, "text": "Greet user", "thinking_tokens": 5}],
            model="gemini-test",
        )
        AIRequestLog.objects.create(
            tenant=self.org,
            user_id=1,
            feature="telegram_query",
            prompt="Blocked",
            outcome=AIRequestLog.Outcome.BLOCKED,
        )
    payload = build_requests_list(year=2026, month=7, tenant_id=self.org.id)
    self.assertEqual(payload["total_count"], 2)
    self.assertIn("success", payload["summary"]["by_outcome"])
    self.assertEqual(payload["items"][0]["thinking_steps"][0]["text"], "Greet user")
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement `build_requests_list`**

Add constants near failures section:

```python
USER_FACING_FEATURES = ("telegram_query", "ai_query")
DEFAULT_REQUESTS_FEATURE = "telegram_query"
REQUESTS_OUTCOME_ALL = "all"
VALID_REQUESTS_OUTCOMES = (
    REQUESTS_OUTCOME_ALL,
    AIRequestLog.Outcome.SUCCESS,
    AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
    AIRequestLog.Outcome.CAPABILITY_GAP,
    AIRequestLog.Outcome.ERROR,
    AIRequestLog.Outcome.BLOCKED,
    AIRequestLog.Outcome.RATE_LIMITED,
)
```

Extract shared `_serialize_request_log_row(row, users_by_tenant)` from failures item builder; include `"thinking_steps": row.thinking_steps or []`.

`build_requests_list`:
- Filter month + user-facing features (`feature=all` → both features)
- Optional `tenant_id`, `outcome`, pagination, sort
- Summary: `request_count`, `by_outcome`, `organizations_affected`

Update `build_failures_list` serializer to include `thinking_steps` via shared helper.

- [ ] **Step 4: Add views and URLs**

`PlatformAIUsageRequestsView` — copy `PlatformAIUsageFailuresView`, call `build_requests_list`, default `outcome=all`.

`OrganizationAIUsageRequestsView` — copy failures org view.

URLs:
- `platform/ai-usage/requests`
- `organizations/<int:obj_id>/ai-usage/requests`

- [ ] **Step 5: Write API test** (copy pattern from `test_failures_api.py`)

- [ ] **Step 6: Run tests — expect PASS**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_requests_reporting app_ai.tests.test_requests_api app_ai.tests.test_failures_reporting`

---

## Task 4: Frontend types and API client

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/ai-usage.ts`
- Modify: `schedjuice-reimagined-fe/src/app/client-api/ai-usage.ts`

- [ ] **Step 1: Add schemas**

```typescript
export const aiUsageThinkingStepSchema = z.object({
  iteration: z.number(),
  text: z.string(),
  thinking_tokens: z.number(),
});

export const aiUsageRequestOutcomeSchema = z.enum([
  "success",
  "tool_limit_exceeded",
  "capability_gap",
  "error",
  "blocked",
  "rate_limited",
]);

export const aiUsageRequestItemSchema = aiUsageFailureItemSchema
  .extend({
    outcome: aiUsageRequestOutcomeSchema,
  })
  .extend({
    thinking_steps: z.array(aiUsageThinkingStepSchema),
  });

export const aiUsageRequestsSchema = z.object({
  year: z.number(),
  month: z.number(),
  total_count: z.number(),
  page: z.number(),
  page_size: z.number(),
  summary: z.object({
    request_count: z.number(),
    organizations_affected: z.number(),
    by_outcome: z.record(z.string(), z.number()),
  }),
  items: z.array(aiUsageRequestItemSchema),
});
```

Also add `thinking_steps` to `aiUsageFailureItemSchema`.

- [ ] **Step 2: Add fetch helper**

```typescript
export async function fetchOrgAiUsageRequests(
  orgId: string | number,
  params: Record<string, string | number | undefined>,
) {
  const res = await axiosClient.get(`organizations/${orgId}/ai-usage/requests`, { params });
  const parsed = aiUsageRequestsSchema.safeParse(res.data?.data);
  if (!parsed.success) throw new Error("Invalid AI requests response");
  return parsed.data;
}
```

- [ ] **Step 3: Run type tests if present**

---

## Task 5: Requests UI

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/org/ai/thinking-steps-block.tsx`
- Create: `schedjuice-reimagined-fe/src/components/org/ai/requests-table.tsx`
- Create: `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-requests-pane.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/org/ai/ai-usage-tabs.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-section.tsx`
- Modify: `schedjuice-reimagined-fe/src/lib/org/org-section-href.ts`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/use-org-section.ts`
- Modify: `schedjuice-reimagined-fe/src/components/org/ai/failures-table.tsx`

- [ ] **Step 1: Create `ThinkingStepsBlock`**

```tsx
export function ThinkingStepsBlock({
  steps,
}: {
  steps: { iteration: number; text: string; thinking_tokens: number }[];
}) {
  if (!steps.length) {
    return (
      <p className="text-sm text-muted-foreground">No reasoning captured.</p>
    );
  }
  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <div key={step.iteration} className="rounded-md border border-border bg-background p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Step {step.iteration}
            {step.thinking_tokens > 0 ? ` · ${formatAiTokens(step.thinking_tokens)} thinking tokens` : null}
          </p>
          <p className="whitespace-pre-wrap text-sm">{step.text || "—"}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `RequestsTable`**

Mirror `FailuresTable` structure:
- Columns: When, User, Question, Outcome (`FailureOutcomeBadge` or new badge covering success/blocked/error), Iterations, Tokens
- Expanded row: `<ThinkingStepsBlock />`, full question, response, tool calls
- Outcome filter control (default `all`)

- [ ] **Step 3: Create `OrgAiRequestsPane`**

Mirror `OrgAiFailuresPane`:
- `useQuery` → `fetchOrgAiUsageRequests`
- `YearMonthSelector`, outcome filter, pagination via nuqs

- [ ] **Step 4: Wire tab + routing**

Add `"requests"` to `OrgAiPane` in `org-section-href.ts` and `use-org-section.ts`.

Add tab label **Requests** in `ai-usage-tabs.tsx`.

Render pane in `org-ai-section.tsx` with same permission gate as failures.

- [ ] **Step 5: Add reasoning to failures expanded row**

In `failures-table.tsx`, above “Full question”:

```tsx
<div>
  <p className="mb-1 font-medium text-muted-foreground">Reasoning</p>
  <ThinkingStepsBlock steps={item.thinking_steps ?? []} />
</div>
```

- [ ] **Step 6: Manual smoke test**

1. Trigger a Telegram or web AI query against a thinking-capable model.
2. Open org → AI → Requests tab for current month.
3. Expand row — verify numbered reasoning steps.
4. Open Failures tab — verify reasoning appears on failure rows with thinking data.

---

## Verification checklist

- [ ] `./scripts/run_backend_tests.sh app_ai.tests.test_client_thinking app_ai.tests.test_request_log app_ai.tests.test_requests_reporting app_ai.tests.test_requests_api`
- [ ] Existing failures tests still pass
- [ ] Org Requests tab loads with outcome=all default
- [ ] Historical rows show “No reasoning captured”
- [ ] Blocked/rate-limited rows have empty `thinking_steps`

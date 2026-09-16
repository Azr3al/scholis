from __future__ import annotations

from rest_framework.views import Request

from app_ai.exceptions import (
    AIPromptBlocked,
    AIQuotaExceeded,
    AIRateLimited,
    AIUserQuotaExceeded,
)
from app_ai.interaction import resolve_interaction_message
from app_ai.quota import user_budget_snapshot
from app_ai.service import AIService
from app_course.course_scoping import acting_user
from utilitas.views import BaseView


class AIQueryView(BaseView):
    name = "AI query"
    description = "Run an OpenAI prompt with registered search tools."

    def post(self, request: Request):
        user = acting_user(request)
        if user is None:
            return self.unauthorized(message="authentication_required")

        prompt = (request.data.get("prompt") or "").strip()
        if not prompt:
            return self.bad_request(details="prompt is required")

        try:
            result = AIService().run(
                prompt,
                user,
                feature="ai_query",
                channel_key=f"web:{user.id}",
            )
            interaction_text = resolve_interaction_message(
                user=user,
                channel_key=f"web:{user.id}",
            )
            answer = interaction_text or result.text
        except AIUserQuotaExceeded as exc:
            return self.send_response(
                True,
                "user_quota_exceeded",
                {
                    "code": "user_quota_exceeded",
                    "details": str(exc),
                    "limit_usd": str(exc.limit_usd),
                    "used_usd": str(exc.used_usd),
                },
                status=429,
            )
        except AIQuotaExceeded as exc:
            return self.send_response(
                True,
                "quota_exceeded",
                {"details": str(exc)},
                status=429,
            )
        except AIPromptBlocked as exc:
            return self.send_response(
                True,
                "prompt_blocked",
                {
                    "code": "prompt_blocked",
                    "details": exc.message,
                    "reason": exc.reason,
                },
                status=422,
            )
        except AIRateLimited as exc:
            return self.send_response(
                True,
                "rate_limited",
                {
                    "code": "rate_limited",
                    "details": exc.message,
                    "retry_after_seconds": exc.retry_after_seconds,
                },
                status=429,
            )
        except RuntimeError as exc:
            return self.send_response(
                True,
                "ai_unavailable",
                {"details": str(exc)},
                status=503,
            )
        except Exception:
            return self.send_response(
                True,
                "ai_error",
                {"details": "AI request failed."},
                status=502,
            )

        tenant = getattr(request, "tenant", None)
        budget = None
        if tenant is not None:
            budget = user_budget_snapshot(tenant, user.id)

        return self.ok(
            {
                "answer": answer,
                "tool_calls": result.tool_calls,
                "model": result.model,
                "iterations": result.iterations,
                "budget": budget,
            }
        )

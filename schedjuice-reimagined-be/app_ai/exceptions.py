from decimal import Decimal


class AIError(Exception):
    """Base error for AI service operations."""


class AIQuotaExceeded(AIError):
    """Raised when a tenant exceeds a hard-enforced AI budget limit."""

    def __init__(self, message: str = "AI quota exceeded for this tenant."):
        super().__init__(message)


class AIUserQuotaExceeded(AIQuotaExceeded):
    def __init__(self, *, limit_usd: Decimal, used_usd: Decimal):
        self.limit_usd = limit_usd
        self.used_usd = used_usd
        super().__init__(
            f"Your monthly AI allowance (${limit_usd:.2f}) is used up. "
            "Contact your administrator."
        )


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

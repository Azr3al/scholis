from __future__ import annotations

import logging

from app_ai.client import OpenAIClient
from app_organization.models import Organization

logger = logging.getLogger(__name__)


def classify_prompt(prompt: str, *, org: Organization, user) -> dict:
    client = OpenAIClient()
    return client.classify_prompt_scope(prompt, org_name=org.name, user=user)

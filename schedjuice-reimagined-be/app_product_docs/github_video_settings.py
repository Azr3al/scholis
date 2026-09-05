from __future__ import annotations

from django.conf import settings


def resolve_github_video_token() -> str:
    from app_organization.models import PlatformOpsSettings

    db = PlatformOpsSettings.get_singleton().get_github_docs_video_token()
    if db:
        return db
    return (getattr(settings, "GITHUB_DOCS_VIDEO_TOKEN", None) or "").strip()


def resolve_github_video_repo() -> str:
    from app_organization.models import PlatformOpsSettings

    obj = PlatformOpsSettings.get_singleton()
    if obj.github_docs_video_repo:
        return obj.github_docs_video_repo.strip()
    return (getattr(settings, "GITHUB_DOCS_VIDEO_REPO", None) or "").strip()


def resolve_github_video_release_tag() -> str:
    from app_organization.models import PlatformOpsSettings

    obj = PlatformOpsSettings.get_singleton()
    if obj.github_docs_video_release_tag:
        return obj.github_docs_video_release_tag.strip()
    tag = (getattr(settings, "GITHUB_DOCS_VIDEO_RELEASE_TAG", None) or "").strip()
    return tag or "videos"

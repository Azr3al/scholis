from __future__ import annotations

import base64
import uuid
from pathlib import Path
from typing import BinaryIO

import requests


class GitHubVideoUploadError(Exception):
    pass


_CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def content_type_for_filename(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return _CONTENT_TYPES.get(ext, "application/octet-stream")


class GitHubVideoClient:
    API_BASE = "https://api.github.com"
    _BOOTSTRAP_README = (
        b"# Schedjuice product docs videos\n\n"
        b"Tutorial videos are published as GitHub Release assets.\n"
    )

    def __init__(self, *, token: str, repo: str, release_tag: str):
        owner, _, name = repo.partition("/")
        if not owner or not name:
            raise ValueError("repo must be in owner/name format")
        self.owner = owner
        self.repo = name
        self.release_tag = release_tag
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
        )

    def _repo_url(self, path: str) -> str:
        return f"{self.API_BASE}/repos/{self.owner}/{self.repo}{path}"

    def _bootstrap_empty_repo(self) -> None:
        resp = self.session.put(
            self._repo_url("/contents/README.md"),
            json={
                "message": "Initialize product docs videos repository",
                "content": base64.b64encode(self._BOOTSTRAP_README).decode("ascii"),
            },
            timeout=30,
        )
        if resp.status_code >= 400:
            raise GitHubVideoUploadError(resp.text)

    def _create_release(self) -> dict:
        create = self.session.post(
            self._repo_url("/releases"),
            json={
                "tag_name": self.release_tag,
                "name": "Product docs videos",
                "body": "Tutorial videos for Schedjuice product docs.",
            },
            timeout=30,
        )
        if create.status_code == 422 and "Repository is empty" in create.text:
            self._bootstrap_empty_repo()
            create = self.session.post(
                self._repo_url("/releases"),
                json={
                    "tag_name": self.release_tag,
                    "name": "Product docs videos",
                    "body": "Tutorial videos for Schedjuice product docs.",
                },
                timeout=30,
            )
        if create.status_code >= 400:
            raise GitHubVideoUploadError(create.text)
        return create.json()

    def _ensure_release(self) -> dict:
        resp = self.session.get(
            self._repo_url(f"/releases/tags/{self.release_tag}"),
            timeout=30,
        )
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code != 404:
            raise GitHubVideoUploadError(resp.text)

        return self._create_release()

    def _asset_upload_url(self, release: dict) -> str:
        upload_url = (release.get("upload_url") or "").strip()
        if not upload_url:
            raise GitHubVideoUploadError("GitHub release did not include an upload URL.")
        return upload_url.split("{", 1)[0]

    def upload_asset(self, *, filename: str, file_obj: BinaryIO) -> str:
        release = self._ensure_release()
        safe_name = Path(filename).name or "asset.bin"
        asset_name = f"{uuid.uuid4().hex[:12]}-{safe_name}"
        content_type = content_type_for_filename(safe_name)

        resp = self.session.post(
            self._asset_upload_url(release),
            params={"name": asset_name},
            data=file_obj,
            headers={"Content-Type": content_type},
            timeout=600,
        )
        if resp.status_code >= 400:
            raise GitHubVideoUploadError(resp.text)
        data = resp.json()
        url = (data.get("browser_download_url") or "").strip()
        if not url:
            raise GitHubVideoUploadError("GitHub did not return a download URL.")
        return url

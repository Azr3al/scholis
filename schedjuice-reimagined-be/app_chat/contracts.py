from __future__ import annotations

import os


MAX_CHAT_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024


ALLOWED_CHAT_ATTACHMENT_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
    "video/mp4",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/webm",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "text/plain",
    "application/zip",
}

ALLOWED_CHAT_ATTACHMENT_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".heic",
    ".heif",
    ".pdf",
    ".mp4",
    ".m4a",
    ".webm",
    ".mp3",
    ".wav",
    ".ogg",
    ".txt",
    ".zip",
}

MIME_TO_ALLOWED_EXTENSIONS = {
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/gif": {".gif"},
    "image/webp": {".webp"},
    "image/heic": {".heic"},
    "image/heif": {".heif"},
    "application/pdf": {".pdf"},
    "video/mp4": {".mp4"},
    "audio/mpeg": {".mp3"},
    "audio/mp3": {".mp3"},
    "audio/mp4": {".m4a"},
    "audio/webm": {".webm"},
    "audio/wav": {".wav"},
    "audio/x-wav": {".wav"},
    "audio/ogg": {".ogg"},
    "text/plain": {".txt"},
    "application/zip": {".zip"},
}


def normalize_extension(filename: str) -> str:
    _, ext = os.path.splitext(filename or "")
    return ext.lower()

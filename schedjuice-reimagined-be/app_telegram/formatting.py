"""Convert AI Markdown output to Telegram-safe HTML."""
from __future__ import annotations

import re

_BOLD_RE = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
_ITALIC_STAR_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", re.DOTALL)
_ITALIC_UNDERSCORE_RE = re.compile(r"(?<!_)_(?!_)(.+?)(?<!_)_(?!_)", re.DOTALL)
_CODE_RE = re.compile(r"`([^`]+)`")
_BULLET_RE = re.compile(r"^(\s*)[*\-]\s+")
_LINK_RE = re.compile(r"\[([^\]]+)\]\((https://[^)\s]+)\)")


def escape_telegram_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _stash(replacements: list[str], html_fragment: str) -> str:
    idx = len(replacements)
    replacements.append(html_fragment)
    return f"\x00{idx}\x00"


def _substitute_pattern(
    text: str,
    pattern: re.Pattern[str],
    tag: str,
    replacements: list[str],
) -> str:
    parts: list[str] = []
    last = 0
    for match in pattern.finditer(text):
        parts.append(text[last : match.start()])
        parts.append(
            _stash(
                replacements,
                f"<{tag}>{escape_telegram_html(match.group(1))}</{tag}>",
            )
        )
        last = match.end()
    parts.append(text[last:])
    return "".join(parts)


def _format_inline_without_links(text: str) -> str:
    replacements: list[str] = []

    def stash_code(match: re.Match[str]) -> str:
        return _stash(
            replacements,
            f"<code>{escape_telegram_html(match.group(1))}</code>",
        )

    text = _CODE_RE.sub(stash_code, text)
    text = _substitute_pattern(text, _BOLD_RE, "b", replacements)
    text = _substitute_pattern(text, _ITALIC_STAR_RE, "i", replacements)
    text = _substitute_pattern(text, _ITALIC_UNDERSCORE_RE, "i", replacements)
    text = escape_telegram_html(text)
    for idx, fragment in enumerate(replacements):
        text = text.replace(f"\x00{idx}\x00", fragment)
    return text


def _format_text_segment(text: str) -> str:
    if not _LINK_RE.search(text):
        return _format_inline_without_links(text)

    parts: list[str] = []
    last = 0
    for match in _LINK_RE.finditer(text):
        if match.start() > last:
            parts.append(_format_inline_without_links(text[last : match.start()]))
        label_html = _format_inline_without_links(match.group(1))
        href = escape_telegram_html(match.group(2))
        parts.append(f'<a href="{href}">{label_html}</a>')
        last = match.end()
    if last < len(text):
        parts.append(_format_inline_without_links(text[last:]))
    return "".join(parts)


def _format_line(line: str) -> str:
    bullet = _BULLET_RE.match(line)
    if bullet:
        indent = bullet.group(1)
        rest = line[bullet.end() :]
        return f"{indent}• {_format_text_segment(rest)}"
    return _format_text_segment(line)


def markdown_to_telegram_html(text: str) -> str:
    """Convert common Markdown patterns from AI replies to Telegram HTML."""
    if not text:
        return ""
    lines = text.split("\n")
    return "\n".join(_format_line(line) for line in lines)

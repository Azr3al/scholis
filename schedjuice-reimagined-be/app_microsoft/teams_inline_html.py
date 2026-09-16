import base64
import logging
import re
from html.parser import HTMLParser
from typing import Any

from app_microsoft.teams_image_content import (
    MAX_HOSTED_BYTES,
    MAX_HOSTED_BYTES_PER_MESSAGE,
    MAX_IMAGES_PER_MESSAGE,
    _link_html_for_attachment,
    _read_attachment_bytes,
    is_raster_image_filename,
    mime_type_for_filename,
)

logger = logging.getLogger(__name__)

_INLINE_IMG_RE = re.compile(
    r'<img\b[^>]*\bdata-attachment-id=["\'](\d+)["\'][^>]*/?>',
    re.IGNORECASE,
)


class InlineTeamsBudgetError(Exception):
    pass


def announcement_has_inline_raster_images(announcement) -> bool:
    html = announcement.html_data or ""
    return bool(_INLINE_IMG_RE.search(html))


def validate_inline_teams_budget(entries: list[tuple[int, bytes]]) -> str | None:
    if len(entries) > MAX_IMAGES_PER_MESSAGE:
        return (
            f"Teams allows up to {MAX_IMAGES_PER_MESSAGE} inline images per message; "
            f"this post has {len(entries)}."
        )
    total = sum(len(raw) for _, raw in entries)
    if total > MAX_HOSTED_BYTES_PER_MESSAGE:
        mb = total / (1024 * 1024)
        limit_mb = MAX_HOSTED_BYTES_PER_MESSAGE / (1024 * 1024)
        return (
            f"Inline images total {mb:.1f} MB; Teams limit is {limit_mb:.1f} MB."
        )
    for _, raw in entries:
        if len(raw) > MAX_HOSTED_BYTES:
            return f"One inline image exceeds the {MAX_HOSTED_BYTES // (1024 * 1024)} MB per-image limit."
    return None


def _non_image_attachment_links_html(announcement) -> str:
    lines: list[str] = []
    for att in announcement.attachments.all():
        if is_raster_image_filename(att.filename):
            continue
        try:
            url = att.file.url
            lines.append(f'<li><a href="{url}">{att.filename}</a></li>')
        except (ValueError, AttributeError):
            lines.append(f"<li>{att.filename}</li>")
    if not lines:
        return ""
    return (
        "<p><strong>Attachments:</strong></p><ul>"
        + "".join(lines)
        + "</ul>"
    )


class _TeamsInlineHTMLParser(HTMLParser):
    """Rebuild Teams-safe inline HTML, resolving data-attachment-id images."""

    def __init__(self, attachment_by_id: dict[int, Any]):
        super().__init__(convert_charrefs=True)
        self.attachment_by_id = attachment_by_id
        self.html_parts: list[str] = []
        self.hosted: list[dict[str, Any]] = []
        self.hosted_bytes = 0
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attr_map = {k.lower(): v for k, v in attrs}
        if tag == "img":
            att_id_raw = attr_map.get("data-attachment-id")
            if att_id_raw is None:
                return
            try:
                att_id = int(att_id_raw)
            except (TypeError, ValueError):
                return
            att = self.attachment_by_id.get(att_id)
            if att is None:
                logger.warning("Missing inline attachment id=%s for Teams", att_id)
                return
            raw = _read_attachment_bytes(att)
            if raw is None:
                return
            if len(raw) > MAX_HOSTED_BYTES:
                self.html_parts.append(_link_html_for_attachment(att))
                return
            temp_id = str(len(self.hosted) + 1)
            self.hosted.append(
                {
                    "@microsoft.graph.temporaryId": temp_id,
                    "contentBytes": base64.b64encode(raw).decode("ascii"),
                    "contentType": mime_type_for_filename(att.filename),
                }
            )
            self.hosted_bytes += len(raw)
            alt = attr_map.get("alt") or att.filename
            self.html_parts.append(
                f'<p><img src="../hostedContents/{temp_id}/$value" alt="{alt}" /></p>'
            )
            return
        if tag in {"script", "style", "table", "thead", "tbody", "tr", "td", "th"}:
            self._skip_depth += 1
            return
        allowed = {
            "p",
            "br",
            "strong",
            "b",
            "em",
            "i",
            "u",
            "ul",
            "ol",
            "li",
            "h1",
            "h2",
            "h3",
            "a",
            "span",
        }
        if tag not in allowed:
            return
        attr_str = ""
        if tag == "a" and attr_map.get("href"):
            attr_str = f' href="{attr_map["href"]}"'
        self.html_parts.append(f"<{tag}{attr_str}>")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {"script", "style", "table", "thead", "tbody", "tr", "td", "th"}:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag in {"p", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h1", "h2", "h3", "a", "span"}:
            self.html_parts.append(f"</{tag}>")

    def handle_data(self, data):
        if self._skip_depth:
            return
        if data:
            self.html_parts.append(data)


def build_teams_inline_body_html(announcement, *, heading: str, footer: str) -> tuple[str, list[dict[str, Any]]]:
    html_source = announcement.html_data or announcement.data or ""
    if not html_source.strip():
        html_source = "<p>No content</p>"

    inline_ids = [int(m.group(1)) for m in _INLINE_IMG_RE.finditer(html_source)]
    attachment_by_id = {
        att.id: att
        for att in announcement.attachments.all()
        if att.id in inline_ids
    }

    parser = _TeamsInlineHTMLParser(attachment_by_id)
    parser.feed(html_source)
    body = "".join(parser.html_parts) or "<p>No content</p>"
    body += _non_image_attachment_links_html(announcement)
    full_html = f"{heading}{body}{footer}"
    return full_html, parser.hosted


def collect_inline_hosted_bytes(announcement) -> list[tuple[int, bytes]]:
    html_source = announcement.html_data or ""
    inline_ids = [int(m.group(1)) for m in _INLINE_IMG_RE.finditer(html_source)]
    attachment_by_id = {
        att.id: att
        for att in announcement.attachments.all()
        if att.id in inline_ids
    }
    entries: list[tuple[int, bytes]] = []
    temp_id = 0
    for att_id in inline_ids:
        att = attachment_by_id.get(att_id)
        if att is None:
            continue
        raw = _read_attachment_bytes(att)
        if raw is None or len(raw) > MAX_HOSTED_BYTES:
            continue
        temp_id += 1
        entries.append((temp_id, raw))
    return entries

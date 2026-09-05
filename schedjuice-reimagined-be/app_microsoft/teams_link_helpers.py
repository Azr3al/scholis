"""
Parse Microsoft Teams meeting URLs and resolve short /meet/ links for Graph JoinWebUrl lookup.

Primary format (what teachers paste):
  https://teams.microsoft.com/meet/49406637652238?p=QGPv7tvSEvsR3Ewknp

Optional: full meetup-join URLs (optional context= with organizer hint).
"""

import base64
import json
import logging
import re
from typing import Dict, List, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse

import requests

logger = logging.getLogger(__name__)

TEAMS_JOIN_HOSTS = (
    "teams.microsoft.com",
    "teams.cloud.microsoft",
    "teams.live.com",
)


def extract_organizer_object_id_from_teams_url(url: Optional[str]) -> Optional[str]:
    """
    Teams meetup-join URLs often include ?context=<base64> with Oid = organizer Azure AD object id.
    """
    if not url:
        return None
    ctx = decode_teams_context_query(urlparse(url).query)
    if not ctx:
        return None
    return ctx.get("Oid") or ctx.get("oid")


def decode_teams_context_query(query_string: str) -> Optional[Dict]:
    """Decode ?context= base64 JSON (Oid=organizer, Tid=tenant)."""
    qs = parse_qs(query_string)
    raw = (qs.get("context") or [None])[0]
    if not raw:
        return None
    for decoder in (_b64url_json, _b64std_json):
        try:
            return decoder(raw)
        except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
            continue
    return None


def _b64url_json(raw: str) -> Dict:
    pad = "=" * (-len(raw) % 4)
    data = base64.urlsafe_b64decode(raw + pad)
    return json.loads(data.decode("utf-8"))


def _b64std_json(raw: str) -> Dict:
    pad = "=" * (-len(raw) % 4)
    data = base64.standard_b64decode(raw + pad)
    return json.loads(data.decode("utf-8"))


def parse_teams_meet_short_url(url: str) -> Optional[Dict]:
    """
    Parse https://teams.microsoft.com/meet/{id}?p=...
    Also accepts teams.cloud.microsoft / teams.live.com hosts.
    """
    p = urlparse(url.strip())
    if not p.scheme.startswith("http"):
        return None
    host = (p.netloc or "").lower()
    if not any(h in host for h in TEAMS_JOIN_HOSTS):
        return None
    path = unquote(p.path).rstrip("/")
    segments = [s for s in path.split("/") if s]
    if len(segments) >= 2 and segments[0].lower() == "meet":
        meet_id = segments[1]
        qs = parse_qs(p.query)
        p_param = (qs.get("p") or [None])[0]
        return {
            "type": "meet_short",
            "meet_url": url.strip(),
            "meet_id": meet_id,
            "passcode_param": p_param,
        }
    return None


def parse_meetup_join_url(url: str) -> Optional[Dict]:
    """Direct meetup-join link; optional organizer from context=."""
    p = urlparse(url.strip())
    if not p.scheme.startswith("http"):
        return None
    path_l = unquote(p.path).lower()
    if "meetup-join" not in path_l:
        return None
    ctx = decode_teams_context_query(p.query)
    return {
        "type": "meetup_join",
        "join_url": url.strip(),
        "organizer_id": (ctx or {}).get("Oid"),
        "tenant_id": (ctx or {}).get("Tid"),
    }


def parse_teams_url(url: str) -> Optional[Dict]:
    """Classify URL as meet_short or meetup_join."""
    m = parse_teams_meet_short_url(url)
    if m:
        return m
    return parse_meetup_join_url(url)


def resolve_teams_meet_to_join_url(
    meet_url: str, timeout: int = 20
) -> Tuple[Optional[str], Optional[str]]:
    """
    Follow HTTP redirects from /meet/... and optionally scrape meetup-join from HTML.

    Returns (meetup_join_url, organizer_object_id_from_context).
    Organizer id is read from ?context= on any redirect or final URL when present.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    organizer_from_context: Optional[str] = None
    try:
        r = requests.get(
            meet_url,
            allow_redirects=True,
            timeout=timeout,
            headers=headers,
        )
        for resp in list(r.history) + [r]:
            u = resp.url or ""
            oid = extract_organizer_object_id_from_teams_url(u)
            if oid:
                organizer_from_context = oid
            if "meetup-join" in u.lower():
                return u, organizer_from_context or extract_organizer_object_id_from_teams_url(u)
        text = r.text or ""
        for pattern in (
            r'https://teams\.microsoft\.com/l/meetup-join/[^\s"\'<>]+',
            r'https://teams\.cloud\.microsoft/l/meetup-join/[^\s"\'<>]+',
            r'https://teams\.live\.com/l/meetup-join/[^\s"\'<>]+',
        ):
            m = re.search(pattern, text, re.I)
            if m:
                scraped = m.group(0).rstrip("'\"")
                return scraped, organizer_from_context or extract_organizer_object_id_from_teams_url(
                    scraped
                )
    except requests.RequestException as exc:
        logger.warning("resolve_teams_meet_to_join_url: %s", exc)
    return None, organizer_from_context


def collect_organizer_ids_from_urls(*urls: Optional[str]) -> List[str]:
    """Deduplicated Oid values from context= on any of the given URLs (order preserved)."""
    seen = set()
    out: List[str] = []
    for u in urls:
        if not u:
            continue
        oid = extract_organizer_object_id_from_teams_url(u)
        if oid and oid not in seen:
            seen.add(oid)
            out.append(oid)
    return out


def build_join_url_candidates(parsed: Dict, resolved_join: Optional[str]) -> List[str]:
    """
    Ordered list of URLs to try with $filter=JoinWebUrl eq '...'.
    Prefer resolved meetup-join, then original short meet URL and variants.
    """
    seen = set()
    out = []

    def add(u: Optional[str]) -> None:
        if not u:
            return
        u = u.strip()
        if u not in seen:
            seen.add(u)
            out.append(u)

    if parsed.get("type") == "meet_short":
        add(resolved_join)
        mu = parsed.get("meet_url")
        add(mu)
        if mu and "?" in mu:
            add(mu.split("?")[0])
    elif parsed.get("type") == "meetup_join":
        ju = parsed.get("join_url")
        add(ju)
        if ju and "?" in ju:
            add(ju.split("?")[0])
    return out

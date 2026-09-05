"""
Fetch Microsoft Teams meeting details and attendance from a pasted meeting URL.

Expects short meeting links (what Teams copies for "Copy meeting link"):
  https://teams.microsoft.com/meet/49406637652238?p=QGPv7tvSEvsR3Ewknp

The command resolves redirects to discover a meetup-join URL when needed, then uses
GET /users/{organizerId}/onlineMeetings?$filter=JoinWebUrl eq '...' like the rest of the stack.

Organizer id is inferred when possible from Teams ?context= (base64 JSON with Oid) on redirect
or meetup-join URLs; --organizer-id overrides that. default_owner (staffy) is tried last.

Optional: paste a full meetup-join URL instead; context= may supply organizer hint.

Attendance uses the same APIs as sync-meeting-attendance (Teams path).

Requires OnlineMeetingArtifact.Read.All (attendance) and OnlineMeetings.Read scope via staffy.

Usage:
  python manage.py fetch-teams-meeting-from-link \\
    "https://teams.microsoft.com/meet/49406637652238?p=..." \\
    --schema <tenant_schema>

  python manage.py fetch-teams-meeting-from-link "<url>" --schema x --organizer-id <aad-object-id>
  python manage.py fetch-teams-meeting-from-link "<url>" --schema x --json
  python manage.py fetch-teams-meeting-from-link "<url>" --schema x --skip-attendance
"""

import json
from typing import Any, Dict, List, Optional, Tuple

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_microsoft.graph_wrapper.meeting import MSMeeting
from app_microsoft.teams_link_helpers import (
    build_join_url_candidates,
    collect_organizer_ids_from_urls,
    extract_organizer_object_id_from_teams_url,
    parse_teams_url,
    resolve_teams_meet_to_join_url,
)
from app_organization.models import Organization


def _join_url_variants(join_url: str) -> List[str]:
    """Try exact URL then without query string (JoinWebUrl may omit ?p= or context)."""
    s = [join_url.strip()]
    if "?" in join_url:
        s.append(join_url.split("?")[0].strip())
    seen = set()
    out = []
    for x in s:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _find_online_meeting_for_join_url(
    meeting: MSMeeting,
    user_id: str,
    join_url: str,
) -> Tuple[Optional[Dict], Optional[str]]:
    """Return (online_meeting_object, matched_join_url_variant) or (None, None)."""
    for candidate in _join_url_variants(join_url):
        res = meeting.find_online_meeting_by_join_url(user_id, candidate)
        if res.status_code not in range(199, 300):
            continue
        data = res.json()
        values = data.get("value") or []
        if values:
            return values[0], candidate
    return None, None


def _build_organizer_candidates(
    organizer_override: Optional[str],
    raw_url: str,
    parsed: Dict,
    organizer_from_resolve: Optional[str],
    join_urls: List[str],
    default_owner_id: str,
) -> List[str]:
    """
    Order: explicit --organizer-id, Oid from /meet/ redirect chain, Oid from join URL
    candidates, Oid from pasted URL, meetup_join parse, then default_owner.
    """
    seen = set()
    out: List[str] = []

    def add(oid: Optional[str]) -> None:
        if not oid:
            return
        oid = str(oid).strip()
        if oid and oid not in seen:
            seen.add(oid)
            out.append(oid)

    add(organizer_override)
    add(organizer_from_resolve)
    for oid in collect_organizer_ids_from_urls(*join_urls):
        add(oid)
    add(extract_organizer_object_id_from_teams_url(raw_url))
    if parsed.get("type") == "meetup_join":
        add(parsed.get("organizer_id"))
    add(default_owner_id)
    return out


class Command(BaseCommand):
    help = (
        "Resolve Teams meeting + attendance from a teams.microsoft.com/meet/... URL "
        "(organizer is taken from Teams context= when possible; use --organizer-id to override)"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "url",
            type=str,
            help="Teams short meet URL (teams.microsoft.com/meet/...) or meetup-join URL",
        )
        parser.add_argument(
            "--schema",
            type=str,
            required=True,
            help="Tenant schema name (e.g. xteachersu)",
        )
        parser.add_argument(
            "--organizer-id",
            type=str,
            default=None,
            help="Override Azure AD object ID of the meeting organizer (optional if context= has Oid)",
        )
        parser.add_argument(
            "--skip-attendance",
            action="store_true",
            help="Only fetch meeting metadata, not attendance reports",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Print one JSON object to stdout",
        )

    def handle(self, *args, **options):
        raw_url = options["url"]
        schema_name = options["schema"]
        organizer_override = options.get("organizer_id")
        skip_attendance = options.get("skip_attendance", False)
        as_json = options.get("json", False)

        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema_name).first()
            if not org:
                self.stderr.write(self.style.ERROR(f"Organization not found: {schema_name}"))
                return
            if not org.default_owner_id:
                self.stderr.write(self.style.ERROR("Organization has no default_owner_id"))
                return

        meeting = MSMeeting(org)
        parsed = parse_teams_url(raw_url)
        if not parsed:
            self.stderr.write(
                self.style.ERROR(
                    "Unrecognized URL. Expected:\n"
                    "  https://teams.microsoft.com/meet/<id>?p=...\n"
                    "or a full meetup-join URL."
                )
            )
            return

        resolved_join: Optional[str] = None
        organizer_from_resolve: Optional[str] = None
        if parsed.get("type") == "meet_short":
            resolved_join, organizer_from_resolve = resolve_teams_meet_to_join_url(
                parsed["meet_url"]
            )

        join_urls = build_join_url_candidates(parsed, resolved_join)
        if not join_urls:
            self.stderr.write(self.style.ERROR("Could not build join URL candidates from input."))
            return

        organizer_candidates = _build_organizer_candidates(
            organizer_override,
            raw_url,
            parsed,
            organizer_from_resolve,
            join_urls,
            org.default_owner_id,
        )

        online_meeting: Optional[Dict] = None
        matched_join: Optional[str] = None
        matched_organizer: Optional[str] = None

        for oid in organizer_candidates:
            for ju in join_urls:
                om, mj = _find_online_meeting_for_join_url(meeting, oid, ju)
                if om:
                    online_meeting = om
                    matched_join = mj
                    matched_organizer = oid
                    break
            if online_meeting:
                break

        if not online_meeting:
            self.stderr.write(
                self.style.ERROR(
                    "Could not resolve onlineMeeting by JoinWebUrl. "
                    "Pass --organizer-id with the meeting organizer's Azure AD object ID, "
                    "or ensure the /meet/ link resolves to a meetup-join URL with ?context= (Oid). "
                    "The stored JoinWebUrl must match one of the tried URLs."
                )
            )
            if not as_json:
                self.stdout.write(f"Tried join URL(s): {join_urls}")
                self.stdout.write(f"Tried organizer_id(s): {organizer_candidates}")
            return

        meeting_id = online_meeting.get("id")
        if not meeting_id:
            self.stderr.write(self.style.ERROR("Resolved meeting has no id"))
            return

        full = meeting.get_online_meeting(user_id=matched_organizer, meeting_id=meeting_id)
        if not full:
            self.stderr.write(
                self.style.ERROR(
                    f"get_online_meeting failed for id={meeting_id} user={matched_organizer}"
                )
            )
            return

        attendance_payload: Any = None
        if not skip_attendance:
            list_res = meeting.list_attendance_reports(
                user_id=matched_organizer,
                meeting_id=meeting_id,
            )
            if list_res.status_code not in range(199, 300):
                attendance_payload = {
                    "error": list_res.status_code,
                    "body": list_res.text[:1000],
                    "hint": "Channel meetings often return errors; scheduled online meetings work better.",
                }
            else:
                reports = (list_res.json() or {}).get("value") or []
                detailed = []
                for r in reports:
                    rid = r.get("id")
                    if not rid:
                        continue
                    gr = meeting.get_attendance_report(
                        user_id=matched_organizer,
                        meeting_id=meeting_id,
                        report_id=rid,
                        expand_records=True,
                    )
                    if gr.status_code in range(199, 300):
                        detailed.append(gr.json())
                    else:
                        detailed.append(
                            {
                                "report_id": rid,
                                "error": gr.status_code,
                                "body": gr.text[:500],
                            }
                        )
                attendance_payload = {"reports": detailed}

        result = {
            "parsed_url": parsed,
            "resolved_meetup_join_url": resolved_join,
            "organizer_id_from_meet_redirect": organizer_from_resolve,
            "organizer_id_candidates": organizer_candidates,
            "join_url_candidates": join_urls,
            "resolved_via_join_url": matched_join,
            "organizer_id_used": matched_organizer,
            "online_meeting_summary": online_meeting,
            "online_meeting_full": full,
            "attendance": attendance_payload,
        }

        if as_json:
            self.stdout.write(json.dumps(result, indent=2, default=str))
        else:
            self._print_human(result)

    def _print_human(self, result: Dict) -> None:
        om = result.get("online_meeting_full") or {}
        self.stdout.write(self.style.SUCCESS("Resolved online meeting"))
        self.stdout.write(f"  Organizer (Graph user id): {result.get('organizer_id_used')}")
        ctx_oid = result.get("organizer_id_from_meet_redirect")
        if ctx_oid:
            self.stdout.write(f"  Oid from Teams context (redirect): {ctx_oid}")
        rj = result.get("resolved_meetup_join_url")
        if rj:
            self.stdout.write(f"  Resolved meetup-join (redirect/HTML): {rj}")
        self.stdout.write(f"  JoinWebUrl match: {result.get('resolved_via_join_url')}")
        self.stdout.write(f"  id: {om.get('id')}")
        self.stdout.write(f"  subject: {om.get('subject')}")
        self.stdout.write(f"  start: {om.get('startDateTime')}  end: {om.get('endDateTime')}")
        self.stdout.write(f"  joinWebUrl: {om.get('joinWebUrl')}")

        att = result.get("attendance")
        if att is None:
            return
        self.stdout.write("")
        if isinstance(att, dict) and "error" in att:
            self.stdout.write(self.style.WARNING(f"Attendance list failed: {att}"))
            return
        reports = (att or {}).get("reports") or []
        self.stdout.write(f"Attendance reports: {len(reports)}")
        for i, rep in enumerate(reports):
            if "error" in rep:
                self.stdout.write(self.style.WARNING(f"  Report {i}: {rep}"))
                continue
            recs = rep.get("attendanceRecords") or []
            self.stdout.write(
                f"  Report {i}: id={rep.get('id')} totalParticipantCount={rep.get('totalParticipantCount')} "
                f"records={len(recs)}"
            )

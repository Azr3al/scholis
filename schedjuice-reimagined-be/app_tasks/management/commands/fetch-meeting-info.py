"""
Django management command to fetch meeting information for each course.
Retrieves policies (lobby, breakout rooms, etc.), participants (organizer, attendees), join URL.
Usage:
  python manage.py fetch-meeting-info --schema <schema_name>              # all courses
  python manage.py fetch-meeting-info <course_id> --schema <schema_name>  # single course
  python manage.py fetch-meeting-info --schema <schema_name> --json       # JSON output
  python manage.py fetch-meeting-info --schema <schema_name> --sync --use-staffy-organizer  # force Graph user = staffy
"""

import json
import logging

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course
from app_microsoft.graph_wrapper.base import graph_user_id_for_delegated_staffy_token
from app_microsoft.graph_wrapper.meeting import MSMeeting
from app_microsoft.meeting_helpers import (
    graph_organizer_user_id_for_course,
    meeting_organizer_mismatch_debug_for_fetch,
)
from app_organization.models import Organization
from utilitas.async_tasks import django_q_task

logger = logging.getLogger(__name__)


def _try_organizer_mismatch_debug(
    course, org, graph_user_id: str, use_staffy_organizer: bool
) -> dict:
    try:
        d = meeting_organizer_mismatch_debug_for_fetch(
            course,
            org,
            graph_user_id_used=graph_user_id,
            use_staffy_organizer=use_staffy_organizer,
        )
        d["graph_auth"] = (
            "application (client credentials) for GET — required to call "
            "/users/{organizerId}/onlineMeetings/… for a teacher; delegated staffy token only "
            "matches /users/{staffyId}/ or /me (see Graph 400 organizer mismatch)."
        )
        return d
    except Exception as exc:
        return {"_organizer_mismatch_debug_error": str(exc)}


def _graph_user_id_for_fetch_course(
    org: Organization, course: Course, use_staffy_organizer: bool
) -> str | None:
    """
    Graph /users/{id}/ for GET onlineMeetings: same order as update-meeting-policies.

    - Default: resolved course organizer (microsoft_meeting_organizer_id, else main-teacher
      microsoft_id), then fall back to organization default_owner_id.
    - use_staffy_organizer: always staffy (STAFFY_AZURE_OBJECT_ID) for meetings created under that identity.
    """
    if use_staffy_organizer:
        return graph_user_id_for_delegated_staffy_token(org)
    resolved = graph_organizer_user_id_for_course(course, org)
    if resolved:
        return resolved
    default = (org.default_owner_id or "").strip() or None
    return default


@django_q_task
def fetch_meeting_info_async(
    schema_name: str,
    course_id: int | None = None,
    backfill: bool = False,
    use_staffy_organizer: bool = False,
) -> None:
    """Async wrapper: fetch meeting info for courses, optionally backfill. Uses logger for output."""
    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(schema_name=schema_name).first()
    if not org:
        logger.warning(f"fetch_meeting_info_async: org not found for schema {schema_name}")
        return

    with schema_context(schema_name):
        if course_id is not None:
            courses = Course.objects.filter(
                id=course_id,
                microsoft_meeting_id__isnull=False,
            ).exclude(microsoft_meeting_id="")
        else:
            courses = Course.objects.filter(
                microsoft_meeting_id__isnull=False
            ).exclude(microsoft_meeting_id="")

        # Application (client credentials) — same as update-meeting-policies. Delegated staffy token
        # cannot call /users/{anotherUserId}/onlineMeetings/... (Graph 400: organizer in token vs URL).
        meeting = MSMeeting(org, use_app_auth=True)
        fetched = 0
        errors = 0
        for course in courses:
            graph_user_id = _graph_user_id_for_fetch_course(
                org, course, use_staffy_organizer
            )
            if not graph_user_id:
                errors += 1
                no_user_dbg = _try_organizer_mismatch_debug(
                    course, org, "", use_staffy_organizer
                )
                logger.warning(
                    "fetch_meeting_info_async: no Graph user for GET (course %s %s) %s",
                    course.id,
                    course.title,
                    json.dumps(no_user_dbg, default=str)[:2000],
                )
                continue
            try:
                data, graph_err = meeting.get_online_meeting_or_error(
                    user_id=graph_user_id,
                    meeting_id=course.microsoft_meeting_id,
                )
                if data:
                    fetched += 1
                    if backfill:
                        join_settings = data.get("joinMeetingIdSettings") or {}
                        course.meeting_join_id = join_settings.get("joinMeetingId") or None
                        course.meeting_passcode = join_settings.get("passcode") or None
                        course.save()
                    logger.info(f"Fetched meeting for course {course.id} ({course.title})")
                else:
                    errors += 1
                    dbg = _try_organizer_mismatch_debug(
                        course, org, graph_user_id, use_staffy_organizer
                    )
                    logger.warning(
                        "Failed to fetch meeting for course %s (%s): %s | organizer_mismatch_debug=%s",
                        course.id,
                        course.title,
                        graph_err or "unknown error",
                        json.dumps(dbg, default=str)[:4000],
                    )
            except Exception:
                errors += 1
                logger.exception("Error fetching meeting for course %s", course.id)
                dbg = _try_organizer_mismatch_debug(
                    course, org, graph_user_id, use_staffy_organizer
                )
                logger.error(
                    "organizer_mismatch_debug (after exception) course %s: %s",
                    course.id,
                    json.dumps(dbg, default=str)[:4000],
                )

        logger.info(f"fetch_meeting_info_async: fetched {fetched}, errors {errors}")


def _format_meeting_info(course, data):
    """Build a structured dict from course + Graph API response."""
    participants = data.get("participants", {})
    organizer = participants.get("organizer", {})
    attendees = participants.get("attendees", [])
    join_settings = data.get("joinMeetingIdSettings") or {}

    return {
        "course_id": course.id,
        "course_title": course.title,
        "course_code": course.code,
        "meeting_id": data.get("id"),
        "subject": data.get("subject"),
        "join_web_url": data.get("joinWebUrl"),
        "meeting_join_id": join_settings.get("joinMeetingId"),
        "meeting_passcode": join_settings.get("passcode"),
        "start_date_time": data.get("startDateTime"),
        "end_date_time": data.get("endDateTime"),
        "creation_date_time": data.get("creationDateTime"),
        "policies": {
            "allow_breakout_rooms": data.get("allowBreakoutRooms"),
            "allow_recording": data.get("allowRecording"),
            "allow_transcription": data.get("allowTranscription"),
            "allow_attendee_to_enable_camera": data.get("allowAttendeeToEnableCamera"),
            "allow_attendee_to_enable_mic": data.get("allowAttendeeToEnableMic"),
            "allowed_presenters": data.get("allowedPresenters"),
            "allowed_lobby_admitters": data.get("allowedLobbyAdmitters"),
            "lobby_bypass_settings": data.get("lobbyBypassSettings"),
            "allow_meeting_chat": data.get("allowMeetingChat"),
        },
        "participants": {
            "organizer": {
                "upn": organizer.get("upn"),
                "role": organizer.get("role"),
                "identity": organizer.get("identity"),
            },
            "attendees": [
                {
                    "upn": a.get("upn"),
                    "role": a.get("role"),
                    "identity": a.get("identity"),
                }
                for a in attendees
            ],
        },
    }


def _print_meeting_info(info, style):
    """Pretty-print meeting info to stdout."""
    out = style
    out(f"Course {info['course_id']}: {info['course_title']} ({info['course_code'] or '-'})")
    out(f"  Meeting ID: {info['meeting_id']}")
    out(f"  Subject: {info['subject']}")
    out(f"  Join URL: {info['join_web_url']}")
    out(f"  Join ID: {info.get('meeting_join_id') or '-'}  Passcode: {info.get('meeting_passcode') or '-'}")
    out(f"  Start: {info['start_date_time']}  End: {info['end_date_time']}")
    out("  Policies:")
    for k, v in info["policies"].items():
        out(f"    {k}: {v}")
    out("  Organizer:")
    out(f"    upn: {info['participants']['organizer'].get('upn')}  role: {info['participants']['organizer'].get('role')}")
    out(f"  Attendees ({len(info['participants']['attendees'])}):")
    for a in info["participants"]["attendees"]:
        out(f"    - {a.get('upn')} (role: {a.get('role')})")
    out("")


class Command(BaseCommand):
    help = (
        "Fetch meeting information (policies, participants, etc.) for each course with a Teams meeting. "
        "Uses application (client credentials) for Graph — same as update-meeting-policies — so GET can use "
        "/users/{organizerId}/… for any resolved teacher; delegated staffy tokens only support /me or "
        "paths where the user id matches the token. Per-course organizer resolution with fall back to org "
        "default owner; --use-staffy-organizer forces the staffy Entra id for the /users/ segment."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "course_id",
            type=int,
            nargs="?",
            default=None,
            help="Optional course ID. If omitted, fetches all courses with meetings.",
        )
        parser.add_argument(
            "--schema",
            type=str,
            required=True,
            help="Tenant schema name (e.g. xteachersu)",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Output as JSON (single object per course or list)",
        )
        parser.add_argument(
            "--backfill",
            action="store_true",
            help="Save meeting_join_id and meeting_passcode to each course (for existing meetings).",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (no async queue). Default: async.",
        )
        parser.add_argument(
            "--use-staffy-organizer",
            action="store_true",
            default=False,
            dest="use_staffy_organizer",
            help="Use staffy’s Entra id (STAFFY_AZURE_OBJECT_ID) for every GET, instead of the "
            "per-course resolved organizer (course.microsoft_meeting_organizer_id or main teacher) "
            "with fall back to org default owner. Use only for meetings that were created under staffy in Graph.",
        )

    def handle(self, *args, **options):
        course_id = options["course_id"]
        schema_name = options["schema"]
        as_json = options["json"]
        backfill = options["backfill"]
        run_sync = options.get("sync", False)
        use_staffy_organizer = options.get("use_staffy_organizer", False)

        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema_name).first()
            if not org:
                self.stdout.write(
                    self.style.ERROR(f"Organization with schema '{schema_name}' not found.")
                )
                return

        with schema_context(schema_name):
            if course_id is not None:
                courses = Course.objects.filter(
                    id=course_id,
                    microsoft_meeting_id__isnull=False,
                ).exclude(microsoft_meeting_id="")
                if not courses.exists():
                    self.stdout.write(
                        self.style.ERROR(
                            f"Course {course_id} not found or has no meeting in schema '{schema_name}'."
                        )
                    )
                    return
            else:
                courses = Course.objects.filter(
                    microsoft_meeting_id__isnull=False
                ).exclude(microsoft_meeting_id="")

            if not run_sync:
                fetch_meeting_info_async.delay(
                    schema_name,
                    course_id,
                    backfill,
                    use_staffy_organizer,
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        "Fetch meeting info task queued. Check django-q for results."
                    )
                )
                return

            meeting = MSMeeting(org, use_app_auth=True)
            results = []
            errors = 0
            fetch_errors: list[dict] = []

            for course in courses:
                graph_user_id = _graph_user_id_for_fetch_course(
                    org, course, use_staffy_organizer
                )
                if not graph_user_id:
                    errors += 1
                    no_user_detail = (
                        "No Entra id for Graph GET: no course organizer, no main teacher with "
                        "microsoft_id, and no organization default_owner_id. "
                        "Set course.microsoft_meeting_organizer_id or a teacher’s Microsoft id, or org default owner."
                    )
                    no_user_dbg = _try_organizer_mismatch_debug(
                        course, org, "", use_staffy_organizer
                    )
                    fetch_errors.append(
                        {
                            "course_id": course.id,
                            "course_title": course.title,
                            "microsoft_meeting_id": course.microsoft_meeting_id,
                            "graph": no_user_detail,
                            "organizer_mismatch_debug": no_user_dbg,
                        }
                    )
                    self.stdout.write(
                        self.style.ERROR(
                            f"  {no_user_detail} (course {course.id} {course.title})"
                        )
                    )
                    if not as_json:
                        self.stdout.write(
                            json.dumps(no_user_dbg, indent=2, default=str)
                        )
                    continue
                try:
                    data, graph_err = meeting.get_online_meeting_or_error(
                        user_id=graph_user_id,
                        meeting_id=course.microsoft_meeting_id,
                    )
                    if data:
                        info = _format_meeting_info(course, data)
                        results.append(info)
                        if backfill:
                            join_settings = data.get("joinMeetingIdSettings") or {}
                            course.meeting_join_id = join_settings.get("joinMeetingId") or None
                            course.meeting_passcode = join_settings.get("passcode") or None
                            course.save()
                        if not as_json:
                            _print_meeting_info(info, self.stdout.write)
                    else:
                        errors += 1
                        detail = graph_err or "Graph returned no meeting data"
                        org_dbg = _try_organizer_mismatch_debug(
                            course, org, graph_user_id, use_staffy_organizer
                        )
                        fetch_errors.append(
                            {
                                "course_id": course.id,
                                "course_title": course.title,
                                "microsoft_meeting_id": course.microsoft_meeting_id,
                                "graph": detail,
                                "organizer_mismatch_debug": org_dbg,
                            }
                        )
                        self.stdout.write(
                            self.style.ERROR(
                                f"  Failed to fetch meeting for course {course.id} ({course.title}): {detail}"
                            )
                        )
                        if not as_json:
                            self.stdout.write(
                                json.dumps(
                                    org_dbg,
                                    indent=2,
                                    default=str,
                                )
                            )
                except Exception as e:
                    errors += 1
                    logger.exception("Error fetching meeting for course %s", course.id)
                    exc_detail = str(e)
                    org_dbg = _try_organizer_mismatch_debug(
                        course, org, graph_user_id, use_staffy_organizer
                    )
                    fetch_errors.append(
                        {
                            "course_id": course.id,
                            "course_title": course.title,
                            "microsoft_meeting_id": course.microsoft_meeting_id,
                            "graph": exc_detail,
                            "exception": True,
                            "organizer_mismatch_debug": org_dbg,
                        }
                    )
                    self.stdout.write(
                        self.style.ERROR(f"  Failed course {course.id} ({course.title}): {exc_detail}")
                    )
                    if not as_json:
                        self.stdout.write(
                            json.dumps(
                                org_dbg,
                                indent=2,
                                default=str,
                            )
                        )

            if as_json:
                output = results[0] if len(results) == 1 and course_id else results
                if fetch_errors:
                    payload = {"results": output, "errors": fetch_errors}
                    if course_id is not None and not results:
                        payload["note"] = (
                            "When Graph GET fails, errors[].graph has HTTP status and Microsoft error; "
                            "errors[].organizer_mismatch_debug has teacher emails/MS ids, org default owner, "
                            "course organizer fields, and the staffy Graph principal (see mismatch_hint)."
                        )
                    self.stdout.write(json.dumps(payload, indent=2, default=str))
                else:
                    self.stdout.write(json.dumps(output, indent=2, default=str))
            elif results:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Fetched {len(results)} meeting(s). Errors: {errors}"
                    )
                )

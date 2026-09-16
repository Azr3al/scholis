"""
Microsoft Graph wrapper for online meetings, attendance reports, and channel messages.
"""

import json
import logging

logger = logging.getLogger(__name__)

import requests

from app_microsoft.graph_wrapper.base import BaseMSRequest, DEFAULT_GRAPH_TIMEOUT, POSTER_SCOPES


class MSMeeting(BaseMSRequest):
    """
    Wrapper for Microsoft Graph online meeting and attendance APIs.

    use_app_auth=False: delegated staffy (password) — channel messages, legacy paths.
    use_app_auth=True: client credentials — required for /users/{teacherId}/... when the
    organizer is the teacher (Application Access Policy must allow the app for those users).
    See: https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy
    """

    def __init__(self, tenant, use_app_auth: bool = False, credential=None, scopes=None):
        self.tenant = tenant
        self.use_app_auth = use_app_auth
        self.credential = credential
        self.scopes = scopes or POSTER_SCOPES
        self._acquire()

    def _acquire(self) -> None:
        if self.credential is not None:
            token = BaseMSRequest.get_token(
                self.tenant,
                credential=self.credential,
                scopes=self.scopes,
            )
        else:
            token = BaseMSRequest.get_token(
                self.tenant,
                use_app_auth=self.use_app_auth,
            )
        self._apply_access_token(token)

    def _refresh_token(self) -> None:
        self._acquire()

    def list_channels(self, team_id: str):
        """List channels for a team. Requires Channel.ReadBasic.All (delegated)."""
        res = self.get(f"{self.URL}teams/{team_id}/channels")
        if res.status_code not in range(199, 300):
            return None
        return res.json().get("value", [])

    def get_general_channel_id(self, team_id: str):
        """Get the General channel ID (default channel created with the team)."""
        channels = self.list_channels(team_id)
        if not channels:
            return None
        for ch in channels:
            if ch.get("displayName") == "General":
                return ch.get("id")
        return None

    def find_online_meeting_by_join_url(self, user_id: str, join_url: str):
        """
        Resolve Graph onlineMeeting by exact JoinWebUrl (organizer must be user_id).

        Graph requires the URL inside the OData filter to be **percent-encoded** (see Microsoft
        examples for list onlineMeetings). We try encoded first, then legacy raw string.
        """
        from urllib.parse import quote

        encoded = quote(join_url, safe="")
        raw_escaped = join_url.replace("'", "''")
        variants = [encoded, raw_escaped] if encoded != raw_escaped else [encoded]

        last = None
        for inner in variants:
            filt = f"JoinWebUrl eq '{inner}'"
            last = self.get(
                f"{self.URL}users/{user_id}/onlineMeetings",
                params={"$filter": filt},
            )
            if last.status_code in range(199, 300):
                values = last.json().get("value") or []
                if values:
                    return last
        return last

    def find_online_meeting_by_video_teleconference_id(
        self, user_id: str, video_teleconference_id: str
    ):
        """Resolve by VideoTeleconferenceId (matches onlineMeeting.conferenceId from calendar event)."""
        escaped = video_teleconference_id.replace("'", "''")
        return self.get(
            f"{self.URL}users/{user_id}/onlineMeetings",
            params={"$filter": f"VideoTeleconferenceId eq '{escaped}'"},
        )

    def post_channel_message(
        self, team_id: str, channel_id: str, content: str, content_type: str = "html",
        hosted_contents: list | None = None,
    ):
        """
        Post a message to a Teams channel. Creates an announcement visible in the channel.
        Requires ChannelMessage.Send permission (delegated).
        """
        payload = {
            "body": {
                "contentType": content_type,
                "content": content,
            }
        }
        if hosted_contents:
            payload["hostedContents"] = hosted_contents
        return self.post(
            f"{self.URL}teams/{team_id}/channels/{channel_id}/messages",
            json=payload,
        )

    def patch_channel_message(
        self,
        team_id: str,
        channel_id: str,
        message_id: str,
        content: str,
        content_type: str = "html",
    ):
        """Update an existing Teams channel message."""
        payload = {
            "body": {
                "contentType": content_type,
                "content": content,
            }
        }
        return self.patch(
            f"{self.URL}teams/{team_id}/channels/{channel_id}/messages/{message_id}",
            json=payload,
        )

    def soft_delete_channel_message(
        self, team_id: str, channel_id: str, message_id: str
    ):
        """Soft-delete a Teams channel message (best-effort cleanup)."""
        return self.post(
            f"{self.URL}teams/{team_id}/channels/{channel_id}/messages/{message_id}/softDelete",
        )

    def create_online_meeting(
        self,
        user_id: str,
        start_datetime: str,
        end_datetime: str,
        subject: str,
        attendees: list | None = None,
        channel_thread_id: str | None = None,
    ):
        """
        Create an online meeting on behalf of a user.
        user_id: Microsoft user ID (object ID) - typically tenant.default_owner_id
        start_datetime, end_datetime: ISO 8601 format (e.g. "2024-01-15T09:00:00Z")
        subject: Meeting title
        attendees: Optional list of {"microsoft_id": str, "upn": str} for co-organizers
        channel_thread_id: If set, associates the meeting with a Teams channel via chatInfo.threadId
            (same Graph API: POST /users/{id}/onlineMeetings). Team channel meetings typically store
            recordings under the team/channel (vs organizer OneDrive for standalone meetings).
            Use the channel id from GET .../teams/{team-id}/channels (e.g. General = 19:...@thread.tacv2).
        """
        payload = {
            "startDateTime": start_datetime,
            "endDateTime": end_datetime,
            "subject": subject,
        }
        if channel_thread_id:
            payload["chatInfo"] = {"threadId": channel_thread_id}
        url = f"{self.URL}users/{user_id}/onlineMeetings"
        headers = dict(self.headers)
        headers["Content-Type"] = "application/json; charset=utf-8"
        # Use data= with explicit JSON bytes to avoid any requests/Graph API body handling issues
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        return requests.post(
            url, data=body, headers=headers, timeout=DEFAULT_GRAPH_TIMEOUT
        )

    def create_calendar_event_teams_meeting(
        self,
        user_id: str,
        subject: str,
        start_local_datetime_str: str,
        end_local_datetime_str: str,
        timezone_name: str,
        attendees: list | None = None,
    ):
        """
        Calendar-backed Teams meeting (required for callRecording API to return recordings).
        POST /users/{userId}/events with isOnlineMeeting + teamsForBusiness.
        start/end dateTime: local wall time without offset; timeZone: IANA or Windows name.
        attendees: optional list of {"microsoft_id": str, "upn": str} as required attendees.
        """
        payload: dict = {
            "subject": subject,
            "start": {
                "dateTime": start_local_datetime_str,
                "timeZone": timezone_name,
            },
            "end": {
                "dateTime": end_local_datetime_str,
                "timeZone": timezone_name,
            },
            "isOnlineMeeting": True,
            "onlineMeetingProvider": "teamsForBusiness",
        }
        if attendees:
            payload["attendees"] = [
                {
                    "emailAddress": {
                        "address": a["upn"],
                    },
                    "type": "required",
                }
                for a in attendees
            ]
        url = f"{self.URL}users/{user_id}/events"
        headers = dict(self.headers)
        headers["Content-Type"] = "application/json; charset=utf-8"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        return requests.post(
            url, data=body, headers=headers, timeout=DEFAULT_GRAPH_TIMEOUT
        )

    def get_calendar_event(self, user_id: str, event_id: str):
        """
        GET /users/{userId}/events/{eventId}.
        Event ids may contain characters that must be percent-encoded in the path.
        """
        from urllib.parse import quote

        eid = quote(event_id, safe="")
        return self.get(f"{self.URL}users/{user_id}/events/{eid}")

    def delete_calendar_event(self, user_id: str, event_id: str):
        """DELETE /users/{userId}/events/{eventId} (e.g. remove orphan event before fallback path)."""
        from urllib.parse import quote

        eid = quote(event_id, safe="")
        return self.delete(f"{self.URL}users/{user_id}/events/{eid}")

    def update_online_meeting(
        self,
        user_id: str,
        meeting_id: str,
        lobby_bypass_scope: str = "everyone",
        allow_breakout_rooms: bool | None = None,
        attendees: list | None = None,
        allowed_presenters: str | None = None,
    ):
        """
        PATCH an existing online meeting to update settings.
        Takes effect immediately (including for in-progress meetings).
        user_id: Meeting organizer's Azure AD user object ID (NOT Application/client ID).
                 Use tenant.default_owner_id - must be from Entra > Users > Object ID.
        meeting_id: Course.microsoft_meeting_id
        lobby_bypass_scope: "everyone"=all bypass; "invited"=only organizer+invited bypass (students wait in lobby)
        attendees: Optional list of {"microsoft_id": str, "upn": str} - set as coorganizers (organizer + presenter)
        allowed_presenters: e.g. "organizerAndCoOrganizers" so only org+coorg can present
        """
        payload = {}
        if attendees is not None:
            payload["participants"] = {
                "attendees": [
                    {
                        "identity": {"user": {"id": a["microsoft_id"]}},
                        "upn": a["upn"],
                        "role": "coorganizer",
                    }
                    for a in attendees
                ]
            }
        if lobby_bypass_scope is not None:
            payload["lobbyBypassSettings"] = {"scope": lobby_bypass_scope}
        if allow_breakout_rooms is not None:
            payload["allowBreakoutRooms"] = allow_breakout_rooms
        if allowed_presenters is not None:
            payload["allowedPresenters"] = allowed_presenters
        headers = dict(self.headers)
        headers["Content-Type"] = "application/json; charset=utf-8"
        if attendees is not None:
            headers["Prefer"] = "include-unknown-enum-members"
        url = f"{self.URL}users/{user_id}/onlineMeetings/{meeting_id}"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        return requests.patch(
            url, data=body, headers=headers, timeout=DEFAULT_GRAPH_TIMEOUT
        )

    def fetch_online_meeting_request(self, user_id: str, meeting_id: str):
        """
        Raw GET /users/{userId}/onlineMeetings/{meetingId} (for status/body on 403, etc.).
        Prefer: include-unknown-enum-members so coorganizer role is returned (not unknownFutureValue).
        """
        headers = {**self.headers, "Prefer": "include-unknown-enum-members"}
        return requests.get(
            f"{self.URL}users/{user_id}/onlineMeetings/{meeting_id}",
            headers=headers,
            timeout=DEFAULT_GRAPH_TIMEOUT,
        )

    def get_online_meeting_or_error(
        self, user_id: str, meeting_id: str
    ) -> tuple[dict | None, str | None]:
        """
        Returns (meeting_json, None) on success, or (None, detail) on failure.
        detail includes HTTP status and Microsoft Graph error code/message (or body snippet).
        """
        res = self.fetch_online_meeting_request(user_id, meeting_id)
        if res.status_code in range(199, 300):
            try:
                return res.json(), None
            except Exception as exc:
                return None, f"HTTP {res.status_code}: response was not valid JSON ({exc})"
        return None, self._format_graph_error_response(res)

    def _format_graph_error_response(self, res) -> str:
        """Human-readable line for a failed Graph response (for logs and management commands)."""
        status = getattr(res, "status_code", "?")
        try:
            body = res.json()
            if isinstance(body, dict) and isinstance(body.get("error"), dict):
                err = body["error"]
                code = (err.get("code") or "").strip()
                msg = (err.get("message") or "").strip()
                if code and msg:
                    line = f"HTTP {status} — {code}: {msg}"
                elif msg:
                    line = f"HTTP {status} — {msg}"
                elif code:
                    line = f"HTTP {status} — {code}"
                else:
                    line = f"HTTP {status} — {body}"
            else:
                line = f"HTTP {status} — {body}"
        except Exception:
            text = (getattr(res, "text", None) or "").strip()
            if not text:
                return f"HTTP {status} (empty response body)"
            if len(text) > 1200:
                text = text[:1200] + "…"
            line = f"HTTP {status} — {text}"
        if status in (401, 403, 404):
            line += (
                " (fetch-meeting-info uses the course’s resolved Microsoft organizer for GET; "
                "add --use-staffy-organizer only if the meeting was created as staffy; "
                "the /users/ id must be the same Entra id that owns the online meeting in Graph.)"
            )
        return line

    def get_online_meeting(self, user_id: str, meeting_id: str):
        """
        Fetch meeting details: policies, participants (organizer, attendees), join URL, etc.
        GET /users/{userId}/onlineMeetings/{meetingId}
        Uses Prefer: include-unknown-enum-members so coorganizer role is returned (not unknownFutureValue).
        """
        data, _ = self.get_online_meeting_or_error(user_id, meeting_id)
        return data

    def list_attendance_reports(self, user_id: str, meeting_id: str):
        """List attendance reports for an online meeting (up to 50 most recent)."""
        url = f"{self.URL}users/{user_id}/onlineMeetings/{meeting_id}/attendanceReports"
        return self.get(url)

    def get_attendance_report(
        self, user_id: str, meeting_id: str, report_id: str, expand_records=True
    ):
        """
        Get a single attendance report with attendance records expanded.
        Microsoft documents Get meetingAttendanceReport as not supporting channel meetings;
        use list_attendance_records for channel meeting sync instead.
        """
        url = f"{self.URL}users/{user_id}/onlineMeetings/{meeting_id}/attendanceReports/{report_id}"
        if expand_records:
            url += "?$expand=attendanceRecords"
        return self.get(url)

    def list_attendance_records(
        self, user_id: str, meeting_id: str, report_id: str
    ):
        """
        List attendance records for a report (GET .../attendanceReports/{id}/attendanceRecords).
        Prefer this for channel meetings where Get with $expand is unsupported.
        """
        return self.get(
            f"{self.URL}users/{user_id}/onlineMeetings/{meeting_id}/attendanceReports/{report_id}/attendanceRecords"
        )


# Microsoft Graph: application permissions and Teams access policy

## Which identity does what

`BaseMSRequest.get_token` supports three identities:

| Identity | How | Used for |
| --- | --- | --- |
| **App-only** (default) | `use_app_auth=True` / `MSGroup(tenant)`, `MSUser(tenant)`, `MSLicense(tenant)`, `MSEducation(tenant)` | Directory, groups/Teams, user provisioning, license assignment, meeting organizer APIs (`MSMeeting(..., use_app_auth=True)`), **payment assignment CRUD and submission sync** |
| **Org service account** | `use_app_auth=False` / `MSMeeting(..., use_app_auth=False)` | Teams channel posts, password reset |
| **Per-user OAuth** | `credential=` on `MSMeeting` | Announcements posted as the creating teacher |

App-only flows do **not** require the org delegated service account to be connected. Only channel-posting and similar delegated paths need it (or per-user OAuth for announcements).

Production meeting flows use **client credentials** (`MSMeeting(..., use_app_auth=True)`) to call Graph as the registered application, including:

- `POST /users/{teacherObjectId}/events` (calendar-backed Teams meetings)
- `GET/PATCH /users/{teacherObjectId}/onlineMeetings/{meetingId}/...`
- `GET /users/{teacherObjectId}/onlineMeetings/{meetingId}/recordings`
- `POST /subscriptions` and `PATCH /subscriptions/{id}` (recording webhooks)

## Azure Portal

1. **App registration** → API permissions (application, not delegated), admin consent:
   - `OnlineMeetings.ReadWrite.All`
   - `Calendars.ReadWrite`
   - `OnlineMeetingRecording.Read.All`
   - `OnlineMeetingArtifact.Read.All`
   - `Files.ReadWrite.All` (optional: delete originals from organizer OneDrive)
   - `Files.Read.All` (payment submission screenshot download during sync)
   - `EduAssignments.ReadWrite.All` (payment assignment CRUD and submission sync)
   - `ChannelMessage.Send` / `Channel.ReadBasic.All` if posting to Teams channels with the same app token (some tenants still use delegated staffy for channel posts).

2. **Teams PowerShell** — [Application access policy](https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy) so the app may access online meetings **for the users who organize class meetings** (teachers). Scope globally or per user as required.

Without this policy, Graph returns errors when calling `/users/{teacherId}/...` with an application token.

## Local development

If application calls fail with policy-related errors, confirm tenant admin has assigned the policy and waited for propagation (can take up to ~30 minutes).

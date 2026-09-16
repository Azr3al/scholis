# Frontend Prompt: Course Group Chat

> **Deprecated.** This document describes the legacy course-only chat surface
> (`ws/chat/<course_id>/`, `courses/<course_id>/chat/...`), which has been
> removed from the backend. Use the unified thread-centric surface instead:
> `ws/chat/threads/<thread_id>/` and `chat/threads/...` (see
> [`docs/superpowers/specs/2026-07-04-unified-chat-schema-phase2-api-design.md`](superpowers/specs/2026-07-04-unified-chat-schema-phase2-api-design.md)).
> Kept for historical reference only.

Use this context when implementing the frontend for real-time course group chat.

---

## Overview

Each course has a group chat where course members (teachers and students) can communicate in real time. Only non-dropped members can join and send messages. Messages are persisted and support rich content (text, mentions) via a JSON structure.

**Stack**: WebSocket (Django Channels) for real-time send/receive; REST API for loading history.

---

## Base URL & Auth

- **Base path**: `api/v1/` (REST)
- **WebSocket path**: `ws://<host>/ws/chat/<course_id>/` (or `wss://` in production)
- **Tenant**: Include `tenant=<schema_name>` in WebSocket query string; use `X-Tenant` header for REST.
- **Auth**: JWT Bearer token. For WebSocket, pass as `token` query param.

---

## WebSocket Connection

**URL format:**
```
wss://<host>/ws/chat/<course_id>/?token=<access_token>&tenant=<schema_name>
```

| Query param | Required | Description |
|-------------|----------|-------------|
| `token`     | Yes      | JWT access token (same as `Authorization: Bearer`) |
| `tenant`    | Yes      | Organization schema name (same as `X-Tenant` for REST) |

**Example:**
```
wss://api.example.com/ws/chat/42/?token=eyJ0eXAiOiJKV1QiLCJhbGc...&tenant=myorg
```

### Connection lifecycle

1. Connect with valid JWT and tenant.
2. On successful connect, you can send messages.
3. On `message` event, append the payload to the chat UI.
4. On close, handle reconnection (e.g. exponential backoff) and token refresh if needed.

### Close codes (server-initiated)

| Code | Meaning |
|------|---------|
| 4001 | Missing or invalid `tenant` |
| 4002 | Missing or invalid `token` (unauthenticated) |
| 4003 | User is not a course member or is dropped out |

---

## Sending Messages

Send a JSON object over the WebSocket:

```json
{
  "content": {
    "text": "Hello @John!",
    "mentions": [
      { "user_id": 5, "offset": 6, "length": 5 }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | object | Yes | Message payload |
| `content.text` | string | Yes | Plain text body |
| `content.mentions` | array | No | List of `{ user_id, offset, length }` for @mentions. Extensible for future rich content. |

**Example (simple message):**
```json
{
  "content": {
    "text": "See you in class!"
  }
}
```

---

## Receiving Messages

Each message broadcast has this shape:

```json
{
  "id": 123,
  "user": {
    "id": 7,
    "email": "teacher@example.com",
    "name": "Jane Doe"
  },
  "content": {
    "text": "Hello @John!",
    "mentions": [
      { "user_id": 5, "offset": 6, "length": 5 }
    ]
  },
  "created_at": "2025-02-19T14:30:00.123456Z"
}
```

| Field | Type | Description |
|-------|------|--------------|
| `id` | number | Message ID (use for deduplication and ordering) |
| `user` | object | Sender: `id`, `email`, `name` |
| `content` | object | Same structure as sent |
| `created_at` | string | ISO 8601 timestamp; use for ordering |

**Ordering**: Sort messages by `created_at` (or `id` as tiebreaker). The server broadcasts after persisting, so `created_at` is authoritative.

---

## Error Responses (WebSocket)

The server may send JSON error objects:

| Error | Description |
|-------|--------------|
| `{"error": "invalid_payload"}` | Message body was not a valid JSON object |
| `{"error": "content_required"}` | Missing `content` field |
| `{"error": "content_must_be_object"}` | `content` must be an object, not a string |
| `{"error": "content_text_required"}` | `content.text` is required |
| `{"error": "rate_limited", "retry_after_seconds": 45}` | Too many messages; wait before retrying |

**Rate limit**: 30 messages per 60 seconds per user per course. When `rate_limited`, show a toast and disable send for `retry_after_seconds` seconds.

---

## REST API: Chat History

**Endpoint:** `GET /api/v1/courses/<course_id>/chat/messages`

**Auth:** JWT Bearer token  
**Headers:** `X-Tenant: <schema_name>` (if needed)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default 1) |
| `size` | number | Page size (default 10) |
| `sorts` | base64 JSON | Optional sort (e.g. `[["created_at","asc"]]`) |
| `fields` | base64 JSON | Optional field selection |
| `expand` | base64 JSON | Optional expand (e.g. `["user"]`) |

**Response:**
```json
{
  "isError": false,
  "message": "success",
  "data": [
    {
      "id": 120,
      "course": 42,
      "user": 7,
      "content": { "text": "Hello!", "mentions": [] },
      "created_at": "2025-02-19T14:25:00.000000Z",
      "updated_at": "2025-02-19T14:25:00.000000Z"
    }
  ],
  "links": { "next": "...", "previous": "..." },
  "count": 150,
  "count_per_page": 10,
  "total_pages": 15
}
```

**Errors:**
- `401` – Unauthenticated
- `403` – Not a course member (or dropped out)

---

## UI Flow

### 1. Load chat screen

1. Fetch history: `GET /api/v1/courses/<course_id>/chat/messages?page=1&size=50`
2. Render messages (newest at bottom or use inverted list for newest-first).
3. Connect WebSocket: `wss://.../ws/chat/<course_id>/?token=<token>&tenant=<tenant>`

### 2. Display messages

- Use `created_at` for ordering.
- Deduplicate by `id` if the same message appears from both REST and WebSocket.
- Render `content.text`; use `content.mentions` to highlight @mentions (e.g. link to user profile).

### 3. Send message

1. Build payload: `{ content: { text: "...", mentions: [...] } }`
2. Send via WebSocket: `websocket.send(JSON.stringify(payload))`
3. Optimistic UI: append a local "sending" message; replace with server message when received (match by temp id or wait for next message from current user).
4. On `rate_limited`, show error and disable send for `retry_after_seconds`.

### 4. Reconnection

- On disconnect, attempt reconnect with backoff.
- After token refresh, reconnect with new token.
- On reconnect, optionally fetch latest messages to fill any gap.

---

## Example: WebSocket usage (JavaScript)

```javascript
const courseId = 42;
const token = getAccessToken();
const tenant = getTenantSchema();

const wsUrl = `wss://api.example.com/ws/chat/${courseId}/?token=${encodeURIComponent(token)}&tenant=${encodeURIComponent(tenant)}`;
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  console.log('Chat connected');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.error) {
    if (data.error === 'rate_limited') {
      showRateLimitError(data.retry_after_seconds);
    }
    return;
  }
  appendMessage(data);
};

ws.onclose = (event) => {
  if (event.code === 4002) {
    // Token expired; refresh and reconnect
    refreshToken().then(() => reconnect());
  }
};

function sendMessage(text, mentions = []) {
  ws.send(JSON.stringify({
    content: { text, mentions }
  }));
}
```

---

## Mentions format

For future extensibility, `content.mentions` is an array of:

```json
{
  "user_id": 5,
  "offset": 6,
  "length": 5
}
```

- `user_id`: ID of the mentioned user
- `offset`: Start index of the mention in `content.text`
- `length`: Length of the mention substring

Example: `"Hello @John!"` with mention of user 5 → `{ "user_id": 5, "offset": 6, "length": 5 }`

---

## Related

- **Course**: `GET /api/v1/courses/<id>` – Course details
- **UserCourse**: Membership (teacher/student, `is_dropped_out`) determines access
- **User**: `id`, `email`, `name` for message display

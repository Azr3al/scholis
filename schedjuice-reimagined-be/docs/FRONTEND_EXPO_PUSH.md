# Expo Push Notifications – Frontend Integration

## Device Registration

**Endpoint:** `POST /api/v1/expo-token`  
**Auth:** Required (JWT Bearer token)

Register or update the current user's Expo push token. Call after login and whenever the token changes (e.g. app foreground).

### Request

```json
{
  "push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "lang": "en"
}
```

| Field       | Type   | Required | Description                          |
|------------|--------|----------|--------------------------------------|
| push_token | string | Yes      | From `expo-notifications` `getExpoPushTokenAsync()` |
| lang       | string | No       | ISO 639-1 (e.g. `en`, `en-US`)       |

**Headers:**
- `Authorization: Bearer <access_token>`
- `X-Tenant: <schema_name>` (multi-tenant; required if not inferred from origin)

### Response

**Success (200):**
```json
{
  "isError": false,
  "message": "created",
  "data": { "id": 1, "push_token": "ExponentPushToken[...]" }
}
```
`message` is `"created"` or `"updated"` depending on whether the device was new.

**Errors:**
- `400` – Invalid `push_token` (empty or wrong format)
- `404` – User not found

### Token Format

Valid formats: `ExponentPushToken[...]` or `ExpoPushToken[...]`

### When to Register

1. After successful login
2. On app foreground if token may have changed
3. After token refresh (e.g. `getExpoPushTokenAsync()` returns a new value)

### Multi-Tenant

Include `X-Tenant` header with the organization schema name when the tenant cannot be inferred from the request origin.

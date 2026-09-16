# Frontend Web Push Notifications

This document describes how to set up and use web push notifications in the Schedjuice backend.

## Overview

The backend supports sending push notifications via two channels:
1. **Expo Push Notifications** - for mobile apps
2. **Web Push Notifications** - for web browsers (using the Web Push Protocol)

Both are sent automatically when calling `enqueue_push_for_user_ids()` in `app_utils/push_helpers.py`.

## VAPID Setup

Web Push notifications require VAPID (Voluntary Application Server Identification) keys for authentication.

### Generate VAPID Keys

`pywebpush` 2.x does **not** ship `python -m pywebpush.vapid`. VAPID lives in the
**`py-vapid`** package (installed with `pip install pywebpush`). Use the **`vapid`**
CLI from your backend venv:

```bash
# From schedjuice-reimagined-be with venv activated
pip install -r requirements.txt

# Creates private_key.pem and public_key.pem in the current directory
vapid --gen

# Public key for the browser (applicationServerKey / NEXT_PUBLIC_* / WEB_PUSH_VAPID_PUBLIC_KEY)
vapid --applicationServerKey --private-key private_key.pem
```

Example output:

```text
Application Server Key = BKlbS88ongE32H2GLLGgtqPoa9jRdvnhyBFYYZnFbgUIYTSrWblP_RIadpe1tbYdvpQtM34ou3g3_5r4n0Krd7c
```

Use that base64url string (without the `Application Server Key =` prefix) for:

- Backend: `WEB_PUSH_VAPID_PUBLIC_KEY`
- Frontend: `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`

For the private key, either point `WEB_PUSH_VAPID_PRIVATE_KEY` at the PEM **file path**
or paste the full PEM contents from `private_key.pem` (including `-----BEGIN PRIVATE KEY-----` lines).

**Do not commit** `private_key.pem` / `public_key.pem`; keep them out of git.

On Windows, if `vapid` is not on PATH, use:

```powershell
.\venv\Scripts\vapid.exe --gen
.\venv\Scripts\vapid.exe --applicationServerKey --private-key private_key.pem
```

## Environment Variables

Add these environment variables to your deployment:

```bash
# VAPID keys (required for web push)
WEB_PUSH_VAPID_PUBLIC_KEY="your_vapid_public_key_here"
WEB_PUSH_VAPID_PRIVATE_KEY="your_vapid_private_key_here"
WEB_PUSH_VAPID_SUBJECT="mailto:admin@yourdomain.com"
```

- `WEB_PUSH_VAPID_PUBLIC_KEY`: The VAPID public key (starts with 'B')
- `WEB_PUSH_VAPID_PRIVATE_KEY`: The VAPID private key 
- `WEB_PUSH_VAPID_SUBJECT`: Contact email or URL for your service

## Backend Implementation

### WebPushSubscription Model

The `WebPushSubscription` model (in `app_auth.models`) stores browser push subscriptions:

```python
class WebPushSubscription(BaseModel):
    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    endpoint = models.URLField(max_length=512)
    p256dh = models.TextField()  # Public key for encryption
    auth = models.TextField()    # Authentication secret
    is_active = models.BooleanField(default=True)
    user_agent = models.TextField(blank=True, null=True)
```

### API Endpoints

- `POST /api/v1/auth/web-push-subscription/` - Subscribe to web push notifications
- `DELETE /api/v1/auth/web-push-subscription/` - Unsubscribe from web push notifications

See `app_auth/views.py` for implementation details.

### Push Helper Function

Use `enqueue_push_for_user_ids()` to send notifications:

```python
from app_utils.push_helpers import enqueue_push_for_user_ids

# Send notification to users
enqueue_push_for_user_ids(
    user_ids=[1, 2, 3],
    title="New Announcement",
    body="You have received a new announcement",
    data={
        "type": "announcement",
        "route": "/announcements/123",
        "params": {"id": 123},
        "notification_id": "456"
    }
)
```

This will:
1. Send Expo push notifications to mobile devices
2. Send web push notifications to browser subscriptions
3. Handle failed subscriptions (410 Gone) by deactivating them

## Web Push Payload Format

The payload sent to browsers follows this JSON structure:

```json
{
  "title": "Notification Title",
  "body": "Notification body text",
  "data": {
    "type": "utility|chat|announcement",
    "route": "/path/to/resource",
    "params": {"id": 123},
    "notification_id": "unique_id",
    "extra_field": "custom_value"
  }
}
```

The `data` object matches the format used by mobile push notifications for consistency.

## Error Handling

The backend handles several error scenarios:

1. **Missing VAPID Keys**: If VAPID environment variables are not set, web push notifications are silently skipped (Expo notifications still work)

2. **Missing pywebpush**: If the `pywebpush` library is not installed, web push is skipped with a warning

3. **Invalid Subscriptions**: If a push fails with HTTP 410 (Gone), the subscription is automatically deactivated

4. **Other Push Failures**: Non-410 errors are logged but don't affect the subscription status

## Local Development Testing

### 1. Set up VAPID keys in your local .env:

```bash
WEB_PUSH_VAPID_PUBLIC_KEY="BH..."
WEB_PUSH_VAPID_PRIVATE_KEY="your_private_key"
WEB_PUSH_VAPID_SUBJECT="mailto:dev@localhost"
```

### 2. Install dependencies:

```bash
pip install -r requirements.txt
```

### 3. Test with a browser subscription:

You can test web push notifications using browser developer tools:

```javascript
// In browser console, register for push notifications
navigator.serviceWorker.register('/sw.js').then(registration => {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: 'your_vapid_public_key_here'
  });
}).then(subscription => {
  // Send this subscription to your backend
  fetch('/api/v1/auth/web-push-subscription/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your_jwt_token'
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.keys.p256dh))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.keys.auth)))
      }
    })
  });
});
```

### 4. Trigger a test notification:

```python
# In Django shell or your code
from app_utils.push_helpers import enqueue_push_for_user_ids

enqueue_push_for_user_ids(
    user_ids=[your_user_id],
    title="Test Notification",
    body="This is a test web push notification",
    data={"type": "test", "route": "/"}
)
```

## Production Considerations

1. **VAPID Keys Security**: Store VAPID keys securely and never commit them to version control

2. **Rate Limiting**: Web push services have rate limits. The backend doesn't implement retry logic, so consider adding that if needed

3. **Subscription Management**: Invalid subscriptions are automatically deactivated, but you may want to periodically clean up old inactive subscriptions

4. **Monitoring**: Monitor push notification success/failure rates and subscription counts

5. **User Privacy**: Only send notifications to users who have explicitly opted in

## Troubleshooting

### Web Push Not Working

1. Check that VAPID environment variables are set correctly
2. Verify that `pywebpush` is installed (`pip list | grep pywebpush`)
3. Check Django logs for error messages
4. Ensure frontend properly subscribes with correct VAPID public key

### 410 Gone Errors

These are normal when browser subscriptions expire. The backend automatically deactivates these subscriptions.

### No Notifications Received

1. Check that the user has active web push subscriptions
2. Verify VAPID keys match between backend and frontend
3. Check browser developer tools for service worker errors
4. Ensure the browser supports push notifications and has granted permission

## Testing

Run the push helper tests:

```bash
python manage.py test app_utils.tests.test_push_helpers
```

The tests cover:
- Successful web push sending
- VAPID key validation
- 410 Gone error handling
- Missing pywebpush library handling
- Subscription filtering (active only)

## Related Files

- `app_utils/push_helpers.py` - Main push notification logic
- `app_auth/models.py` - WebPushSubscription model
- `app_auth/views.py` - Web push subscription API endpoints
- `app_utils/tests/test_push_helpers.py` - Unit tests
- `requirements.txt` - Dependencies including pywebpush
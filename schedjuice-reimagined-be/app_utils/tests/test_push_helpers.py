from __future__ import annotations

from unittest.mock import Mock, patch, MagicMock
from django.test import TestCase, override_settings

from app_utils.push_helpers import _send_web_push_for_user_ids


class PushHelpersUnitTestCase(TestCase):
    """Test push notification helpers (unit tests without database)."""

    @patch('app_utils.push_helpers.webpush')
    @patch('app_utils.push_helpers.schema_context')
    @override_settings(
        WEB_PUSH_VAPID_PRIVATE_KEY='test_private_key',
        WEB_PUSH_VAPID_PUBLIC_KEY='test_public_key',
        WEB_PUSH_VAPID_SUBJECT='mailto:test@example.com',
    )
    def test_each_subscription_gets_fresh_vapid_claims(self, mock_schema_context, mock_webpush):
        """aud must be recomputed per endpoint; shared claims break FCM after WNS."""
        wns = MagicMock()
        wns.endpoint = 'https://wns2-bl2p.notify.windows.com/w/?token=abc'
        wns.p256dh = 'wns_p256dh'
        wns.auth = 'wns_auth'
        wns.user_id = 1

        fcm = MagicMock()
        fcm.endpoint = 'https://fcm.googleapis.com/fcm/send/abc'
        fcm.p256dh = 'fcm_p256dh'
        fcm.auth = 'fcm_auth'
        fcm.user_id = 1

        mock_queryset = MagicMock()
        mock_queryset.filter.return_value.select_related.return_value = [wns, fcm]

        with patch('app_auth.models.WebPushSubscription.objects', mock_queryset):
            _send_web_push_for_user_ids(
                'test_schema',
                [1],
                'Test Title',
                'Test Body',
                {'type': 'test'},
            )

        self.assertEqual(mock_webpush.call_count, 2)
        first_claims = mock_webpush.call_args_list[0].kwargs['vapid_claims']
        second_claims = mock_webpush.call_args_list[1].kwargs['vapid_claims']
        self.assertIsNot(first_claims, second_claims)

    @patch('app_utils.push_helpers.webpush')
    @patch('app_utils.push_helpers.schema_context')
    @override_settings(
        WEB_PUSH_VAPID_PRIVATE_KEY='test_private_key',
        WEB_PUSH_VAPID_PUBLIC_KEY='test_public_key',
        WEB_PUSH_VAPID_SUBJECT='mailto:test@example.com'
    )
    def test_web_push_410_deactivates_subscription(self, mock_schema_context, mock_webpush):
        """Test that 410 Gone response deactivates subscription."""
        from pywebpush import WebPushException

        # Mock subscription
        mock_subscription = MagicMock()
        mock_subscription.endpoint = 'https://fcm.googleapis.com/fcm/send/test1'
        mock_subscription.p256dh = 'test_p256dh_key_1'
        mock_subscription.auth = 'test_auth_key_1'
        mock_subscription.user_id = 1
        mock_subscription.is_active = True

        mock_queryset = MagicMock()
        mock_queryset.filter.return_value.select_related.return_value = [mock_subscription]

        # Create WebPushException with 410 response
        mock_response = Mock()
        mock_response.status_code = 410
        exception = WebPushException("Gone")
        exception.response = mock_response
        mock_webpush.side_effect = exception

        with patch('app_auth.models.WebPushSubscription.objects', mock_queryset):
            _send_web_push_for_user_ids(
                'test_schema', 
                [1], 
                'Test Title', 
                'Test Body', 
                {'type': 'test'}
            )

            # Check that subscription was deactivated
            self.assertFalse(mock_subscription.is_active)
            mock_subscription.save.assert_called_once_with(update_fields=['is_active'])

    @patch('app_utils.push_helpers.webpush', None)  # Simulate pywebpush not available
    @patch('app_utils.push_helpers.logger')
    def test_skips_web_push_when_pywebpush_not_available(self, mock_logger):
        """Test that web push is skipped when pywebpush is not available."""
        _send_web_push_for_user_ids(
            'test_schema', 
            [1], 
            'Test Title', 
            'Test Body', 
            {'type': 'test'}
        )

        # Logger should report skipping
        mock_logger.warning.assert_called_with("pywebpush not available, skipping web push notifications")

    @patch('app_utils.push_helpers.logger')
    @override_settings(
        WEB_PUSH_VAPID_PRIVATE_KEY='',  # Empty VAPID keys
        WEB_PUSH_VAPID_PUBLIC_KEY='',
        WEB_PUSH_VAPID_SUBJECT=''
    )
    def test_skips_web_push_when_vapid_not_configured(self, mock_logger):
        """Test that web push is skipped when VAPID keys are not configured."""
        _send_web_push_for_user_ids(
            'test_schema', 
            [1], 
            'Test Title', 
            'Test Body', 
            {'type': 'test'}
        )

        # Logger should report skipping
        mock_logger.info.assert_called_with("VAPID keys not configured, skipping web push notifications")
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_organization.middlewares import XHeaderTenantMiddleware
from app_organization.tenant_resolution_cache import PUBLIC_CACHE_KEY


class _FakeDoesNotExist(Exception):
    pass


def _make_model():
    model = MagicMock()
    model.DoesNotExist = _FakeDoesNotExist
    return model


def _make_request(meta):
    request = MagicMock()
    request.META = meta
    return request


class PublicTenantFallbackTests(SimpleTestCase):
    """Header-less / origin-less requests (e.g. Telegram webhooks, in non-dev
    mode) must resolve to the public tenant via ``is_public=True`` rather than
    ``schema_name="public"`` -- the public tenant row uses ``schema_name``
    ``"xpublic"``, so a schema_name lookup raises DoesNotExist and the tenant
    middleware turns that into an Http404 before the view ever runs.
    """

    def setUp(self):
        self.middleware = XHeaderTenantMiddleware(lambda request: request)

    def _resolve(self, meta):
        model = _make_model()
        sentinel = object()
        model.objects.get.return_value = sentinel
        captured = {}

        def fake_load(model_arg, cache_key, fetch, timeout):
            captured["cache_key"] = cache_key
            return fetch()

        # config("") disables the IS_DEV / DEV_TENANT_DOMAIN overrides so the
        # request falls through to the public-tenant fallback branch.
        with patch("app_organization.middlewares.config", return_value=""), patch(
            "app_organization.middlewares.load_with_cache", side_effect=fake_load
        ):
            result = self.middleware.get_tenant(
                model, "prod-host.example.com", _make_request(meta)
            )
        return model, result, sentinel, captured

    def test_no_headers_no_origin_resolves_public_tenant(self):
        model, result, sentinel, captured = self._resolve(
            {"PATH_INFO": "/api/v1/telegram/webhook/some-key/"}
        )
        self.assertIs(result, sentinel)
        model.objects.get.assert_called_once_with(is_public=True)
        self.assertEqual(captured["cache_key"], PUBLIC_CACHE_KEY)

    def test_fallback_does_not_query_by_schema_name(self):
        model, *_ = self._resolve(
            {"PATH_INFO": "/api/v1/telegram/webhook/some-key/"}
        )
        _, kwargs = model.objects.get.call_args
        self.assertNotIn("schema_name", kwargs)


def _config_side_effect(values):
    def fake_config(key, default=None, cast=None):
        if key not in values:
            return default
        val = values[key]
        if cast is bool:
            if isinstance(val, bool):
                return val
            return str(val).strip().lower() in {"1", "true", "yes", "on"}
        return val

    return fake_config


class DevTenantDomainOverrideTests(SimpleTestCase):
    def setUp(self):
        self.middleware = XHeaderTenantMiddleware(lambda request: request)

    def _resolve_with_config(self, meta, config_values):
        model = _make_model()
        sentinel = object()
        model.objects.get.return_value = sentinel
        captured = {}

        def fake_load(model_arg, cache_key, fetch, timeout):
            captured["fetch"] = fetch
            captured["cache_key"] = cache_key
            return fetch()

        with patch(
            "app_organization.middlewares.config",
            side_effect=_config_side_effect(config_values),
        ), patch(
            "app_organization.middlewares.load_with_cache",
            side_effect=fake_load,
        ):
            result = self.middleware.get_tenant(
                model, "unused-host", _make_request(meta)
            )
        return model, result, sentinel, captured

    def test_dev_tenant_domain_pins_lookup_without_is_dev(self):
        model, result, sentinel, captured = self._resolve_with_config(
            {
                "PATH_INFO": "/api/v1/organizations/public",
                "HTTP_ORIGIN": "https://dev.schedjuice.com",
            },
            {
                "DEV_TENANT_DOMAIN": "dev.schedjuice.com",
                "IS_DEV": False,
            },
        )
        self.assertIs(result, sentinel)
        model.objects.get.assert_called_once_with(domain_url="dev.schedjuice.com")
        self.assertEqual(captured["cache_key"], "tr:dom:dev.schedjuice.com")

    def test_is_dev_without_dev_tenant_domain_uses_default(self):
        model, result, sentinel, _captured = self._resolve_with_config(
            {"PATH_INFO": "/api/v1/organizations/public"},
            {
                "DEV_TENANT_DOMAIN": "",
                "IS_DEV": True,
            },
        )
        self.assertIs(result, sentinel)
        model.objects.get.assert_called_once_with(domain_url="schedjuice.thiha.net")

    def test_dev_tenant_domain_does_not_hardcode_legacy_domain(self):
        model, result, sentinel, _captured = self._resolve_with_config(
            {"PATH_INFO": "/api/v1/organizations/public"},
            {
                "DEV_TENANT_DOMAIN": "dev.schedjuice.com",
                "IS_DEV": False,
            },
        )
        self.assertIs(result, sentinel)
        model.objects.get.assert_called_once_with(domain_url="dev.schedjuice.com")
        self.assertNotEqual(
            model.objects.get.call_args.kwargs.get("domain_url"),
            "schedjuice.thiha.net",
        )

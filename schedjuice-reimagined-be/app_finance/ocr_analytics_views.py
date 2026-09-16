from rest_framework.request import Request

from app_finance.ocr_analytics_reporting import build_ocr_analytics, parse_month_param
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


class OcrAnalyticsView(RBACView):
    """GET /management/ocr-analytics — platform OCR usage aggregates."""

    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "debug.access"}

    def get(self, request: Request):
        month = parse_month_param(request.query_params.get("month"))
        refresh = request.query_params.get("refresh") == "1"
        payload = build_ocr_analytics(month=month, refresh_vendor=refresh)
        return self.ok(payload)

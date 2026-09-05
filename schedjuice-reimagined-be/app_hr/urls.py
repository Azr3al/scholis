from django.urls import path
from app_hr import views
from app_hr.campus_checkin_views import CampusCheckinStatusView, CampusCheckinView

urlpatterns = [
    path("parse-access-log/dahua", views.DahuaAccessLogParseView.as_view(), name="parse-access-log-dahua"),
    path("payroll/trphillips", views.TrPhillipsPayrollCalculationView.as_view(), name="payroll-trphillips"),
    path("payroll/session-based", views.SessionBasedPayrollCalculationView.as_view(), name="payroll-session-based"),
    path("cash-flow/trphillips", views.CashFlowTrPhillipsView.as_view(), name="cash-flow-trphillips"),
    path(
        "cash-flow/trphillips/school-overview",
        views.SchoolOverviewTrPhillipsView.as_view(),
        name="cash-flow-trphillips-school-overview",
    ),
    path("building-checkins", views.BuildingCheckinListView.as_view(), name="building-checkin-list"),
    path("building-checkins/search", views.BuildingCheckinSearchView.as_view(), name="building-checkin-search"),
    path("campus-checkin/status", CampusCheckinStatusView.as_view(), name="campus-checkin-status"),
    path("campus-checkin", CampusCheckinView.as_view(), name="campus-checkin"),
]

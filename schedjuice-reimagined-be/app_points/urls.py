from django.urls import path

from app_points import views

urlpatterns = [
    path("point-types", views.PointTypeListView.as_view(), name="point-type-list"),
    path(
        "point-types/<int:obj_id>",
        views.PointTypeDetailView.as_view(),
        name="point-type-detail",
    ),
    path(
        "users/<int:user_id>/points",
        views.UserPointsView.as_view(),
        name="user-points",
    ),
    path(
        "users/<int:user_id>/points/transactions",
        views.UserPointTransactionCreateView.as_view(),
        name="user-point-transaction-create",
    ),
    path(
        "points/staff-sheet",
        views.StaffPointsSheetView.as_view(),
        name="staff-points-sheet",
    ),
    path(
        "points/transactions/search",
        views.PointTransactionSearchView.as_view(),
        name="point-transaction-search",
    ),
]

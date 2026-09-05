from django.urls import path

from app_rbac import api_views as v

urlpatterns = [
    path("rbac/catalog", v.CatalogView.as_view()),
    path("rbac/roles", v.RoleListCreateView.as_view()),
    path("rbac/roles/<int:role_id>", v.RoleDetailView.as_view()),
    path("rbac/roles/<int:role_id>/permissions", v.RolePermissionsView.as_view()),
]

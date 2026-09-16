from django.urls import path

from app_wiki import views

urlpatterns = [
    path("items", views.ItemListView.as_view(), name="item-list"),
    path("items/<int:obj_id>", views.ItemDetailsView.as_view(), name="item-details"),
    path(
        "items/<int:obj_id>/parents",
        views.ItemParentsView.as_view(),
        name="item-parents",
    ),
    path("items/search", views.ItemSearchView.as_view(), name="item-search"),
]

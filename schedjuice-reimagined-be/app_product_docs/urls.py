from django.urls import path

from app_product_docs import views

urlpatterns = [
    path(
        "platform/context",
        views.PlatformContextView.as_view(),
    ),
    path(
        "product-docs/categories",
        views.ProductDocsCategoryListView.as_view(),
    ),
    path(
        "product-docs/articles",
        views.ProductDocsArticleListView.as_view(),
    ),
    path(
        "product-docs/articles/<slug:slug>",
        views.ProductDocsArticleDetailView.as_view(),
    ),
    path(
        "platform/docs/categories",
        views.PlatformDocsCategoryListCreateView.as_view(),
    ),
    path(
        "platform/docs/categories/<int:pk>",
        views.PlatformDocsCategoryDetailView.as_view(),
    ),
    path(
        "platform/docs/articles",
        views.PlatformDocsArticleListCreateView.as_view(),
    ),
    path(
        "platform/docs/articles/<int:pk>",
        views.PlatformDocsArticleDetailView.as_view(),
    ),
    path(
        "platform/docs/articles/<int:pk>/publish",
        views.PlatformDocsArticlePublishView.as_view(),
    ),
    path(
        "platform/docs/articles/<int:pk>/unpublish",
        views.PlatformDocsArticleUnpublishView.as_view(),
    ),
    path(
        "platform/docs/videos",
        views.PlatformDocsVideoUploadView.as_view(),
    ),
    path(
        "platform/docs/media",
        views.PlatformDocsMediaUploadView.as_view(),
    ),
    path(
        "platform/docs/videos/<int:pk>",
        views.PlatformDocsVideoDetailView.as_view(),
    ),
]

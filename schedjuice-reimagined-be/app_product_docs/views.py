import tempfile

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import BasePermission
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_rbac.resolution import roles_for_user
from app_product_docs.models import DocArticle, DocCategory, DocStatus, DocVideo, DocVideoStatus
from app_product_docs.serializers import (
    DocArticleAdminSerializer,
    DocArticleReaderSerializer,
    DocArticleWriteSerializer,
    DocCategorySerializer,
    DocVideoSerializer,
)
from app_product_docs.services import audiences_for_user, filter_articles_for_reader, user_attribution
from app_product_docs.github_video_client import GitHubVideoClient, GitHubVideoUploadError
from app_product_docs.github_video_settings import (
    resolve_github_video_release_tag,
    resolve_github_video_repo,
    resolve_github_video_token,
)
from app_product_docs.media_upload import (
    MediaUploadValidationError,
    build_image_markdown_snippet,
    classify_upload,
)
from app_rbac.views import RBACPermission, RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

_AUTH = [TenantBoundJWTStatelessAuthentication]
_PLATFORM = [RBACPermission]


def _public_schema():
    return schema_context(get_public_schema_name())


class RequiresSuperadminRole(BasePermission):
    """Superadmin role on any tenant (no admin-tenant requirement)."""

    def has_permission(self, request, view):
        roles = roles_for_user(request.user)
        return User.UserRole.SUPERADMIN in roles


class PlatformContextView(RBACView):
    authentication_classes = _AUTH
    permission_classes = [RBACPermission, RequiresSuperadminRole]
    rbac_decision = "authenticated_only"
    http_method_names = ["get"]

    def get(self, request):
        with _public_schema():
            admin_org = Organization.objects.filter(is_admin=True).first()
        if admin_org is None:
            return self.not_found(
                details="Platform admin organization is not configured.",
            )
        return self.ok(
            {
                "admin_org": {
                    "id": admin_org.id,
                    "name": admin_org.name,
                    "domain_url": admin_org.domain_url,
                }
            }
        )


class ProductDocsCategoryListView(RBACView):
    authentication_classes = _AUTH
    rbac_decision = "authenticated_only"
    http_method_names = ["get"]

    def get(self, request):
        user_audiences = audiences_for_user(request.user)
        with _public_schema():
            visible = filter_articles_for_reader(DocArticle.objects.all(), user_audiences)
            categories = (
                DocCategory.objects.annotate(
                    article_count=Count(
                        "articles",
                        filter=Q(articles__in=visible),
                        distinct=True,
                    )
                )
                .filter(article_count__gt=0)
                .order_by("sort_order", "title")
            )
            data = DocCategorySerializer(categories, many=True).data
        return self.ok(data)


class ProductDocsArticleListView(RBACView):
    authentication_classes = _AUTH
    rbac_decision = "authenticated_only"
    http_method_names = ["get"]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        category_slug = (request.query_params.get("category") or "").strip()
        user_audiences = audiences_for_user(request.user)
        with _public_schema():
            qs = filter_articles_for_reader(
                DocArticle.objects.select_related("category"), user_audiences
            )
            if category_slug:
                qs = qs.filter(category__slug=category_slug)
            if q:
                qs = qs.filter(Q(title__icontains=q) | Q(markdown_body__icontains=q))
            qs = qs.order_by("category__sort_order", "title")
            data = DocArticleReaderSerializer(qs, many=True).data
        return self.ok(data)


class ProductDocsArticleDetailView(RBACView):
    authentication_classes = _AUTH
    rbac_decision = "authenticated_only"
    http_method_names = ["get"]

    def get(self, request, slug):
        user_audiences = audiences_for_user(request.user)
        with _public_schema():
            qs = filter_articles_for_reader(
                DocArticle.objects.select_related("category"), user_audiences
            )
            article = qs.filter(slug=slug).first()
            if not article:
                return self.not_found("Article not found.")
            data = DocArticleReaderSerializer(article).data
        return self.ok(data)


class PlatformDocsCategoryListCreateView(RBACView):
    authentication_classes = _AUTH
    permission_classes = _PLATFORM
    required_permissions = {"GET": "docs.view", "POST": "docs.manage"}
    http_method_names = ["get", "post"]

    def get(self, request):
        with _public_schema():
            categories = DocCategory.objects.order_by("sort_order", "title")
            data = DocCategorySerializer(categories, many=True).data
        return self.ok(data)

    def post(self, request):
        serializer = DocCategorySerializer(data=request.data)
        if not serializer.is_valid():
            return self.validation_error(serializer.errors)
        with _public_schema():
            category = serializer.save()
            data = DocCategorySerializer(category).data
        return self.created(data)


class PlatformDocsCategoryDetailView(RBACView):
    authentication_classes = _AUTH
    permission_classes = _PLATFORM
    required_permissions = {"PATCH": "docs.manage"}
    http_method_names = ["patch"]

    def patch(self, request, pk):
        with _public_schema():
            category = DocCategory.objects.filter(pk=pk).first()
            if not category:
                return self.not_found("Category not found.")
            serializer = DocCategorySerializer(category, data=request.data, partial=True)
            if not serializer.is_valid():
                return self.validation_error(serializer.errors)
            category = serializer.save()
            data = DocCategorySerializer(category).data
        return self.updated(data)


class PlatformDocsArticleListCreateView(RBACView):
    authentication_classes = _AUTH
    permission_classes = _PLATFORM
    required_permissions = {"GET": "docs.view", "POST": "docs.manage"}
    http_method_names = ["get", "post"]

    def get(self, request):
        with _public_schema():
            articles = DocArticle.objects.select_related("category").order_by("-updated_at")
            data = DocArticleAdminSerializer(articles, many=True).data
        return self.ok(data)

    def post(self, request):
        serializer = DocArticleWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return self.validation_error(serializer.errors)
        attr = user_attribution(request)
        with _public_schema():
            article = serializer.save(
                status=DocStatus.DRAFT,
                created_by_user_id=attr["user_id"],
                created_by_email=attr["email"],
                updated_by_user_id=attr["user_id"],
                updated_by_email=attr["email"],
            )
            data = DocArticleAdminSerializer(article).data
        return self.created(data)


class PlatformDocsArticleDetailView(RBACView):
    authentication_classes = _AUTH
    permission_classes = _PLATFORM
    required_permissions = {
        "GET": "docs.view",
        "PATCH": "docs.manage",
        "DELETE": "docs.manage",
    }
    http_method_names = ["get", "patch", "delete"]

    def get(self, request, pk):
        with _public_schema():
            article = DocArticle.objects.select_related("category").filter(pk=pk).first()
            if not article:
                return self.not_found("Article not found.")
            data = DocArticleAdminSerializer(article).data
        return self.ok(data)

    def patch(self, request, pk):
        attr = user_attribution(request)
        with _public_schema():
            article = DocArticle.objects.filter(pk=pk).first()
            if not article:
                return self.not_found("Article not found.")
            serializer = DocArticleWriteSerializer(article, data=request.data, partial=True)
            if not serializer.is_valid():
                return self.validation_error(serializer.errors)
            article = serializer.save(
                updated_by_user_id=attr["user_id"],
                updated_by_email=attr["email"],
            )
            data = DocArticleAdminSerializer(article).data
        return self.updated(data)

    def delete(self, request, pk):
        with _public_schema():
            article = DocArticle.objects.filter(pk=pk).first()
            if not article:
                return self.not_found("Article not found.")
            article.delete()
        return self.deleted()


class PlatformDocsArticlePublishView(RBACView):
    authentication_classes = _AUTH
    permission_classes = _PLATFORM
    required_permissions = {"POST": "docs.manage"}
    http_method_names = ["post"]

    def post(self, request, pk):
        with _public_schema():
            article = DocArticle.objects.filter(pk=pk).first()
            if not article:
                return self.not_found("Article not found.")
            article.status = DocStatus.PUBLISHED
            article.published_at = timezone.now()
            article.save(update_fields=["status", "published_at", "updated_at"])
            data = DocArticleAdminSerializer(article).data
        return self.updated(data)


class PlatformDocsArticleUnpublishView(RBACView):
    authentication_classes = _AUTH
    permission_classes = _PLATFORM
    required_permissions = {"POST": "docs.manage"}
    http_method_names = ["post"]

    def post(self, request, pk):
        with _public_schema():
            article = DocArticle.objects.filter(pk=pk).first()
            if not article:
                return self.not_found("Article not found.")
            article.status = DocStatus.DRAFT
            article.save(update_fields=["status", "updated_at"])
            data = DocArticleAdminSerializer(article).data
        return self.updated(data)


def _github_client_or_error():
    token = resolve_github_video_token()
    repo = resolve_github_video_repo()
    if not token or not repo:
        return None, "not_configured"
    client = GitHubVideoClient(
        token=token,
        repo=repo,
        release_tag=resolve_github_video_release_tag(),
    )
    return client, None


def _upload_file_to_github(upload, client: GitHubVideoClient) -> str:
    with tempfile.NamedTemporaryFile() as tmp:
        for chunk in upload.chunks():
            tmp.write(chunk)
        tmp.flush()
        tmp.seek(0)
        return client.upload_asset(filename=upload.name, file_obj=tmp)


class PlatformDocsMediaUploadView(RBACView):
    authentication_classes = _AUTH
    permission_classes = _PLATFORM
    required_permissions = {"POST": "docs.manage"}
    http_method_names = ["post"]

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return self.bad_request("file is required")

        try:
            media_type = classify_upload(upload)
        except MediaUploadValidationError as exc:
            return self.bad_request(str(exc))

        article_id = request.data.get("article_id") or None
        if article_id:
            try:
                article_id = int(article_id)
            except (TypeError, ValueError):
                return self.bad_request("article_id must be an integer")

        client, config_err = _github_client_or_error()
        if config_err:
            return self.send_response(
                True,
                config_err,
                {
                    "details": "Video upload not configured (GITHUB_DOCS_VIDEO_TOKEN / GITHUB_DOCS_VIDEO_REPO)."
                },
                status=503,
            )

        video_id = None
        if media_type == "video":
            attr = user_attribution(request)
            with _public_schema():
                video = DocVideo.objects.create(
                    title=upload.name,
                    status=DocVideoStatus.UPLOADING,
                    uploaded_by_user_id=attr["user_id"],
                    uploaded_by_email=attr["email"],
                    article_id=article_id,
                )
                video_id = video.pk

        try:
            asset_url = _upload_file_to_github(upload, client)
        except GitHubVideoUploadError as exc:
            if video_id is not None:
                with _public_schema():
                    video = DocVideo.objects.get(pk=video_id)
                    video.status = DocVideoStatus.FAILED
                    video.error_message = str(exc)[:2000]
                    video.save(update_fields=["status", "error_message", "updated_at"])
            return self.send_response(
                True,
                "upload_failed",
                {"details": str(exc)[:500]},
                status=502,
            )

        if media_type == "image":
            return self.created(
                {
                    "media_type": "image",
                    "url": asset_url,
                    "markdown_snippet": build_image_markdown_snippet(upload.name, asset_url),
                }
            )

        with _public_schema():
            video = DocVideo.objects.get(pk=video_id)
            video.video_url = asset_url
            video.status = DocVideoStatus.READY
            video.save()
            data = DocVideoSerializer(video).data

        payload = {
            **data,
            "media_type": "video",
            "url": data["video_url"],
        }
        return self.created(payload)


class PlatformDocsVideoUploadView(PlatformDocsMediaUploadView):
    """Backward-compatible alias for video uploads."""

    pass


class PlatformDocsVideoDetailView(RBACView):
    authentication_classes = _AUTH
    permission_classes = _PLATFORM
    required_permissions = {"GET": "docs.view"}
    http_method_names = ["get"]

    def get(self, request, pk):
        with _public_schema():
            video = DocVideo.objects.filter(pk=pk).first()
            if not video:
                return self.not_found("Video not found.")
            data = DocVideoSerializer(video).data
        return self.ok(data)

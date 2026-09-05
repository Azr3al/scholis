from rest_framework.exceptions import MethodNotAllowed, PermissionDenied

from app_attachment.models import Attachment
from app_attachment.serializers import AttachmentSerializer
from app_rbac.views import RBACDetailsView, RBACListView, RBACPermission, RBACView
from rest_framework.permissions import IsAuthenticated
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from django.conf import settings
import re

from schedjuice_backend.private_media_s3 import (
    presign_private_s3_get_url,
    resolve_existing_private_media_s3_key,
    resolve_private_media_s3_key_from_raw,
)
from schedjuice_backend.storages import PrivateMediaStorage


def _raw_http_storage_value(data) -> str | None:
    """Absolute http(s) URL if `data` is a string or FileField whose `.name` holds a full URL."""
    if isinstance(data, str):
        s = data.split("?")[0].strip()
        if s.lower().startswith("http"):
            return s
    if hasattr(data, "name") and data.name:
        s = str(data.name).split("?")[0].strip()
        if s.lower().startswith("http"):
            return s
    return None


def _infer_aws_s3_region_from_url(url: str) -> str | None:
    """Parse region from standard AWS virtual-hosted or path-style S3 URLs."""
    m = re.search(r"\.s3\.([a-z0-9-]+)\.amazonaws\.com", url, re.I)
    if m:
        return m.group(1).lower()
    m = re.search(r"(?://|^)s3\.([a-z0-9-]+)\.amazonaws\.com", url, re.I)
    if m:
        return m.group(1).lower()
    return None


def _s3_key_for_private_attachment_file_value(data) -> str | None:
    """
    Full S3 object Key for a value stored on Attachment.data (PrivateMediaStorage).

    `data` may be a FieldFile, a storage-relative path string (as in DB), or a
    serialized absolute URL to the object (pathname must match the key in bucket).
    """
    if data is None:
        return None
    storage = PrivateMediaStorage()
    if hasattr(data, "name") and data.name:
        return resolve_private_media_s3_key_from_raw(data.name, storage=storage)
    if isinstance(data, str) and data:
        return resolve_private_media_s3_key_from_raw(data, storage=storage)
    return None


def _resolve_private_attachment_s3_key(data) -> str | None:
    if data is None:
        return None
    storage = PrivateMediaStorage()
    if hasattr(data, "name") and data.name:
        return resolve_existing_private_media_s3_key(data.name, storage=storage)
    if isinstance(data, str) and data:
        return resolve_existing_private_media_s3_key(data, storage=storage)
    return None


def get_presigned_url(
    data,
    filename: str,
    file_type: str,
    *,
    expires_in: int = 3600,
):
    if not filename:
        return None

    key = _resolve_private_attachment_s3_key(data)
    if not key:
        return None

    return presign_private_s3_get_url(
        key,
        expires_in=expires_in,
        file_type=file_type,
    )


def get_quiz_attachment_presigned_url(data, filename: str, file_type: str):
    """Presigned GET for quiz inline images (private files), 24 hours."""
    return get_presigned_url(data, filename, file_type, expires_in=86400)


class AttachmentListView(RBACListView):
    model = Attachment
    serializer = AttachmentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def post(self, request):
        attachments = []
        is_public = request.data.get("is_public", "False") == "True"
        table_name = request.data.get("table_name")
        for i in range(int(request.data.get("length"))):
            if table_name == "quiz" and str(
                request.data.get(f"is_image{i}", "")
            ).lower() != "true":
                return self.send_response(
                    True,
                    "error",
                    {"errors": [{"non_field_errors": ["Quiz attachments must be images."]}]},
                )
            data = {
                "filename": request.data.get(f"name{i}"),
                "file_type": request.data.get(f"file_type{i}"),
                "is_image": request.data.get(f"is_image{i}"),
                "table_name": table_name,
                f"{table_name}": request.data.get("foreign_key"),
            }
            if is_public:
                data["public_data"] = request.data.get(f"file{i}")
            else:
                data["data"] = request.data.get(f"file{i}")

            attachments.append(AttachmentSerializer(data=data))
        valid_serializers = []
        errors = []
        for i in attachments:
            if i.is_valid():
                valid_serializers.append(i)
            else:
                errors.append(i.errors)
        if len(errors) == 0:
            saved = []
            for i in valid_serializers:
                instance = i.save()
                saved.append(
                    {
                        "id": instance.id,
                        "filename": instance.filename,
                        "is_image": instance.is_image,
                        "file_type": instance.file_type,
                        "size": instance.size,
                        "download_url": (
                            get_presigned_url(
                                instance.data,
                                instance.filename,
                                instance.file_type,
                            )
                            if instance.data
                            else (
                                instance.public_data.url
                                if instance.public_data
                                else None
                            )
                        ),
                    }
                )
            return self.send_response(False, "success", {"data": saved})
        else:
            return self.send_response(True, "error", {
                "errors": errors
            })


class AttachmentDetailsView(RBACDetailsView):
    model = Attachment
    serializer = AttachmentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def put(self, request, obj_id):
        raise MethodNotAllowed("PUT")


class AttachmentSearchView(RBACView):
    model = Attachment
    serializer = AttachmentSerializer
    required_permissions = {"POST": "storage.view"}

    def _is_scoped_attachment_search(self, request) -> bool:
        try:
            filter_params = self.get_filter_params(request)
        except Exception:
            return False
        if any(k == "quiz" or k.startswith("quiz__") for k in filter_params):
            return True
        return any(
            k == "welcome_board" or k.startswith("welcome_board__")
            for k in filter_params
        )

    def check_permissions(self, request):
        if request.method == "POST" and self._is_scoped_attachment_search(request):
            if not request.user or not request.user.is_authenticated:
                raise PermissionDenied("Authentication credentials were not provided.")
            return
        super().check_permissions(request)

    def post(self, request):
        filter_params = self.get_filter_params(request)
        presign = request.data.get("presign", "True") == "True"
        scoped_to_quiz = any(
            k == "quiz" or k.startswith("quiz__") for k in filter_params
        )
        scoped_to_welcome_board = any(
            k == "welcome_board" or k.startswith("welcome_board__")
            for k in filter_params
        )
        qs = Attachment.objects.filter(**filter_params, is_deleted=False)
        if not scoped_to_quiz and not scoped_to_welcome_board:
            qs = qs.filter(
                news_id__isnull=True,
                assignment_id__isnull=True,
                submission_id__isnull=True,
                quiz_id__isnull=True,
                welcome_board_id__isnull=True,
            )
        attachments_list = list(qs)
        total_bytes = 0
        serialized_attachments = self.serializer(attachments_list, many=True)
        serialized_data = serialized_attachments.data
        expires_in = 86400 if scoped_to_quiz else 3600
        for att, row in zip(attachments_list, serialized_data):
            if presign:
                # Use FieldFile so the S3 key includes full tenant/path (not a URL basename).
                row["data"] = (
                    get_presigned_url(
                        att.data,
                        row["filename"],
                        row["file_type"],
                        expires_in=expires_in,
                    )
                    if att.data
                    else None
                )
            total_bytes += row["size"] if row["size"] else 0
        return self.send_response(False, "success", {
            "total_bytes": total_bytes,
            "data": serialized_data
        })

from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from app_announcement.models import AnnouncementAttachment
from app_announcement.views import _require_announcement_write
from app_course.course_scoping import acting_user
from app_course.models import Course
from app_microsoft.teams_image_content import is_raster_image_filename
from app_rbac.views import RBACPermission, RBACView


class CourseAnnouncementAttachmentUploadView(RBACView):
    name = "Course announcement attachment staging upload"
    rbac_decision = "authenticated_only"
    permission_classes = [IsAuthenticated, RBACPermission]

    def post(self, request: Request, course_id: int):
        course = Course.objects.filter(pk=course_id).first()
        if course is None:
            return self.send_not_found(course_id)

        _require_announcement_write(request, course_id=course_id)

        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")

        file = request.FILES.get("file")
        if not file:
            return self.send_response(
                True,
                "bad_request",
                {"details": {"file": ["Required."]}},
                status=400,
            )

        filename = file.name or "unnamed"
        if not is_raster_image_filename(filename):
            return self.send_response(
                True,
                "bad_request",
                {"details": {"file": ["Raster images only."]}},
                status=400,
            )

        att = AnnouncementAttachment.objects.create(
            announcement=None,
            course=course,
            uploaded_by=actor,
            file=file,
            filename=filename,
        )
        raw = att.file.size or 0
        return self.send_response(
            False,
            "created",
            {
                "data": {
                    "id": att.id,
                    "url": att.file.url,
                    "filename": att.filename,
                    "byte_size": raw,
                }
            },
            status=201,
        )

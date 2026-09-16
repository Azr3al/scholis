import datetime

from django.db.models import F, Value, CharField
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from app_tools.services import detect_ai, send_email_from_user_email
from app_rbac.views import (
    RBACDetailsView,
    RBACListView,
    RBACPermission,
    RBACSearchView,
    RBACView,
)
from app_tools import models, serializers
from django.contrib.postgres.search import TrigramWordSimilarity
from app_auth.models import User
from app_course.models import Course, UserCourse
from app_tasks.models import Task
from app_auth.serializers import UserSerializer
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
import pytz


class EmailTemplateListView(RBACListView):
    model = models.EmailTemplate
    serializer = serializers.EmailTemplateSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"


class EmailTemplateDetailsView(RBACDetailsView):
    model = models.EmailTemplate
    serializer = serializers.EmailTemplateSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"


class EmailTemplateSearchView(RBACSearchView):
    model = models.EmailTemplate
    serializer = serializers.EmailTemplateSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"


class EmailTemplateSendView(RBACView):
    model = None
    serializer = None
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, obj_id: int):
        # if admin, manager, or super admin, can send email
        # if teacher, can send email if course is assigned to them
        user: User = User.objects.filter(email=request.user.id).first()
        if user.is_student():
            return self.send_response(True, "Unauthorized", {"details": "Unauthorized"}, status=403)
        if user.is_teacher():
            is_member = UserCourse.objects.filter(user=user, course__id=models.EmailTemplate.objects.get(
                id=obj_id).course_id).exists()
            if not is_member:
                return self.send_response(True, "Unauthorized", {"details": "Unauthorized"}, status=403)

        if request.query_params.get("all") and bool(request.query_params.get("all")):
            user_emails = models.UserEmail.objects.filter(email_template_id=obj_id).all()
        else:
            user_emails = models.UserEmail.objects.filter(email_template_id=obj_id, is_sent=False).all()

        tasks = []
        for i in user_emails:
            task = Task(
                name=Task.TaskName.SEND_CUSTOM_EMAIL,
                data={
                    "id": i.id
                }
            )
            tasks.append(task)
        Task.objects.bulk_create(tasks)

        return self.send_response(False, "Success", {}, status=204)


class UserEmailListView(RBACListView):
    model = models.UserEmail
    serializer = serializers.UserEmailSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"


class UserEmailDetailsView(RBACDetailsView):
    model = models.UserEmail
    serializer = serializers.UserEmailSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"


class UserEmailSearchView(RBACSearchView):
    model = models.UserEmail
    serializer = serializers.UserEmailSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"


class UserEmailBulkUpdateView(RBACView):
    model = models.UserEmail
    serializer = serializers.UserEmailSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def post(self, request: Request):
        objects = request.data.get("objects")
        if not objects:
            return self.send_response(True, "objects is required.", {"details": "objects is required."}, status=400)
        user_emails = models.UserEmail.objects.filter(
            id__in=[i["id"] for i in request.data.get("objects")]
        ).all()
        serialized_data = []
        errors = []
        for i in request.data.get("objects"):
            ue = user_emails.filter(id=i["id"]).first()
            if ue:
                s = serializers.UserEmailSerializer(i, data=i, partial=True)
                if s.is_valid():
                    serialized_data.append({"id": i["id"], **s.validated_data})
                else:
                    errors.append(s.errors)
        if errors:
            return self.send_response(True, "Bad request", {"details": errors}, status=400)
        models.UserEmail.objects.bulk_update(
            [models.UserEmail(**i) for i in serialized_data], ["html_body", "json_body", "subject"]
        )
        return self.send_response(False, "bulk-update", {"data": serialized_data})


class UserEmailSendView(RBACView):
    model = None
    serializer = None
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, obj_id: int):
        # if admin, manager, or super admin, can send email
        # if teacher, can send email if course is assigned to them
        user: User = User.objects.filter(email=request.user.id).first()

        user_email: models.UserEmail = models.UserEmail.objects.filter(id=obj_id).prefetch_related(
            "email_template__course").first()
        if not user_email:
            return self.send_response(True, "User email not found.", {"details": "User email not found."}, status=404)
        if user.is_student():
            return self.send_response(True, "Unauthorized", {"details": "Unauthorized"}, status=403)
        if user.is_teacher():
            is_member = UserCourse.objects.filter(user=user, course__id=user_email.email_template.course_id).exists()
            if not is_member:
                return self.send_response(True, "Unauthorized", {"details": "Unauthorized"}, status=403)
        send_email_from_user_email(user_email, request.tenant)
        user_email.is_sent = True
        user_email.save()
        return self.send_response(False, "Success", {}, status=204)


class FullTextSearch(RBACView):
    model = None
    serializer = None
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request: Request):
        query = request.query_params.get("q", "")
        user: User = User.objects.filter(email=request.user.id).first()
        user_courses = UserCourse.objects.filter(user__email=request.user.id)
        course_filters = {
            "id__in": [i.course_id for i in user_courses]
        }
        user_filters = {
            "id__in": [i.user_id for i in user_courses]
        }
        if user.is_admin():
            course_filters = {}
            user_filters = {}

        if not query:
            return self.send_response(False, "Query is required.", {"data": []})
        qs = (Course.objects.annotate(
            similarity=TrigramWordSimilarity(query, "title"),
            entity_type=Value("course", output_field=CharField()),
            display_name=F("title")
        ).filter(
            similarity__gt=0.5,
            **course_filters
        ).values("id", "entity_type", "display_name").order_by("-similarity").union(
            User.objects.annotate(
                similarity=TrigramWordSimilarity(query, "name"),
                entity_type=Value("user", output_field=CharField()),
                display_name=F("name")
            ).filter(
                similarity__gt=0.5,
                **user_filters
            ).values("id", "entity_type",
                     "display_name").order_by(
                "-similarity"))
             )[:10]

        return self.send_response(False, "Success", {"data": qs})


class BirthdayView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request):
        user: User = User.objects.filter(email=request.user.id).first()
        today = datetime.datetime.now(pytz.timezone("Asia/Rangoon"))
        if not user:
            return self.send_response(True, "Unauthorized", {"details": "Unauthorized"}, status=403)
        users = User.objects.active().filter(
            date_of_birth__day=today.day,
            date_of_birth__month=today.month
        ).exclude(roles__contains="{student}").all()
        serialized_data = UserSerializer(users, many=True, fields=["name"])
        return self.send_response(False, "Success", {"data": serialized_data.data})


class AIDetectorView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def post(self, request):
        text = request.data.get("text")
        if not text:
            return self.send_response(True, "text is required", {}, status=400)

        return self.send_response(False, "Success", {"data": detect_ai(text).json()})

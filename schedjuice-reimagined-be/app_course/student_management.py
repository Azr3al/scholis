from rest_framework import serializers

from app_auth.models import User
from app_course import models
from django.db.models import Q


class CourseStudentCandidateSearchSerializer(serializers.Serializer):
    query = serializers.CharField(allow_blank=True, required=False, default="")
    limit = serializers.IntegerField(required=False, default=10, min_value=1)


class CourseStudentAddSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()


def build_student_candidates_queryset(course_id: int, query: str):
    enrolled_student_user_ids = models.UserCourse.objects.filter(
        course_id=course_id,
        assigned_as=models.UserCourse.AssignedAs.STUDENT,
    ).values_list("user_id", flat=True)

    queryset = (
        User.objects.filter(roles__contains=[User.UserRole.STUDENT])
        .exclude(id__in=enrolled_student_user_ids)
        .only("id", "name", "email", "code")
    )

    if not query:
        return queryset.order_by("name")

    normalized_query = query.strip()

    return queryset.filter(
        Q(name__icontains=normalized_query) |
        Q(code__icontains=normalized_query) |
        Q(email__icontains=normalized_query) |
        Q(id__icontains=normalized_query) |
        Q(alternative_name__icontains=normalized_query)
    ).order_by(
        "name")

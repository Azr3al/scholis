from app_department import models, serializers
from app_rbac.views import RBACDetailsView, RBACListView, RBACSearchView, RBACView
from django.db import transaction
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

_READ = {"GET": "user.view_all"}
_WRITE = {
    "GET": "user.view_all",
    "POST": "org.configure",
    "PUT": "org.configure",
    "PATCH": "org.configure",
    "DELETE": "org.configure",
}


class DepartmentListView(RBACListView):
    model = models.Department
    serializer = serializers.DepartmentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {**_READ, "POST": "org.configure"}


class DepartmentDetailsView(RBACDetailsView):
    model = models.Department
    serializer = serializers.DepartmentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = _WRITE


class DepartmentSearchView(RBACSearchView):
    model = models.Department
    serializer = serializers.DepartmentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "user.view_all"}


class JobListView(RBACListView):
    model = models.Job
    serializer = serializers.JobSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {**_READ, "POST": "org.configure"}


class JobDetailsView(RBACDetailsView):
    model = models.Job
    serializer = serializers.JobSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = _WRITE


class JobSearchView(RBACSearchView):
    model = models.Job
    serializer = serializers.JobSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "user.view_all"}


class UserDepartmentListView(RBACListView):
    model = models.UserDepartment
    serializer = serializers.UserDepartmentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {**_READ, "POST": "org.configure"}


class UserDepartmentDetailsView(RBACDetailsView):
    model = models.UserDepartment
    serializer = serializers.UserDepartmentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = _WRITE


class UserDepartmentSearchView(RBACSearchView):
    model = models.UserDepartment
    serializer = serializers.UserDepartmentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "user.view_all"}


class UserDepartmentManagementView(RBACView):
    model = models.UserDepartment
    serializer = serializers.UserDepartmentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "org.configure"}

    def post(self, request):
        to_be_removed = []
        entities = []
        for i in request.data:
            if i.get("isRemoved"):
                to_be_removed.append(i)
            else:
                entities.append(i)

        for i in entities:
            if "isRemoved" in i.keys():
                del i["isRemoved"]

        with transaction.atomic():
            deleted_user_departments = models.UserDepartment.objects.filter(
                user_id__in=[i["user"] for i in to_be_removed],
                department_id__in=[i["department"] for i in to_be_removed],
            ).all()
            deleted_user_departments.delete()
            user_departments = models.UserDepartment.objects.filter(
                user_id__in=[i["user"] for i in entities],
                department_id__in=[i["department"] for i in entities],
            ).all()
            to_be_created = []
            to_be_updated = []
            for i in entities:
                if user_departments.filter(
                        user_id=i["user"], department_id=i["department"]
                ).exists():
                    m = user_departments.filter(
                        user_id=i["user"], department_id=i["department"]
                    ).first()
                    for j in i.keys():
                        if j in ["user", "department", "job"]:
                            setattr(m, f"{j}_id", i[j])
                        else:
                            setattr(m, j, i[j])
                    to_be_updated.append(m)
                else:
                    to_be_created.append(i)
            if len(to_be_updated) > 0:
                models.UserDepartment.objects.bulk_update(
                    to_be_updated, ["user", "department", "job"]
                )
            created_entities = self.get_serializer(data=to_be_created, many=True)
            errors = []

            if not created_entities.is_valid():
                errors.append(created_entities.errors)

            if len(errors) > 0:
                return self.send_response(True, "error", {"details": errors}, status=400)

            created_entities.save()
            return self.send_response(
                False, "created", {"data": created_entities.data}, status=201
            )

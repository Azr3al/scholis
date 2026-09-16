from rest_framework.exceptions import MethodNotAllowed
from rest_framework.request import Request

from app_auth.models import User
from app_course.models import UserCourse
from app_rbac.views import RBACDetailsView, RBACListView, RBACSearchView, RBACView
from app_wiki import models, serializers
from app_wiki.permissions import (
    get_item_breadcrumb_chain,
    user_can_modify_item,
    user_can_view_item,
)
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


class ItemListView(RBACListView):
    model = models.Item
    serializer = serializers.ItemSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "library.manage"}

    def get(self, request, **kwargs):
        raise MethodNotAllowed("GET")

    def post(self, request: Request):
        user: User = User.objects.filter(email=request.user.id).first()
        if user.is_student():
            return self.send_response(
                True,
                "forbidden",
                {"details": "You are not allowed to perform this action"},
                status=403,
            )
        if user.is_teacher():
            item_course = request.data.get("course", None)
            if not item_course:
                return self.send_response(
                    False,
                    "bad_request",
                    {"details": "Please provide the course ID."},
                    status=400,
                )

            is_in_course = UserCourse.objects.filter(
                user=user, course=item_course
            ).exists()
            if not is_in_course:
                return self.send_response(
                    False,
                    "forbidden",
                    {"details": "You are not allowed to perform this action"},
                    status=403,
                )

        return super().post(request)


class ItemParentsView(RBACView):
    model = models.Item
    serializers = serializers.ItemSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "library.view"}

    def get(self, request, obj_id: int):
        item = self.model.objects.filter(id=obj_id).first()
        if not item:
            return self.send_response(
                True, "not_found", {"details": "No item found with the given ID."}
            )
        user: User = User.objects.filter(email=request.user.id).first()
        if not user_can_view_item(user, item):
            return self.send_response(
                False,
                "forbidden",
                {"details": "You are not allowed to view this item."},
                status=403,
            )
        parents = get_item_breadcrumb_chain(item)
        serialized_data = self.serializers(parents, many=True)
        return self.send_response(True, "success", {"data": serialized_data.data})


class ItemDetailsView(RBACDetailsView):
    model = models.Item
    serializer = serializers.ItemSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "library.view",
        "PUT": "library.manage",
        "PATCH": "library.manage",
        "DELETE": "library.manage",
    }

    def get(self, request, obj_id: int):
        item = self.model.objects.filter(id=obj_id).first()
        if not item:
            return self.send_response(
                True, "not_found", {"details": "No item found with the given ID."}
            )
        user: User = User.objects.filter(email=request.user.id).first()
        if not user_can_view_item(user, item):
            return self.send_response(
                False,
                "forbidden",
                {"details": "You are not allowed to view this item."},
                status=403,
            )
        serialized_data = self.serializer(item)
        return self.send_response(True, "success", {"data": serialized_data.data})

    def put(self, request: Request, obj_id: int):
        item = self.model.objects.filter(id=obj_id).first()
        if not item:
            return self.send_response(
                True, "not_found", {"details": "No item found with the given ID."}
            )
        user: User = User.objects.filter(email=request.user.id).first()

        if not user_can_modify_item(user, item):
            return self.send_response(
                False,
                "forbidden",
                {"details": "You are not allowed to update this item."},
                status=403,
            )
        return super().put(request, obj_id)

    def delete(self, request: Request, obj_id: int):
        item = self.model.objects.filter(id=obj_id).first()
        if not item:
            return self.send_response(
                True, "not_found", {"details": "No item found with the given ID."}
            )
        user: User = User.objects.filter(email=request.user.id).first()

        if not user_can_modify_item(user, item):
            return self.send_response(
                False,
                "forbidden",
                {"details": "You are not allowed to delete this item."},
                status=403,
            )
        return super().delete(request, obj_id)


class ItemSearchView(RBACSearchView):
    model = models.Item
    serializer = serializers.ItemSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "library.view"}

    def post(self, request: Request, filter_ids=None):
        user = User.objects.filter(email=request.user.id).first()
        scoped_filter_ids = None
        if not user.is_admin():
            user_courses = UserCourse.objects.filter(user=user).all()
            scoped_filter_ids = [
                i.id
                for i in models.Item.objects.filter(
                    course__in=[uc.course for uc in user_courses]
                ).all()
            ]
        return super().post(request, filter_ids=scoped_filter_ids)

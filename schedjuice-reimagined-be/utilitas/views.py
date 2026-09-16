from __future__ import annotations

import base64
import csv
import json

from django.core.exceptions import BadRequest, FieldDoesNotExist
from django.db.models import BooleanField, QuerySet
from django.db.models.base import ModelBase
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BrowsableAPIRenderer
from rest_framework.views import APIView, Request, Response, status
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from django.db.models import Q
from utilitas.metadata import CustomMetadata
from utilitas.models import BaseModel
from utilitas.pagination import CustomPagination
from utilitas.renderer import CustomRenderer
from utilitas.serializers import (
    BaseModelSerializer,
    BaseSerializer,
    FilterParamSerializer,
)


def _truthy_filter_value(value) -> bool:
    return str(value).strip().lower() in ("true", "1", "yes")


def _parse_array_literal(value) -> list[str]:
    """Parse FE `listToApiArray` shape e.g. `{student}` or `{admin,manager}`."""
    s = str(value).strip()
    if s.startswith("{") and s.endswith("}"):
        s = s[1:-1]
    if not s:
        return []
    return [p.strip() for p in s.split(",") if p.strip()]


def _coerce_array_filter_value(operator: str, value):
    if operator in ("contained_by", "contains", "overlap"):
        return _parse_array_literal(value)
    return value


def filter_prefetch_lookups(model, lookups):
    """Keep only ORM relation paths valid for prefetch_related (drops SerializerMethodField names)."""
    valid = []
    for lookup in lookups:
        parts = str(lookup).split("__")
        current = model
        ok = True
        for idx, part in enumerate(parts):
            try:
                field = current._meta.get_field(part)
            except FieldDoesNotExist:
                ok = False
                break
            if idx == len(parts) - 1:
                if not field.is_relation:
                    ok = False
                break
            if not field.is_relation:
                ok = False
                break
            current = field.remote_field.model
        if ok:
            valid.append(lookup)
    return valid


def split_expand_for_orm(model, lookups):
    """Return (select_related_paths, prefetch_related_paths).

    A path uses select_related only when every segment is a forward FK or OneToOne.
    Reverse relations and M2M stay on prefetch_related.
    """
    if not lookups:
        return [], []

    select_related = []
    prefetch_related = []
    for lookup in lookups:
        parts = str(lookup).split("__")
        current_model = model
        is_forward_fk_chain = True
        for idx, part in enumerate(parts):
            try:
                field = current_model._meta.get_field(part)
            except FieldDoesNotExist:
                is_forward_fk_chain = False
                break
            if field.many_to_many or (field.is_relation and field.auto_created):
                is_forward_fk_chain = False
                break
            if not (field.many_to_one or field.one_to_one):
                is_forward_fk_chain = False
                break
            if idx == len(parts) - 1 and not field.is_relation:
                is_forward_fk_chain = False
                break
            if field.is_relation:
                current_model = field.remote_field.model
        if is_forward_fk_chain:
            select_related.append(lookup)
        else:
            prefetch_related.append(lookup)
    return select_related, prefetch_related


def apply_expand_lookups(queryset, model, lookups):
    select_related, prefetch_related = split_expand_for_orm(model, lookups)
    if select_related:
        queryset = queryset.select_related(*select_related)
    if prefetch_related:
        queryset = queryset.prefetch_related(*prefetch_related)
    return queryset


def get_prefetchable_fields(instance):
    opts = instance._meta
    ret = []
    for field in opts.get_fields():
        if not isinstance(instance, ModelBase):
            rel_obj_descriptor = getattr(instance.__class__, field.name, None)
        else:
            rel_obj_descriptor = getattr(instance, field.name, None)
        if rel_obj_descriptor:
            if hasattr(rel_obj_descriptor, "get_prefetch_queryset"):
                ret.append(field.name)
            else:
                rel_obj = getattr(instance, field.name)
                if hasattr(rel_obj, "get_prefetch_queryset"):
                    ret.append(field.name)
    return ret


class BaseView(APIView, CustomPagination):
    name: str = "Base view (not cringe view)"
    description: str = ""

    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated]
    model: BaseModel = None
    serializer: BaseSerializer = None

    # query_params' names
    fields_param = "fields"
    sorts_param = "sorts"
    expand_param = "expand"
    # customizing the response format
    renderer_classes = [CustomRenderer, BrowsableAPIRenderer]

    # Some `expand` parameters cannot be present in the model's foreign keys (client's mistakes).
    # To avoid being a chatty API, we will just quietly ignore thier mistakes.
    def translate_expand_params(self, expand):
        translated_expand = []
        # Replacing dots with Django ORM's format.
        for i in expand:
            translated_expand.append(str(i).replace(".", "__"))
        if self.model is not None:
            translated_expand = filter_prefetch_lookups(self.model, translated_expand)
        return set(translated_expand)

    def validate_body_params(self, to_be_validated, request: Request | None = None):
        req = request if request is not None else getattr(self, "request", None)
        validated_data = []
        for i in to_be_validated:
            x = FilterParamSerializer(
                data=i, context={"model": self.model, "request": req}
            )
            if not x.is_valid(raise_exception=True):
                raise BadRequest(x.errors)
            validated_data.append(x.data)

        return validated_data

    @staticmethod
    def _resolve_filter_field(model, field_name):
        current_model = model
        field = None
        for part in field_name.split("__"):
            field = current_model._meta.get_field(part)
            if field.is_relation:
                current_model = field.remote_field.model
        return field

    @staticmethod
    def _coerce_typed_filter_value(model, field_name, operator, value):
        if operator == "isnull":
            return _truthy_filter_value(value)
        if operator not in ("exact", "iexact"):
            return value
        try:
            field = BaseView._resolve_filter_field(model, field_name)
        except FieldDoesNotExist:
            return value
        if isinstance(field, BooleanField):
            return _truthy_filter_value(value)
        return value

    @staticmethod
    def build_body_params(body_params, model=None):
        params_dict = {}
        for i in body_params:
            if i["operator"] == "in":
                params_dict[i["field_name"] + "__" + i["operator"]] = i["value"].split(
                    ","
                )
            elif i["operator"] == "isnull":
                params_dict[i["field_name"] + "__" + i["operator"]] = (
                    _truthy_filter_value(i["value"])
                )
            else:
                val = _coerce_array_filter_value(i["operator"], i["value"])
                if model is not None:
                    val = BaseView._coerce_typed_filter_value(
                        model, i["field_name"], i["operator"], val
                    )
                params_dict[i["field_name"] + "__" + i["operator"]] = val

        return params_dict

    # validating with FilterParamSerializer to make sure the filter_params object is of the right format
    def get_filter_params(self, request: Request):
        filter_params = request.data.get("filter_params", [])
        new_filter_params = []
        for i in filter_params:
            if "|" not in i["field_name"]:
                new_filter_params.append(i)
        validated_filter_params = self.validate_body_params(
            new_filter_params, request
        )

        return self.build_body_params(validated_filter_params, model=self.model)

    def get_chained_filter_params(self, request: Request):
        filter_params = request.data.get("filter_params", [])
        new_filter_params = []
        for i in filter_params:
            if "|" in i["field_name"]:
                new_filter_params.append(i)
        validated_filter_params = self.validate_body_params(
            new_filter_params, request
        )
        q_objects = []
        for i in validated_filter_params:
            field_names = i["field_name"].split("|")
            op = i["operator"]
            value = i["value"]
            q_chain = Q()
            # chain the filter params with the or operator
            for f in field_names:
                q_object = None
                if op == "in":
                    q_object = Q(**{f"{f}__{op}": value.split(",")})
                elif op == "isnull":
                    q_object = Q(**{f"{f}__{op}": _truthy_filter_value(value)})
                else:
                    coerced = _coerce_array_filter_value(op, value)
                    if self.model is not None:
                        coerced = self._coerce_typed_filter_value(
                            self.model, f, op, coerced
                        )
                    q_object = Q(**{f"{f}__{op}": coerced})
                q_chain = q_chain | q_object
            q_objects.append(q_chain)
        return q_objects

    # building a filter_params dict to be used in querying
    @staticmethod
    def build_filter_params(filter_params):
        filter_dict = {}
        for i in filter_params:
            key = i["field_name"] + "__" + i["operator"]
            if i["operator"] == "in":
                filter_dict[key] = i["value"].split(",")
            elif i["operator"] in ("contained_by", "contains", "overlap"):
                filter_dict[key] = _parse_array_literal(i["value"])
            else:
                filter_dict[key] = i["value"]

        return filter_dict

    # get exclude_params from the request
    def get_exclude_params(self, request: Request):
        exclude_params = request.data.get("exclude_params", {})
        validated_exclude_params = self.validate_body_params(exclude_params, request)
        return self.build_body_params(validated_exclude_params, model=self.model)

    @classmethod
    def _validate_attributes(cls, **kwargs):
        for i in [
            {"var": "model", "parent_class": BaseModel},
            {
                "var": "serializer",
                "parent_class": (BaseSerializer, BaseModelSerializer),
            },
        ]:
            # making sure certain class variables are implemented.
            if not getattr(cls, i["var"]):
                raise NotImplementedError(
                    f"{cls} must implement the '{i['var']}' variable."
                )

            # making sure the implemented variables are of the right class.
            if not (
                    hasattr(getattr(cls, i["var"]), "__dict__")
                    and issubclass(getattr(cls, i["var"]), i["parent_class"])
            ):
                raise TypeError(
                    f"'{i['var']}' in {cls} must be a subclass {i['parent_class']} instead of a {type(getattr(cls, i['var']))}"
                )
        for i in ["sorts_param", "fields_param", "expand_param"]:
            if type(getattr(cls, i)) != str:
                raise TypeError(f"Variable '{i}' in {cls} must be a string.")

        return None

    # getting query_params
    def get_query_params(self, request: Request):
        dic = {}

        dic["sorts"] = self.get_sort_param(request)
        dic["expand"] = self.get_expand_param(request)
        dic["fields"] = self.get_fields_param(request)
        return dic

    # sending metadata
    def send_metadata(self, request: Request):
        if not hasattr(self, "metadata_class"):
            return self.get(request)
        data = self.metadata_class().determine_metadata(request, self)

        return self.send_response(
            False, "metadata", {"data": data}, status=status.HTTP_200_OK
        )

        # sending a csv file as response

    def send_csv(self, request: Request, data: QuerySet, fields):
        response = HttpResponse(
            content_type="text/csv",
            headers={"Content-Disposition": "attachment; filename='data.csv'"},
        )

        if len(fields) == 0:
            fields = data.model.get_fields(data.model)

        writer = csv.writer(response)
        writer.writerow(data.model.get_user_friendly_fields(data.model, fields))
        for i in data:
            lst = []
            for j in fields:
                attr = i
                for sub_field in j.split("__"):
                    attr = getattr(attr, sub_field)
                lst.append(attr)
            writer.writerow(lst)
        return response

    def prepare_queryset(
            self,
            request: Request,
            filter_params=None,
            exclude_params=None,
            fields=None,
            sorts=None,
            expand=None,
    ):
        if filter_params is None:
            filter_params = {}

        if exclude_params is None:
            exclude_params = {}

        if fields is None:
            fields = []

        if expand is None:
            expand = []
        # query from the database

        translated_expand = self.translate_expand_params(expand)

        queryset = (
            self.model.objects.filter(**filter_params)
            .exclude(**exclude_params)
        )
        queryset = apply_expand_lookups(queryset, self.model, translated_expand)
        return queryset.all().order_by(*sorts)

    # querying data
    def get_queryset(
            self,
            request: Request,
            filter_params=None,
            exclude_params=None,
            is_csv=False,
            fields=None,
            sorts=None,
            expand=None,
            filter_ids=None,
            chained_filter_params=None,
    ):
        if filter_params is None:
            filter_params = {}

        if self.model is not None and self.model.__name__ == "User":
            from app_auth.user_query_helpers import merge_default_user_active_filter

            filter_params = merge_default_user_active_filter(request, filter_params)

        if exclude_params is None:
            exclude_params = {}

        if fields is None:
            fields = []

        if expand is None:
            expand = []
        if chained_filter_params is None:
            chained_filter_params = []
        if not is_csv:
            # query from the database

            translated_expand = self.translate_expand_params(expand)
            if filter_ids is not None:
                queryset = (
                    self.model.objects.filter(**filter_params)
                    .filter(*chained_filter_params)
                    .filter(id__in=filter_ids)
                    .exclude(**exclude_params)
                )
            else:
                queryset = (
                    self.model.objects.filter(**filter_params)
                    .filter(*chained_filter_params)
                    .exclude(**exclude_params)
                )
            queryset = apply_expand_lookups(
                queryset, self.model, translated_expand
            ).order_by(*sorts)

            queryset = self.augment_search_queryset(queryset, expand, is_csv)

            # paginate the queryset
            paginated_data = self.paginate_queryset(queryset, request)

            # serialize the paginated data
            serialized_data = self.get_serializer(
                paginated_data,
                many=True,
                fields=fields,
                expand=expand,
                context={"model": self.model},
            )

            return serialized_data
        else:
            if filter_ids:
                queryset = (
                    self.model.objects.filter(**filter_params)
                    .filter(id__in=filter_ids)
                    .exclude(**exclude_params)
                    .all()
                )
            else:
                queryset = (
                    self.model.objects.filter(**filter_params)
                    .exclude(**exclude_params)
                    .all()
                )
            return self.augment_search_queryset(queryset, expand, is_csv)

    # make sure the fields are actually present in the model
    def fields_are_valid(self, fields: list) -> bool:
        return set(fields).issubset(self.model.get_filterable_fields(self.model))

    # get the "field" parameter form the request's body
    def get_fields_param(self, request: Request):
        fields = request.query_params.get(self.fields_param, [])
        if fields:
            fields = self.decode_query_param(fields, self.fields_param)
        return fields

    # get the "sort" query param
    def get_sort_param(self, request: Request):
        sorts = request.query_params.get(
            self.sorts_param, []
        )  # get base64 encoded string
        if sorts:
            sorts = self.decode_query_param(
                sorts, self.sorts_param
            )  # decode base64 string

        return sorts

    # get the "expand" parameter from the request's body
    def get_expand_param(self, request: Request):
        expand = request.query_params.get(self.expand_param, [])
        if expand:
            expand = self.decode_query_param(expand, self.expand_param)

        return expand

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        original_context = kwargs.get("context", {})
        kwargs["context"] = {**self.get_serializer_context(), **original_context}
        return serializer_class(*args, **kwargs)

    def get_serializer_class(self):
        return self.serializer

    def get_serializer_context(self):
        return {
            "request": self.request,
            "format": self.format_kwarg,
            "view": self,
        }

    def augment_search_queryset(self, queryset: QuerySet, expand: list, is_csv: bool) -> QuerySet:
        """Override in subclasses to add prefetch/select_related for search (e.g. avoid N+1)."""
        return queryset

    @staticmethod
    def send_response(is_error: bool, message: str, payload, **kwargs) -> Response:
        return Response({"isError": is_error, "message": message, **payload}, **kwargs)

    def ok(self, data=None, *, message="success", **payload):
        body = {"data": data, **payload} if data is not None else dict(payload)
        return self.send_response(False, message, body, status=status.HTTP_200_OK)

    def created(self, data=None, *, message="created", **payload):
        body = {"data": data, **payload} if data is not None else dict(payload)
        return self.send_response(False, message, body, status=status.HTTP_201_CREATED)

    def updated(self, data=None, *, message="updated", **payload):
        body = {"data": data, **payload} if data is not None else dict(payload)
        return self.send_response(False, message, body, status=status.HTTP_200_OK)

    def deleted(self, data=None, *, message="deleted", **payload):
        body = {"data": data, **payload} if data is not None else dict(payload)
        return self.send_response(False, message, body, status=status.HTTP_200_OK)

    def bad_request(self, details=None, *, message="bad_request"):
        return self.send_response(
            True, message, {"details": details}, status=status.HTTP_400_BAD_REQUEST
        )

    def validation_error(self, errors, *, message="validation_error"):
        return self.send_response(
            True, message, {"details": errors}, status=status.HTTP_400_BAD_REQUEST
        )

    def not_found(self, details=None, *, message="not_found"):
        return self.send_response(
            True, message, {"details": details}, status=status.HTTP_404_NOT_FOUND
        )

    def forbidden(self, details="Forbidden", *, message="forbidden"):
        return self.send_response(
            True, message, {"details": details}, status=status.HTTP_403_FORBIDDEN
        )

    def unauthorized(self, details="Unauthorized", *, message="unauthorized"):
        return self.send_response(
            True, message, {"details": details}, status=status.HTTP_401_UNAUTHORIZED
        )

    @staticmethod
    def decode_query_param(url_string: str, param_name: str):
        try:
            param = json.loads(
                base64.urlsafe_b64decode(url_string + "=" * (4 - len(url_string) % 4))
            )
        except Exception as e:
            raise BadRequest(f"Error decoding {param_name}: " + str(e))

        return param


class BaseListView(BaseView):
    name = "Base list view"
    metadata_class = CustomMetadata

    def __init_subclass__(cls, **kwargs):
        cls._validate_attributes(**kwargs)
        return super().__init_subclass__(**kwargs)

    def get(self, request: Request, filter_ids=None):
        self.description = self.model.__doc__

        # if meta query_param is present, return metadata of the current endpoint
        if request.GET.get("meta"):
            return self.send_metadata(request)

        try:
            query_params = self.get_query_params(request)
        except BadRequest as e:
            return self.bad_request(str(e))
        if request.query_params.get("csv") and request.query_params.get("csv") == True:
            return self.send_csv(
                request,
                self.get_queryset(
                    request, None, None, True, **query_params, filter_ids=filter_ids
                ),
                fields=query_params["fields"],
            )

        serialized_data = self.get_queryset(
            request, **query_params, filter_ids=filter_ids
        )

        # return the serialized queryset in a standardized manner
        return self.ok(serialized_data.data, message="success", **self.get_paginated_response())

    # create
    def post(self, request: Request):
        if request.query_params.get("bulk", None):
            objs = request.data.get("objects", None)

            if objs is None:
                return self.send_response(
                    True, "Missing 'objects' parameter in request body.", {}
                )
            serialized_data = self.get_serializer(
                data=request.data["objects"], many=True
            )

            if serialized_data.is_valid():
                serialized_data.save()
                return self.send_response(
                    False,
                    "bulk-created",
                    {"data": serialized_data.data},
                    status=status.HTTP_201_CREATED,
                )

            return self.send_response(
                True,
                "creation failed because of some errors. 0 objects were created.",
                {"details": serialized_data.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serialized_data = self.get_serializer(
            data=request.data,
        )
        if serialized_data.is_valid():
            serialized_data.save()
            return self.created(serialized_data.data)

        return self.bad_request(serialized_data.errors)


class BaseDetailsView(BaseView):
    _is_internal = True
    name = "Base details view"
    metadata_class = CustomMetadata

    def __init_subclass__(cls, **kwargs):
        cls._validate_attributes(**kwargs)
        return super().__init_subclass__(**kwargs)

    def send_not_found(self, obj_id: int):
        return self.not_found(f"{self.model} with id {obj_id} does not exist.")

    def get_object(self, obj_id: int, prefetch_fields=None):
        if prefetch_fields is None:
            prefetch_fields = []
        queryset = self.model.objects.filter(pk=obj_id)
        queryset = apply_expand_lookups(queryset, self.model, prefetch_fields)
        return queryset.first()

    # get-one
    def get(self, request: Request, obj_id: int):
        self.description = self.model.__doc__

        query_params = self.get_query_params(request)
        query_params.pop("sorts")

        obj = self.get_object(obj_id, self.translate_expand_params(query_params.get("expand", [])))
        if obj is None:
            return self.send_not_found(obj_id)
        serialized_data = self.get_serializer(obj, **query_params)
        return self.ok(serialized_data.data)

    # update
    def put(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        serialized_data = self.get_serializer(obj, data=request.data, partial=True)
        serialized_data.is_valid(raise_exception=True)
        serialized_data.save()
        return self.updated(serialized_data.data)

    def delete(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        serialized_data = self.get_serializer(obj)
        # Evaluate `.data` before delete(): after delete() the instance may have no pk and
        # serializers touching reverse relations (e.g. covered_months) will raise.
        response_payload = serialized_data.data
        obj.delete()
        return self.deleted(response_payload)


class BaseSearchView(BaseView):
    _is_internal = True
    name = "Base search view"

    def __init_subclass__(cls, **kwargs):
        cls._validate_attributes(**kwargs)
        return super().__init_subclass__(**kwargs)

    # search
    def post(self, request: Request, filter_ids=None):
        filter_params = {}
        try:
            query_params = self.get_query_params(request)
            filter_params = self.get_filter_params(request)
            exclude_params = self.get_exclude_params(request)
            chained_filter_params = self.get_chained_filter_params(request)
        except BadRequest as e:
            return self.bad_request(str(e))

        if (
                request.query_params.get("csv")
                and request.query_params.get("csv") == "true"
        ):
            return self.send_csv(
                request,
                self.get_queryset(
                    request,
                    filter_params,
                    exclude_params,
                    True,
                    **query_params,
                    filter_ids=filter_ids,
                    chained_filter_params=chained_filter_params,
                ),
                fields=query_params["fields"],
            )

        serialized_data = self.get_queryset(
            request,
            filter_params,
            exclude_params,
            **query_params,
            filter_ids=filter_ids,
            chained_filter_params=chained_filter_params,
        )

        # return the serialized queryset in a standardized manner
        return self.ok(serialized_data.data, message="success", **self.get_paginated_response())

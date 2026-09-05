import csv
import json

from django.core.management import BaseCommand, CommandError
from tenant_schemas.utils import schema_context

from app_auth import views as auth_views
from app_auth.serializers import UserSerializer
from app_course import views as course_views
from app_course.serializers import (
    CategorySerializer,
    CourseSerializer,
    EventSerializer,
    UserCourseSerializer,
)


def format_user(obj_dict):
    obj_dict["roles"] = json.loads(obj_dict["roles"])
    obj_dict["phone_number"] = "09222"
    obj_dict["date_of_birth"] = "2000-01-01"
    obj_dict["gender"] = "MALE"
    obj_dict["communication_email"] = "placeholder@placeholder.com"
    obj_dict["house_number"] = "placeholder"
    obj_dict["street"] = "placeholder"
    obj_dict["township"] = "placeholder"
    obj_dict["city"] = "placeholder"
    obj_dict["region"] = "placeholder"
    obj_dict["country"] = "placeholder"

    return obj_dict


def format_course(course_dict):
    from app_course.program_helpers import create_default_general_program, get_default_program

    course_dict["start_date"] = "2020-12-12"
    course_dict["end_date"] = "2021-12-12"
    course_dict["category"] = 1
    program = get_default_program() or create_default_general_program()
    course_dict["program"] = program.id

    return course_dict


def format_event(event_dict):
    event_dict["title"] = f"event #{event_dict['id']}"
    event_dict["time_from"] = "11:00"
    event_dict["time_to"] = "13:00"
    return event_dict


def format_usercourse(obj_dict):
    obj_dict["assigned_as"] = 1
    return obj_dict


class Command(BaseCommand):
    def add_arguments(self, parser):
        parser.add_argument("--schema", action="store", help="")

    # register your dummy data here
    serializer_list = [
        {
            "serializer": CategorySerializer,
            "file_path": "categories.csv",
            "formatter": None,
            "view": course_views.CategoryListView,
        },
        {
            "serializer": UserSerializer,
            "file_path": "users.csv",
            "formatter": format_user,
            "view": auth_views.UserListView,
        },
        {
            "serializer": CourseSerializer,
            "file_path": "courses.csv",
            "formatter": format_course,
            "view": course_views.CourseListView,
        },
        {
            "serializer": EventSerializer,
            "file_path": "events.csv",
            "formatter": format_event,
            "view": course_views.EventListView,
        },
        {
            "serializer": UserCourseSerializer,
            "file_path": "usercourses.csv",
            "formatter": format_usercourse,
            "view": course_views.UserCourseListView,
        },
    ]

    def load_data(self, serializer, file_path: str, formatter, schema, view=None):
        """
        :param formatter: Preprocess the csv row before creating a database model.
        You can add new columns, add default data, etc. with this function.
        """
        f = csv.DictReader(
            open(f"./app_data/dummydata/{schema}/{file_path}", "r"), delimiter=","
        )
        f = [i for i in f]
        self.stdout.write(f"Creating data using {serializer.__name__}: ", ending="")
        if serializer.__name__ == "CourseSerializer":
            from app_course.program_helpers import create_default_general_program, get_default_program

            get_default_program() or create_default_general_program()
        for i in f:
            if formatter is not None:
                i = formatter(i)
            print(i)
        x = serializer(data=f, many=True, context={"view": view, "request": None})
        if x.is_valid():
            x.save()

        else:
            raise CommandError(f"Validation error, check your dummy data. {x.errors}")
        self.stdout.write(f"Complete.", ending="\n\n")

    def handle(self, *args, **options):
        schema = options.get("schema", "public")
        with schema_context(schema):
            from app_auth.models import User

            if User.objects.exists():
                return

        with schema_context(schema):
            for i in self.serializer_list:
                self.load_data(
                    i["serializer"],
                    i["file_path"],
                    i["formatter"],
                    options.get("schema", "public"),
                    i["view"],
                )

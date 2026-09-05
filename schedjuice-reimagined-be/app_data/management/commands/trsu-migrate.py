import csv

from django.core.management import BaseCommand
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, UserCourse


class Command(BaseCommand):
    def handle(self, *args, **options):
        with schema_context("xteachersu"):
            reader = csv.DictReader(
                open("./app_data/migration_data/xteachersu/staff.csv", "r"),
                delimiter=",",
            )
            lst = []
            for i in reader:
                user = User(
                    id=i["id"],
                    email=i["email"],
                    name=i["dname"],
                    alternative_name=i["ename"],
                    description=i["description"],
                    date_of_birth=i["dob"],
                    gender=i["gender"],
                    phone_number=i["ph_num"],
                    microsoft_id=i["ms_id"],
                    roles="{teacher}",
                    house_number=i["house_num"],
                    street=i["street"],
                    township=i["township"],
                    city=i["city"],
                    region=i["region"],
                    country=i["country"],
                    communication_email=i["gmail"],
                )
                lst.append(user)

            reader = csv.DictReader(
                open("./app_data/migration_data/xteachersu/student.csv", "r"),
                delimiter=",",
            )

            for i in reader:
                user = User(
                    id=int(i["id"]) + 1000,
                    email=i["email"],
                    microsoft_id=i["ms_id"],
                    name=i["dname"],
                    alternative_name=i["ename"],
                    description=i["description"],
                    date_of_birth=i["dob"],
                    phone_number=i["ph_num"],
                    roles="{student}",
                    house_number=i["house_num"],
                    street=i["street"],
                    township=i["township"],
                    city=i["city"],
                    region=i["region"],
                    country=i["country"],
                    communication_email=i["gmail"],
                )
                lst.append(user)
            User.objects.bulk_create(lst)
            lst = []
            reader = csv.DictReader(
                open("./app_data/migration_data/xteachersu/category.csv", "r"),
                delimiter=",",
            )
            for i in reader:
                category = Category(
                    id=i["id"], name=i["name"], description=i["description"]
                )
                lst.append(category)
            Category.objects.bulk_create(lst)
            lst = []
            reader = csv.DictReader(
                open("./app_data/migration_data/xteachersu/work.csv", "r"),
                delimiter=",",
            )
            for i in reader:
                course = Course(
                    id=i["id"],
                    title=i["name"],
                    description=i["description"],
                    start_date=i["valid_from"],
                    end_date=i["valid_to"],
                    microsoft_group_id=i["ms_id"],
                    microsoft_channel_id=i["channel_id"],
                    category_id=i["category_id"],
                )
                lst.append(course)
            Course.objects.bulk_create(lst)
            lst = []
            reader = csv.DictReader(
                open("./app_data/migration_data/xteachersu/staffwork.csv", "r"),
                delimiter=",",
            )
            for i in reader:
                usercourse = UserCourse(
                    user_id=i["staff_id"], course_id=i["work_id"], assigned_as="teacher"
                )
                lst.append(usercourse)

            reader = csv.DictReader(
                open("./app_data/migration_data/xteachersu/studentwork.csv", "r"),
                delimiter=",",
            )
            for i in reader:
                usercourse = UserCourse(
                    user_id=int(i["student_id"]) + 1000,
                    course_id=i["work_id"],
                    assigned_as="student",
                )
                lst.append(usercourse)
            UserCourse.objects.bulk_create(lst)
            lst = []

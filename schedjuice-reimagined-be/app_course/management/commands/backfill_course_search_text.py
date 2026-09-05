"""Backfill Course.search_text for all tenant schemas (run after FTS migrations)."""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course
from app_course.search_signals import compute_course_search_text
from app_organization.models import Organization


class Command(BaseCommand):
    help = "Populate Course.search_text across tenant schemas for FTS."

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            type=str,
            help="Single tenant schema_name to backfill (default: all non-public tenants).",
        )
        parser.add_argument(
            "--bulk",
            action="store_true",
            help="Use a single SQL UPDATE per schema (faster on large tables).",
        )
        parser.add_argument(
            "--chunk-size",
            type=int,
            default=500,
            help="Iterator chunk size when not using --bulk.",
        )

    def handle(self, *args, **options):
        schema_opt = options.get("schema")
        bulk = options["bulk"]
        chunk_size = options["chunk_size"]

        with schema_context(get_public_schema_name()):
            if schema_opt:
                orgs = list(Organization.objects.filter(schema_name=schema_opt))
            else:
                orgs = list(
                    Organization.objects.exclude(
                        schema_name=get_public_schema_name()
                    )
                )

        if not orgs:
            self.stdout.write(self.style.WARNING("No tenant schemas to backfill."))
            return

        for org in orgs:
            self.stdout.write(f"Backfilling search_text in schema {org.schema_name}...")
            with schema_context(org.schema_name):
                if bulk:
                    updated = self._bulk_update()
                else:
                    updated = self._orm_update(chunk_size)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {org.schema_name}: updated {updated} course(s)"
                    )
                )

    def _orm_update(self, chunk_size: int) -> int:
        count = 0
        for course in Course.objects.iterator(chunk_size=chunk_size):
            text = compute_course_search_text(course)
            if course.search_text != text:
                Course.objects.filter(pk=course.pk).update(search_text=text)
                count += 1
        return count

    def _bulk_update(self) -> int:
        sql = """
            UPDATE app_course_course c
            SET search_text = trim(both from concat_ws(' ',
                s.name,
                pl.name,
                pls.name,
                cat.name,
                p.name,
                camp.name,
                i.name,
                (
                    SELECT string_agg(sub.name, ' ' ORDER BY sub.name)
                    FROM app_course_coursesubject cs
                    JOIN app_course_subject sub ON sub.id = cs.subject_id
                    WHERE cs.course_id = c.id
                )
            ))
            FROM app_course_course base
            LEFT JOIN app_course_subject s ON s.id = base.subject_id
            LEFT JOIN app_course_programlevel pl ON pl.id = base.level_id
            LEFT JOIN app_course_programlevelsection pls ON pls.id = base.section_id
            LEFT JOIN app_course_category cat ON cat.id = base.category_id
            LEFT JOIN app_course_program p ON p.id = base.program_id
            LEFT JOIN app_course_campus camp ON camp.id = base.campus_id
            LEFT JOIN app_course_intake i ON i.id = base.intake_id
            WHERE c.id = base.id;
        """
        with connection.cursor() as cursor:
            cursor.execute(sql)
            return cursor.rowcount

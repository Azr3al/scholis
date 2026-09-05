"""Keep Course.search_text in sync for FTS (search_vector is Postgres-generated)."""
from __future__ import annotations

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from app_course.models import (
    Campus,
    Category,
    Course,
    CourseSubject,
    Intake,
    Program,
    ProgramLevel,
    ProgramLevelSection,
    Subject,
)

SKIP_SEARCH_TEXT_REFRESH_ATTR = "_skip_search_text_refresh"


def compute_course_search_text_from_fks(
    *,
    subject=None,
    level=None,
    section=None,
    category=None,
    program=None,
    campus=None,
    intake=None,
    extra_subject_names: list[str] | None = None,
) -> str:
    """Build search_text from in-memory FK objects (create path; no ORM)."""
    parts: list[str] = []
    for obj in (subject, level, section, category, program, campus, intake):
        name = getattr(obj, "name", None) if obj is not None else None
        if name:
            parts.append(name)
    for name in extra_subject_names or []:
        if name:
            parts.append(name)
    return " ".join(parts)


def compute_course_search_text(course: Course) -> str:
    parts: list[str] = []
    if course.subject_id and course.subject:
        parts.append(course.subject.name)
    if course.level_id and course.level:
        parts.append(course.level.name)
    if course.section_id and course.section:
        parts.append(course.section.name)
    if course.category_id and course.category:
        parts.append(course.category.name)
    if course.program_id and course.program:
        parts.append(course.program.name)
    if course.campus_id and course.campus:
        parts.append(course.campus.name)
    if course.intake_id and course.intake:
        parts.append(course.intake.name)
    for cs in course.course_subjects.select_related("subject").all():
        if cs.subject and cs.subject.name:
            parts.append(cs.subject.name)
    return " ".join(parts)


def refresh_course_search_text(course_id: int) -> None:
    course = (
        Course.objects.filter(pk=course_id)
        .select_related(
            "subject",
            "level",
            "section",
            "category",
            "program",
            "campus",
            "intake",
        )
        .first()
    )
    if not course:
        return
    text = compute_course_search_text(course)
    if course.search_text != text:
        Course.objects.filter(pk=course_id).update(search_text=text)


@receiver(post_save, sender=Course)
def course_saved_refresh_search_text(sender, instance: Course, **kwargs):
    if getattr(instance, SKIP_SEARCH_TEXT_REFRESH_ATTR, False):
        return
    refresh_course_search_text(instance.pk)


@receiver(post_save, sender=CourseSubject)
@receiver(post_delete, sender=CourseSubject)
def course_subject_changed_refresh_search_text(sender, instance: CourseSubject, **kwargs):
    refresh_course_search_text(instance.course_id)


def _refresh_courses_for_fk(model, instance, fk_name: str) -> None:
    filter_kwargs = {fk_name: instance.pk}
    for course_id in Course.objects.filter(**filter_kwargs).values_list("id", flat=True):
        refresh_course_search_text(course_id)


@receiver(post_save, sender=Subject)
def subject_renamed_refresh_courses(sender, instance: Subject, **kwargs):
    for course_id in Course.objects.filter(subject_id=instance.pk).values_list("id", flat=True):
        refresh_course_search_text(course_id)
    for course_id in CourseSubject.objects.filter(subject_id=instance.pk).values_list(
        "course_id", flat=True
    ):
        refresh_course_search_text(course_id)


@receiver(post_save, sender=ProgramLevel)
def level_renamed_refresh_courses(sender, instance: ProgramLevel, **kwargs):
    _refresh_courses_for_fk(ProgramLevel, instance, "level_id")


@receiver(post_save, sender=ProgramLevelSection)
def section_renamed_refresh_courses(sender, instance: ProgramLevelSection, **kwargs):
    _refresh_courses_for_fk(ProgramLevelSection, instance, "section_id")


@receiver(post_save, sender=Category)
def category_renamed_refresh_courses(sender, instance: Category, **kwargs):
    _refresh_courses_for_fk(Category, instance, "category_id")


@receiver(post_save, sender=Program)
def program_renamed_refresh_courses(sender, instance: Program, **kwargs):
    _refresh_courses_for_fk(Program, instance, "program_id")


@receiver(post_save, sender=Campus)
def campus_renamed_refresh_courses(sender, instance: Campus, **kwargs):
    _refresh_courses_for_fk(Campus, instance, "campus_id")


@receiver(post_save, sender=Intake)
def intake_renamed_refresh_courses(sender, instance: Intake, **kwargs):
    _refresh_courses_for_fk(Intake, instance, "intake_id")

"""
The HTTP contract the Schedjuice frontend is written against.

Three things here are easy to get subtly wrong and expensive once shipped, and
none of them is visible in the service-layer tests, which call the functions
directly and never pass through a view:

* Both list endpoints answer with a bare array under ``data``. A frontend
  written against ``{"data": [...]}`` renders an empty table when handed
  ``{"data": {"data": [...]}}``, and an empty table reads as "there are no
  marks yet" rather than "the response was misread" -- the worst kind of bug to
  chase, because nothing looks broken anywhere.

* The score filters narrow on the server, not in the browser. The endpoint caps
  at the 500 most recent rows, so filtering after the cap would let one busy
  course crowd every other course out of the window and the page would look
  like marks were missing rather than like a list was truncated.

* A mark crosses the wire as a string. ``score`` and ``max_score`` are exact
  decimals; a JSON number round-trips through JavaScript as a double, where
  12.5 survives but 12.55 does not necessarily. The frontend types say string,
  and this asserts the backend agrees.

Refusals are checked too. An endpoint that answered a caller lacking the
permission with an empty list would be indistinguishable from "no marks yet",
which is a needlessly confusing way to discover you cannot see something.
"""

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.db import connection as db_connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course
from app_rbac.seeding import seed_rbac
from app_scholis.models import ScholisConnection, ScholisPaperLink, ScholisScore


def _database_reachable() -> bool:
    try:
        db_connection.ensure_connection()
        return True
    except Exception:
        return False


def _at(minute: int) -> datetime:
    """A fixed release time, so ordering assertions do not depend on the clock."""
    return datetime(2026, 9, 2, 9, minute, tzinfo=timezone.utc)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
@override_settings(SCHOLIS_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
class ScholisEndpointContractTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            # Two real courses from the fixture: the filter tests need somewhere
            # for a mark to be that is not the one being asked about.
            self.course_a, self.course_b = list(Course.objects.order_by("id")[:2])
            self.connection = ScholisConnection.objects.create(
                external_ref=f"contract-{self.suffix}",
                school_name="Contract School",
            )
            # A superadmin holds every code in the catalog, which is what makes
            # it the right user for testing the shape of a response rather than
            # the reachability of one.
            self.admin = self._user("admin", [User.UserRole.SUPERADMIN])
            # A student holds none of the grading codes.
            self.student = self._user("student", [User.UserRole.STUDENT])
            self.taker = self._user("taker", [User.UserRole.STUDENT])

    def _user(self, kind: str, roles: list) -> User:
        email = f"scholis-{kind}-{self.suffix}@example.com"
        return User.objects.create_user(
            email=email,
            password="x",
            name=f"Scholis {kind.title()}",
            phone_number="1",
            date_of_birth=date(1990, 1, 1),
            communication_email=email,
            code=f"scholis-{kind}-{self.suffix}",
            roles=roles,
        )

    def _client(self, user: User | None) -> APIClient:
        client = APIClient()
        if user is not None:
            client.force_authenticate(user=user)
        # The tenant goes in a header rather than relying on a default, so these
        # tests say which school they mean instead of inheriting whatever the
        # environment happens to resolve an unheaded request to.
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _link(self, course: Course) -> ScholisPaperLink:
        return ScholisPaperLink.objects.create(
            connection=self.connection,
            scholis_test_id=uuid4(),
            scholis_test_title="Paper",
            course=course,
        )

    def _score(
        self,
        link: ScholisPaperLink,
        student: User | None,
        *,
        score: str = "12.50",
        minute: int = 0,
    ) -> ScholisScore:
        return ScholisScore.objects.create(
            link=link,
            attempt_id=uuid4(),
            student=student,
            student_ref=str(student.id) if student else "",
            taker_name=student.name if student else "Walk-in",
            score=Decimal(score),
            max_score=Decimal("20.00"),
            released_at=_at(minute),
        )

    def _attempt_ids(self, response) -> set:
        return {row["attempt_id"] for row in response.json()["data"]}

    # -- response shape ------------------------------------------------------

    def test_the_paper_list_answers_with_a_bare_array(self):
        with schema_context(self.schema_name):
            link = self._link(self.course_a)
            res = self._client(self.admin).get(f"{self.api_prefix}/scholis/papers")
            self.assertEqual(res.status_code, 200, res.content)
            body = res.json()
            self.assertIsInstance(
                body["data"],
                list,
                "the frontend iterates this directly; an object here renders as "
                "an empty table rather than as an error",
            )
            row = next(r for r in body["data"] if r["id"] == link.id)
            self.assertEqual(row["scholis_test_id"], str(link.scholis_test_id))
            self.assertEqual(row["course_id"], self.course_a.id)
            # A link with no column yet is the state a teacher sees between
            # binding a paper and choosing where its marks land. The key has to
            # be present and null: a frontend reading row.column.title on an
            # absent key throws, and one reading it on null can offer to link.
            self.assertIn("column", row)
            self.assertIsNone(row["column"])

    def test_the_score_list_answers_with_a_bare_array(self):
        with schema_context(self.schema_name):
            link = self._link(self.course_a)
            kept = self._score(link, self.taker)
            res = self._client(self.admin).get(f"{self.api_prefix}/scholis/scores")
            self.assertEqual(res.status_code, 200, res.content)
            self.assertIsInstance(res.json()["data"], list)
            self.assertIn(str(kept.attempt_id), self._attempt_ids(res))

    def test_a_mark_crosses_the_wire_as_a_string_not_a_number(self):
        with schema_context(self.schema_name):
            link = self._link(self.course_a)
            self._score(link, self.taker, score="12.55")
            res = self._client(self.admin).get(
                f"{self.api_prefix}/scholis/scores",
                {"paper_link_id": link.id},
            )
            row = res.json()["data"][0]
            for field in ("score", "max_score"):
                with self.subTest(field=field):
                    self.assertIsInstance(
                        row[field],
                        str,
                        "a JSON number becomes a JavaScript double, and an exact "
                        "decimal is the whole reason these are stored exactly",
                    )
            self.assertEqual(row["score"], "12.55")

    # -- server-side filtering ----------------------------------------------

    def test_a_course_filter_leaves_out_every_other_courses_marks(self):
        with schema_context(self.schema_name):
            link_a, link_b = self._link(self.course_a), self._link(self.course_b)
            kept = self._score(link_a, self.taker)
            other = self._score(link_b, self.taker)

            res = self._client(self.admin).get(
                f"{self.api_prefix}/scholis/scores",
                {"course_ref": self.course_a.id},
            )
            self.assertEqual(res.status_code, 200, res.content)
            seen = self._attempt_ids(res)
            self.assertIn(str(kept.attempt_id), seen)
            self.assertNotIn(
                str(other.attempt_id),
                seen,
                "filtering in the browser after the 500-row cap would let one "
                "busy course hide another's marks entirely",
            )

    def test_a_paper_filter_narrows_to_that_paper(self):
        with schema_context(self.schema_name):
            link_a, link_b = self._link(self.course_a), self._link(self.course_a)
            kept = self._score(link_a, self.taker)
            other = self._score(link_b, self.taker)

            res = self._client(self.admin).get(
                f"{self.api_prefix}/scholis/scores",
                {"paper_link_id": link_b.id},
            )
            seen = self._attempt_ids(res)
            self.assertEqual(seen, {str(other.attempt_id)})
            self.assertNotIn(str(kept.attempt_id), seen)

    def test_a_student_filter_narrows_to_that_student(self):
        with schema_context(self.schema_name):
            link = self._link(self.course_a)
            second_taker = self._user("second", [User.UserRole.STUDENT])
            mine = self._score(link, self.taker)
            theirs = self._score(link, second_taker)

            res = self._client(self.admin).get(
                f"{self.api_prefix}/scholis/scores",
                {"student_id": second_taker.id},
            )
            seen = self._attempt_ids(res)
            self.assertEqual(seen, {str(theirs.attempt_id)})
            self.assertNotIn(str(mine.attempt_id), seen)

    def test_filters_compose_rather_than_replace_each_other(self):
        # A course page asks for one course and one paper at a time. If a second
        # filter overwrote the first instead of narrowing further, the page would
        # show marks from other papers in the course.
        with schema_context(self.schema_name):
            link_a, link_b = self._link(self.course_a), self._link(self.course_a)
            other_course_link = self._link(self.course_b)
            kept = self._score(link_a, self.taker)
            self._score(link_b, self.taker)
            self._score(other_course_link, self.taker)

            res = self._client(self.admin).get(
                f"{self.api_prefix}/scholis/scores",
                {"course_ref": self.course_a.id, "paper_link_id": link_a.id},
            )
            self.assertEqual(self._attempt_ids(res), {str(kept.attempt_id)})

    def test_an_unattributed_score_is_still_listed(self):
        # A walk-in attempt has no student row. Dropping it would hide a mark
        # that exists, and a filter on student must not be the only way in.
        with schema_context(self.schema_name):
            link = self._link(self.course_a)
            walk_in = self._score(link, None)
            res = self._client(self.admin).get(
                f"{self.api_prefix}/scholis/scores",
                {"paper_link_id": link.id},
            )
            row = res.json()["data"][0]
            self.assertEqual(row["attempt_id"], str(walk_in.attempt_id))
            self.assertIsNone(row["student_id"])

    # -- refusals ------------------------------------------------------------

    def test_a_caller_without_the_permission_is_refused_not_shown_an_empty_list(self):
        with schema_context(self.schema_name):
            self._link(self.course_a)
            for path in ("papers", "scores"):
                with self.subTest(endpoint=path):
                    res = self._client(self.student).get(
                        f"{self.api_prefix}/scholis/{path}"
                    )
                    self.assertEqual(
                        res.status_code,
                        403,
                        "an empty 200 here is indistinguishable from 'no marks "
                        "yet', which is a confusing way to lack a permission",
                    )

    def test_an_anonymous_caller_is_refused(self):
        with schema_context(self.schema_name):
            res = self._client(None).get(f"{self.api_prefix}/scholis/papers")
            self.assertIn(res.status_code, (401, 403))

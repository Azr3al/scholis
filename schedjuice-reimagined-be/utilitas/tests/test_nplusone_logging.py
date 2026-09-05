import json
import logging
import tempfile
import unittest
from pathlib import Path

from django.test import SimpleTestCase

from utilitas.nplusone_context import clear_context, set_context
from utilitas.nplusone_logging import NPlusOneJsonlHandler, parse_nplusone_message


class ParseNplusoneMessageTests(SimpleTestCase):
    def test_extracts_model_and_field(self):
        msg = (
            "Potential n+1 query detected on Course.user_courses: "
            "CourseSerializer.to_representation (./app_course/serializers.py:42)"
        )
        parsed = parse_nplusone_message(msg)
        self.assertEqual(parsed["model"], "Course")
        self.assertEqual(parsed["field"], "user_courses")
        self.assertEqual(parsed["message"], msg)

    def test_returns_empty_on_non_match(self):
        self.assertEqual(parse_nplusone_message("something else"), {})

    def test_extracts_model_and_field_with_backticks(self):
        msg = "Potential n+1 query detected on `Question.fill_blank_slots`"
        parsed = parse_nplusone_message(msg)
        self.assertEqual(parsed["model"], "Question")
        self.assertEqual(parsed["field"], "fill_blank_slots")
        self.assertEqual(parsed["message"], msg)


class NPlusOneJsonlHandlerTests(SimpleTestCase):
    def test_writes_jsonl_with_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            handler = NPlusOneJsonlHandler(tmp)
            set_context(
                run_id="test-run",
                method="POST",
                path="/api/v1/courses/search",
                schema_name="xschedjuice",
                view="CourseSearchView",
                expand="user_courses",
                query_count=47,
                status_code=200,
            )
            try:
                record = logging.LogRecord(
                    name="nplusone",
                    level=logging.WARNING,
                    pathname=__file__,
                    lineno=1,
                    msg=(
                        "Potential n+1 query detected on Course.user_courses: "
                        "CourseSerializer (./serializers.py:1)"
                    ),
                    args=(),
                    exc_info=None,
                )
                handler.emit(record)
            finally:
                clear_context()

            files = list(Path(tmp).glob("*.jsonl"))
            self.assertEqual(len(files), 1)
            line = json.loads(files[0].read_text(encoding="utf-8").strip())
            self.assertEqual(line["model"], "Course")
            self.assertEqual(line["field"], "user_courses")
            self.assertEqual(line["view"], "CourseSearchView")
            self.assertEqual(line["path"], "/api/v1/courses/search")
            self.assertEqual(line["run_id"], "test-run")
            self.assertEqual(line["query_count"], 47)


class SummarizeScriptTests(unittest.TestCase):
    def test_dedupes_and_counts_groups(self):
        import subprocess
        import sys

        repo_root = Path(__file__).resolve().parents[2]
        fixture = repo_root / "scripts" / "nplusone" / "fixtures" / "sample.jsonl"
        out_dir = Path(tempfile.mkdtemp())
        output = out_dir / "summary.json"

        result = subprocess.run(
            [
                sys.executable,
                str(repo_root / "scripts" / "nplusone" / "summarize.py"),
                str(fixture),
                "--output",
                str(output),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(summary["total_events"], 3)
        self.assertEqual(summary["unique_groups"], 1)
        self.assertEqual(summary["groups"][0]["count"], 3)
        self.assertEqual(summary["groups"][0]["max_query_count"], 47)

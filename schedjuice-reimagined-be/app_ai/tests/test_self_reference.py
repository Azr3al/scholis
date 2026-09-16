import unittest

from django.test import SimpleTestCase

from app_ai.tools.self_reference import is_self_reference_query


class SelfReferenceQueryTests(SimpleTestCase):
    def test_exact_tokens(self):
        for q in ("me", "Me", "MYSELF", "I", "my"):
            with self.subTest(q=q):
                self.assertTrue(is_self_reference_query(q))

    def test_my_prefix(self):
        self.assertTrue(is_self_reference_query("my classes"))
        self.assertTrue(is_self_reference_query("My schedule"))

    def test_not_self_reference(self):
        for q in ("Me Me Win", "Mecole", "memewin", "James", "", "   "):
            with self.subTest(q=q):
                self.assertFalse(is_self_reference_query(q))

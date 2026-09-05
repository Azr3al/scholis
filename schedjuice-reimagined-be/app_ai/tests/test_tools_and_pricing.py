from decimal import Decimal

from django.test import SimpleTestCase, override_settings

from app_ai.pricing import (
    TokenUsage,
    compute_cost,
    compute_cache_savings_usd,
    resolve_model_name,
    usage_from_response,
)
from app_ai.tests.openai_fakes import fake_usage
from app_ai.tools.adapters import to_openai
from app_ai.tools.adjust_staff_points import ADJUST_STAFF_POINTS_TOOL
from app_ai.tools.search_users import SEARCH_USERS_TOOL
from app_ai.tools.validation import ToolValidationError, validate_tool_args


class ToolValidationTests(SimpleTestCase):
    def test_search_users_requires_query(self):
        with self.assertRaises(ToolValidationError):
            SEARCH_USERS_TOOL.validate_args({})

    def test_search_users_rejects_extra_args(self):
        with self.assertRaises(ToolValidationError):
            SEARCH_USERS_TOOL.validate_args({"query": "alice", "foo": "bar"})

    def test_search_users_accepts_role(self):
        args = SEARCH_USERS_TOOL.validate_args(
            {"query": "alice", "role": "student", "limit": 5}
        )
        self.assertEqual(args["query"], "alice")
        self.assertEqual(args["role"], "student")
        self.assertEqual(args["limit"], 5)

    def test_search_users_extra_args_error_lists_allowed(self):
        with self.assertRaises(ToolValidationError) as ctx:
            SEARCH_USERS_TOOL.validate_args({"query": "alice", "foo": "bar"})
        self.assertIn("Allowed:", str(ctx.exception))
        self.assertIn("query", str(ctx.exception))

    def test_search_users_missing_required_lists_required(self):
        with self.assertRaises(ToolValidationError) as ctx:
            SEARCH_USERS_TOOL.validate_args({})
        self.assertIn("Required:", str(ctx.exception))
        self.assertIn("query", str(ctx.exception))

    def test_adjust_staff_points_rejects_adjustment_with_allowed_list(self):
        with self.assertRaises(ToolValidationError) as ctx:
            ADJUST_STAFF_POINTS_TOOL.validate_args(
                {
                    "adjustment": 5,
                    "query": "James",
                    "point_type_query": "Merit",
                    "direction": "add",
                    "note": "Good job",
                }
            )
        message = str(ctx.exception)
        self.assertIn("adjustment", message)
        self.assertIn("Allowed:", message)
        self.assertIn("direction", message)
        self.assertIn("amount", message)

    def test_adjust_staff_points_missing_note_lists_required(self):
        with self.assertRaises(ToolValidationError) as ctx:
            ADJUST_STAFF_POINTS_TOOL.validate_args(
                {
                    "query": "James",
                    "point_type_query": "Merit",
                    "direction": "add",
                    "amount": 5,
                }
            )
        message = str(ctx.exception)
        self.assertIn("note", message)
        self.assertIn("Required:", message)
        self.assertIn("direction", message)
        self.assertIn("amount", message)

    def test_adjust_staff_points_reason_alias_maps_to_note(self):
        args = ADJUST_STAFF_POINTS_TOOL.validate_args(
            {
                "query": "James",
                "point_type_query": "Merit",
                "direction": "add",
                "amount": 5,
                "reason": "Great teamwork",
            }
        )
        self.assertEqual(args["note"], "Great teamwork")
        self.assertNotIn("reason", args)


class OpenAIAdapterTests(SimpleTestCase):
    def test_to_openai_emits_function_tools(self):
        declarations = to_openai()
        self.assertGreater(len(declarations), 0)
        for decl in declarations:
            self.assertEqual(decl["type"], "function")
            self.assertIs(decl["parameters"].get("additionalProperties"), False)


class PricingTests(SimpleTestCase):
    def test_resolve_model_name_maps_gpt_5_6_alias(self):
        self.assertEqual(resolve_model_name("gpt-5.6"), "gpt-5.6-sol")

    def test_compute_cost_luna(self):
        usage = TokenUsage(input_tokens=1_000_000, output_tokens=1_000_000)
        cost = compute_cost("gpt-5.6-luna", usage)
        self.assertEqual(cost, Decimal("1.40000000"))

    def test_usage_from_response_keeps_disjoint_buckets(self):
        usage = usage_from_response(
            fake_usage(
                input_tokens=1000,
                cached=800,
                output_tokens=500,
                reasoning=300,
            )
        )
        self.assertEqual(usage.input_tokens, 200)
        self.assertEqual(usage.output_tokens, 200)
        self.assertEqual(usage.thinking_tokens, 300)
        self.assertEqual(usage.cached_input_tokens, 800)
        self.assertEqual(usage.total_tokens, 1500)

    def test_cache_write_tokens_billed_at_premium_without_inflating_total(self):
        with_writes = TokenUsage(
            input_tokens=1000,
            cache_write_tokens=100,
        )
        without_writes = TokenUsage(input_tokens=1000)
        self.assertEqual(with_writes.total_tokens, without_writes.total_tokens)
        self.assertGreater(
            compute_cost("gpt-5.6-luna", with_writes),
            compute_cost("gpt-5.6-luna", without_writes),
        )

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_net_cache_savings_can_be_negative_when_writes_dominate(self):
        savings = compute_cache_savings_usd(
            "gpt-5.6-luna",
            cached_input_tokens=0,
            cache_write_tokens=1_000_000,
        )
        self.assertLess(savings, Decimal("0"))

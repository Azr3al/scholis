"""Unit tests for chat reaction aggregation (no database)."""

from django.test import SimpleTestCase

from app_chat.reaction_helpers import CHAT_REACTION_EMOJIS, aggregate_reactions

class _ReactionRow:
    def __init__(self, emoji: str, created_by_id: int):
        self.emoji = emoji
        self.created_by_id = created_by_id

class AggregateReactionsUnitTests(SimpleTestCase):
    def test_counts_and_reacted_by_me(self):
        rows = [
            _ReactionRow("👍", 1),
            _ReactionRow("👍", 2),
            _ReactionRow("❤️", 1),
        ]
        agg = aggregate_reactions(rows, 1)
        self.assertEqual(len(agg), 2)
        thumbs = next(r for r in agg if r["emoji"] == "👍")
        self.assertEqual(thumbs["count"], 2)
        self.assertTrue(thumbs["reacted_by_me"])
        heart = next(r for r in agg if r["emoji"] == "❤️")
        self.assertTrue(heart["reacted_by_me"])


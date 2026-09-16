import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from django.test import SimpleTestCase

from app_announcement.models import PostType
from app_microsoft.teams_image_content import MAX_IMAGES_PER_MESSAGE
from app_microsoft.teams_inline_html import (
    announcement_has_inline_raster_images,
    build_teams_inline_body_html,
    collect_inline_hosted_bytes,
    validate_inline_teams_budget,
)


def _mock_image_attachment(att_id: int, filename="a.png", data=b"\x89PNG"):
    att = MagicMock()
    att.id = att_id
    att.filename = filename
    file_handle = MagicMock()
    file_handle.read.return_value = data
    att.file.open.return_value.__enter__ = MagicMock(return_value=file_handle)
    att.file.open.return_value.__exit__ = MagicMock(return_value=False)
    att.file.url = f"https://cdn.example.com/{filename}"
    return att


class ValidateInlineTeamsBudgetTests(SimpleTestCase):
    def test_rejects_eleventh_image(self):
        entries = [(i, b"x" * 100) for i in range(MAX_IMAGES_PER_MESSAGE + 1)]
        err = validate_inline_teams_budget(entries)
        self.assertIsNotNone(err)
        self.assertIn("10", err)


class BuildTeamsInlineBodyHtmlTests(SimpleTestCase):
    def test_interleaves_text_and_images_in_document_order(self):
        att1 = _mock_image_attachment(1, "one.png")
        att2 = _mock_image_attachment(2, "two.png")
        announcement = SimpleNamespace(
            post_type=PostType.ANNOUNCEMENT,
            title="Lesson",
            finished_unit=None,
            html_data=(
                "<p>Before</p>"
                '<img data-attachment-id="1" src="u1" />'
                "<p>Between</p>"
                '<img data-attachment-id="2" src="u2" />'
                "<p>After</p>"
            ),
            data=None,
            attachments=MagicMock(
                all=MagicMock(return_value=[att1, att2]),
            ),
        )
        html, hosted = build_teams_inline_body_html(
            announcement,
            heading="<h2>Lesson</h2>",
            footer="<p><em>footer</em></p>",
        )
        before_idx = html.index("Before")
        img1_idx = html.index("../hostedContents/1/$value")
        between_idx = html.index("Between")
        img2_idx = html.index("../hostedContents/2/$value")
        after_idx = html.index("After")
        self.assertLess(before_idx, img1_idx)
        self.assertLess(img1_idx, between_idx)
        self.assertLess(between_idx, img2_idx)
        self.assertLess(img2_idx, after_idx)
        self.assertEqual(len(hosted), 2)


class AnnouncementHasInlineRasterImagesTests(SimpleTestCase):
    def test_detects_data_attachment_id(self):
        ann = SimpleNamespace(html_data='<img data-attachment-id="3" />')
        self.assertTrue(announcement_has_inline_raster_images(ann))

    def test_false_for_plain_html(self):
        ann = SimpleNamespace(html_data="<p>hello</p>")
        self.assertFalse(announcement_has_inline_raster_images(ann))


class CollectInlineHostedBytesTests(SimpleTestCase):
    def test_collects_in_html_order(self):
        att1 = _mock_image_attachment(1, data=b"a" * 50)
        att2 = _mock_image_attachment(2, data=b"b" * 60)
        announcement = SimpleNamespace(
            html_data=(
                '<img data-attachment-id="2" />'
                '<img data-attachment-id="1" />'
            ),
            attachments=MagicMock(all=MagicMock(return_value=[att1, att2])),
        )
        entries = collect_inline_hosted_bytes(announcement)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0][1], b"b" * 60)
        self.assertEqual(entries[1][1], b"a" * 50)


if __name__ == "__main__":
    unittest.main()

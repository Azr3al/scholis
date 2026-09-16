from django.test import TestCase

from app_telegram.formatting import escape_telegram_html, markdown_to_telegram_html


class EscapeTelegramHtmlTests(TestCase):
    def test_escapes_special_chars(self):
        self.assertEqual(
            escape_telegram_html("Tom & Jerry <3"),
            "Tom &amp; Jerry &lt;3",
        )


class MarkdownToTelegramHtmlTests(TestCase):
    def test_bold(self):
        self.assertEqual(
            markdown_to_telegram_html("**Searching for students.**"),
            "<b>Searching for students.</b>",
        )

    def test_bullet_with_bold(self):
        self.assertEqual(
            markdown_to_telegram_html("* **Searching for students or staff members.**"),
            "• <b>Searching for students or staff members.</b>",
        )

    def test_dash_bullet(self):
        self.assertEqual(
            markdown_to_telegram_html("- First item"),
            "• First item",
        )

    def test_escapes_html_in_plain_text(self):
        self.assertEqual(
            markdown_to_telegram_html("Contact Tom & Jerry <admin>"),
            "Contact Tom &amp; Jerry &lt;admin&gt;",
        )

    def test_inline_code(self):
        self.assertEqual(
            markdown_to_telegram_html("Use `Grade 7` today"),
            "Use <code>Grade 7</code> today",
        )

    def test_multiline_bullets(self):
        text = "* **One.**\n* **Two.**"
        self.assertEqual(
            markdown_to_telegram_html(text),
            "• <b>One.</b>\n• <b>Two.</b>",
        )

    def test_markdown_link(self):
        self.assertEqual(
            markdown_to_telegram_html(
                "[Bruce](https://schedjuice.thiha.net/users/3812)"
            ),
            '<a href="https://schedjuice.thiha.net/users/3812">Bruce</a>',
        )

    def test_bullet_with_link(self):
        self.assertEqual(
            markdown_to_telegram_html(
                "* [test course 3](https://schedjuice.thiha.net/courses/94)"
            ),
            '• <a href="https://schedjuice.thiha.net/courses/94">test course 3</a>',
        )

    def test_link_with_bold_label(self):
        self.assertEqual(
            markdown_to_telegram_html(
                "[**Bruce**](https://schedjuice.thiha.net/users/3812)"
            ),
            '<a href="https://schedjuice.thiha.net/users/3812"><b>Bruce</b></a>',
        )

    def test_http_link_left_plain(self):
        self.assertEqual(
            markdown_to_telegram_html("[x](http://example.com)"),
            "[x](http://example.com)",
        )

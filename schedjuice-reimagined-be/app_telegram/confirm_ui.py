from __future__ import annotations


def build_roster_confirm_keyboard(pending_id: int) -> dict:
    return {
        "inline_keyboard": [
            [
                {"text": "Confirm", "callback_data": f"ai:confirm:{pending_id}"},
                {"text": "Cancel", "callback_data": f"ai:cancel:{pending_id}"},
            ]
        ]
    }


EMPTY_INLINE_KEYBOARD = {"inline_keyboard": []}

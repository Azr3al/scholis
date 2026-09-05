from __future__ import annotations

from django.utils.html import escape

PLATFORM_NAME = "Schedjuice"


def tenant_label(tenant) -> str:
    if tenant is None:
        return ""
    return (getattr(tenant, "name", None) or "").strip()


def build_subject(tenant, label: str) -> str:
    name = tenant_label(tenant)
    if name:
        return f"{label} | {PLATFORM_NAME} on behalf of {name}"
    return f"{label} | {PLATFORM_NAME}"


def _logo_header(tenant) -> str:
    name = tenant_label(tenant) or PLATFORM_NAME
    logo = getattr(tenant, "logo", None) if tenant is not None else None
    logo_url = ""
    if logo and getattr(logo, "url", None):
        logo_url = logo.url
    if logo_url:
        return (
            f'<img src="{escape(logo_url)}" alt="{escape(name)}" '
            'style="max-height:48px;max-width:200px;display:block;margin:0 auto 8px;" />'
        )
    return (
        f'<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;'
        f'text-align:center;">{escape(name)}</p>'
    )


def _detail_rows_html(detail_rows) -> str:
    if not detail_rows:
        return ""
    rows = []
    for label, value in detail_rows:
        rows.append(
            "<tr>"
            f'<td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;'
            f'vertical-align:top;white-space:nowrap;">{escape(label)}</td>'
            f'<td style="padding:6px 0;color:#111827;font-size:14px;'
            f'vertical-align:top;">{escape(value)}</td>'
            "</tr>"
        )
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" '
        'style="margin:24px auto 0;border-collapse:collapse;">'
        + "".join(rows)
        + "</table>"
    )


def _code_block(code: str) -> str:
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" '
        'style="margin:28px 0;">'
        "<tr><td align=\"center\">"
        '<div style="display:inline-block;padding:20px 32px;border:2px solid #e5e7eb;'
        "border-radius:12px;background-color:#f9fafb;"
        'font-family:Consolas,Monaco,monospace;font-size:36px;'
        'font-weight:700;letter-spacing:8px;color:#111827;">'
        f"{escape(code)}"
        "</div>"
        "</td></tr></table>"
    )


def _cta_button(label: str, url: str) -> str:
    safe_label = escape(label)
    safe_url = escape(url)
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" '
        'style="margin:28px 0;">'
        "<tr><td align=\"center\">"
        '<table role="presentation" cellpadding="0" cellspacing="0">'
        "<tr><td align=\"center\" bgcolor=\"#2563eb\" "
        'style="border-radius:8px;">'
        f'<a href="{safe_url}" target="_blank" '
        'style="display:inline-block;padding:14px 28px;font-size:16px;'
        "font-weight:600;color:#ffffff;text-decoration:none;"
        f'border-radius:8px;">{safe_label}</a>'
        "</td></tr></table>"
        "</td></tr></table>"
        f'<p style="margin:0 0 24px;font-size:12px;color:#6b7280;text-align:center;'
        f'word-break:break-all;">{safe_url}</p>'
    )


def render_email(
    *,
    tenant,
    recipient_name=None,
    heading: str,
    intro_html: str | None = None,
    code: str | None = None,
    cta_label: str | None = None,
    cta_url: str | None = None,
    detail_rows=None,
    outro_html: str | None = None,
    security_note: str | None = None,
    preheader: str | None = None,
) -> str:
    org_name = tenant_label(tenant) or PLATFORM_NAME
    greeting_name = (recipient_name or "").strip() or "there"

    if preheader is None and code:
        preheader = f"Your code is {code}."
    elif preheader is None and cta_label:
        preheader = f"{heading} — {cta_label}."

    preheader_html = ""
    if preheader:
        preheader_html = (
            f'<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">'
            f"{escape(preheader)}"
            "</div>"
        )

    body_parts = [
        preheader_html,
        '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" '
        'style="background-color:#f3f4f6;padding:32px 16px;">',
        "<tr><td align=\"center\">",
        '<table role="presentation" cellpadding="0" cellspacing="0" width="600" '
        'style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;'
        'border:1px solid #e5e7eb;">',
        '<tr><td style="padding:32px 32px 24px;">',
        _logo_header(tenant),
        f'<p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">'
        f"via {escape(PLATFORM_NAME)}</p>",
        f'<h1 style="margin:24px 0 16px;font-size:22px;font-weight:600;color:#111827;'
        f'text-align:center;line-height:1.3;">{escape(heading)}</h1>',
        f'<p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">'
        f"Hi {escape(greeting_name)},</p>",
    ]

    if intro_html:
        body_parts.append(
            f'<div style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">'
            f"{intro_html}</div>"
        )

    if code:
        body_parts.append(_code_block(code))

    if cta_label and cta_url:
        body_parts.append(_cta_button(cta_label, cta_url))

    body_parts.append(_detail_rows_html(detail_rows))

    if outro_html:
        body_parts.append(
            f'<div style="margin:16px 0 0;font-size:15px;color:#374151;line-height:1.6;">'
            f"{outro_html}</div>"
        )

    if security_note:
        body_parts.append(
            f'<p style="margin:24px 0 0;padding:12px 16px;background-color:#fef3c7;'
            f'border-left:4px solid #f59e0b;font-size:14px;color:#92400e;line-height:1.5;">'
            f"{escape(security_note)}</p>"
        )

    body_parts.extend(
        [
            "</td></tr>",
            '<tr><td style="padding:0 32px 32px;">',
            '<hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;" />',
            f'<p style="margin:0 0 8px;font-size:12px;color:#9ca3af;line-height:1.5;">'
            f"Sent by {escape(PLATFORM_NAME)} on behalf of {escape(org_name)}.</p>",
            '<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">'
            "This is an automated email. Please do not reply.</p>",
            "</td></tr></table>",
            "</td></tr></table>",
        ]
    )
    return "".join(body_parts)

from app_microsoft.mail import send_user_welcome_email_resend


def should_send_welcome_email(user, tenant) -> bool:
    """Whether a welcome / credential email may be sent for this user."""
    if getattr(tenant, "is_student_login_disabled", False) and user.is_student():
        return False
    return True


def resend_welcome_email(user, tenant) -> dict:
    """
    Re-send welcome email to user.communication_email without changing password.
    Returns sent_to, login_email, and mail_status_code for superadmin debugging.
    """
    if not should_send_welcome_email(user, tenant):
        raise ValueError(
            "Welcome email is not available for student accounts when student login is disabled."
        )

    sent_to = (user.communication_email or "").strip()
    if not sent_to:
        raise ValueError("communication_email is required")

    mail_status_code = send_user_welcome_email_resend(
        sent_to,
        user.email,
        user.name,
        tenant,
    )

    return {
        "sent_to": sent_to,
        "login_email": user.email,
        "mail_status_code": mail_status_code,
    }

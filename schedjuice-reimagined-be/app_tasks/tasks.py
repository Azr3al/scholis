import logging
import sys

from app_auth.models import User, UserDataVerificationRequest
from app_microsoft.flows import CreateUserFlow
from app_microsoft.graph_wrapper.group import MSGroup
from app_microsoft.graph_wrapper.user import MSUser
from app_microsoft.mail import send_user_create_email
from app_organization.models import Organization
from app_tasks.models import Task
from app_telegram.client import TelegramClient
from app_tools.models import UserEmail
from app_tools.services import send_email_from_user_email

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
logger.addHandler(handler)


def remove_ms_members(task: Task, tenant: Organization):
    logger.info("Running [remove_ms_members]")
    group = MSGroup(tenant)
    res = group.remove_member(
        task.data["group_id"],
        task.data["user_id"],
        task.data["role"],
    )
    if res.status_code not in range(199, 300):
        task.retry_count += 1
        task.response = res.content
    else:
        task.is_success = True
        task.response = res.content
    task.save()


def delete_ms_user(task: Task, tenant: Organization):
    logger.info("Running [delete_ms_user]")
    user = MSUser(tenant)
    res = user.delete(task.data["id"])
    if res.status_code not in range(199, 300):
        task.retry_count += 1
        if res.content:
            task.response = res.content
    else:
        task.is_success = True
        task.response = res.content
    task.save()


def delete_ms_course(task: Task, tenant: Organization):
    logger.info("Running [delete_ms_course]")
    group = MSGroup(tenant)
    res = group.delete(task.data["id"])
    if res.status_code not in range(199, 300):
        task.retry_count += 1
    else:
        task.is_success = True
    if res.content:
        task.response = res.content

    task.status_code = res.status_code
    task.save()


def leave_telegram_group(task: Task, org: Organization):
    logger.info("Running [leave_telegram_group]")
    chat_id = (task.data or {}).get("chat_id")
    if org is not None and org.is_telegram_on and chat_id is not None:
        try:
            TelegramClient(org).leave_chat(chat_id)
            task.is_success = True
            task.response = f"left chat {chat_id}"
        except Exception as e:
            task.retry_count += 1
            task.response = str(e)
    else:
        task.is_success = True
        task.response = "skipped"
    task.save()


def send_email(task: Task, tenant: Organization):
    logger.info(f"Running [send_email] for {task.data['id']}")
    if task.data["type"] == "user_create":
        send_user_create_email(
            task.data["to"],
            task.data["user_email"],
            task.data["password"],
            task.data["name"],
            tenant,
        )

    task.is_success = True
    task.save()


def create_ms_user(task: Task, tenant: Organization):
    logger.info(f"Running [create_ms_user] for {task.data['id']}")
    user = User.objects.filter(id=task.data["id"]).first()
    if not user:
        task.is_success = False
        task.retry_count += 1
        return
    display_name = (user.microsoft_display_name or "").strip() or task.data["name"]
    flow = CreateUserFlow(
        task.data["email"],
        task.data["password"],
        task.data["user_type"],
        display_name,
        tenant,
    )
    user.microsoft_id = flow.start()
    user.save()
    task.is_success = True


def send_custom_email(task: Task, tenant: Organization):
    logger.info(f"Running [send_custom_email] for {task.data['id']}")
    user_email = UserEmail.objects.filter(id=task.data["id"]).first()
    send_email_from_user_email(user_email, tenant)
    user_email.is_sent = True
    user_email.save()
    task.is_success = True

def create_dvr_and_send_email(task: Task, tenant: Organization):
    logger.info(f"Running [create_dvr_and_send_email] for {task.data['id']}")
    user = User.objects.filter(id=task.data["id"]).first()
    if not user:
        task.is_success = True
        task.save()
        return
    dvr = UserDataVerificationRequest.objects.create(
        user=user,
        data_verification_request_id=task.data["dvr_id"],
    )
    user.send_dvr_notification_email(tenant, dvr)
    dvr.save()
    task.is_success = True
    task.save()

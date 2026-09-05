import logging

from django.core.management import BaseCommand

from app_tasks import models, tasks
import sys

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
logger.addHandler(handler)


def _get_current_org():
    from django.db import connection
    from tenant_schemas.utils import get_public_schema_name, schema_context
    from app_organization.models import Organization
    tenant_schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=tenant_schema).first()


class Command(BaseCommand):
    def handle(self, *args, **options):
        logger.info("Running tasks")
        org = _get_current_org()
        schema_tasks = (
            models.Task.objects.filter(
                is_success=False, retry_count__lt=4, is_locked=False
            )
            .order_by("-created_at")
            .all()
        )
        # locking the task to prevent race conditions
        for task in schema_tasks:
            task.is_locked = True
            task.save()
            try:
                # running the task's appropriate resolving function
                if task.name == models.Task.TaskName.REMOVE_MS_MEMBER:
                    tasks.remove_ms_members(task, org)
                elif task.name == models.Task.TaskName.DELETE_USER:
                    tasks.delete_ms_user(task, org)
                elif task.name == models.Task.TaskName.DELETE_COURSE:
                    tasks.delete_ms_course(task, org)
                elif task.name == models.Task.TaskName.LEAVE_TELEGRAM_GROUP:
                    tasks.leave_telegram_group(task, org)
                elif task.name == models.Task.TaskName.SEND_SYSTEM_EMAIL:
                    tasks.send_email(task, org)
                elif task.name == models.Task.TaskName.CREATE_MS_USER:
                    tasks.create_ms_user(task, org)
                elif task.name == models.Task.TaskName.SEND_CUSTOM_EMAIL:
                    tasks.send_custom_email(task, org)
                elif task.name == models.Task.TaskName.CREATE_DVR_AND_SEND_EMAIL:
                    tasks.create_dvr_and_send_email(task, org)

            except Exception as e:
                task.is_success = False
                task.retry_count += 1
                logger.error(str(e))

            # resolving the lock after the task is processed
            finally:
                task.is_locked = False
                task.save()

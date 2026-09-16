from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from app_organization.models import Organization
from app_organization.tenant_resolution_cache import invalidate_organization_resolution_cache


@receiver(pre_save, sender=Organization)
def organization_pre_save_for_cache(sender, instance, **kwargs):
    if instance.pk is None:
        instance._tenant_cache_before = None
        return
    try:
        prev = sender.objects.get(pk=instance.pk)
        instance._tenant_cache_before = (
            prev.schema_name,
            prev.domain_url,
            prev.is_public,
        )
    except sender.DoesNotExist:
        instance._tenant_cache_before = None


@receiver(post_save, sender=Organization)
def organization_post_save_clear_resolution_cache(sender, instance, **kwargs):
    before = getattr(instance, "_tenant_cache_before", None)
    if before:
        sn, du, isp = before
        invalidate_organization_resolution_cache(
            schema_name=sn,
            domain_url=du or None,
            is_public=isp,
        )
    invalidate_organization_resolution_cache(
        schema_name=instance.schema_name,
        domain_url=instance.domain_url or None,
        is_public=instance.is_public,
    )


@receiver(post_delete, sender=Organization)
def organization_post_delete_clear_resolution_cache(sender, instance, **kwargs):
    invalidate_organization_resolution_cache(
        schema_name=instance.schema_name,
        domain_url=instance.domain_url or None,
        is_public=instance.is_public,
    )

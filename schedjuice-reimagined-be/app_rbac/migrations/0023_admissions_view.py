from django.db import migrations

NEW = "admissions.view"
GRANT_SLUGS = ("admin", "manager")


def forwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    for slug in GRANT_SLUGS:
        role = Role.objects.filter(slug=slug).first()
        if role is None:
            continue
        RolePermission.objects.get_or_create(role=role, permission_code=NEW)
    from app_rbac.seeding import seed_rbac

    seed_rbac()


def backwards(apps, schema_editor):
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    RolePermission.objects.filter(permission_code=NEW).delete()


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0022_drop_certificate_perms")]
    operations = [migrations.RunPython(forwards, backwards)]

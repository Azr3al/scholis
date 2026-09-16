# app_rbac/models.py
from django.db import models
from utilitas.models import BaseModel


class Role(BaseModel):
    slug = models.SlugField(unique=True)
    display_name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False)        # the 7 seeded roles; cannot be deleted
    is_assignable = models.BooleanField(default=True)      # superadmin: False (not tenant-assignable)

    def __str__(self):
        return self.slug


class RolePermission(BaseModel):
    role = models.ForeignKey(Role, related_name="role_permissions", on_delete=models.CASCADE)
    permission_code = models.CharField(max_length=128)

    class Meta:
        unique_together = ("role", "permission_code")

def staff_points_enabled(tenant) -> bool:
    return bool(getattr(tenant, "is_staff_points_enabled", False))

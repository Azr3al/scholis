"""Canonical entity_type values and policy choice constants for field definitions."""

ENTITY_TYPE_USER = "app_auth.User"
ENTITY_TYPE_COURSE = "app_course.Course"

ALLOWED_DEFINITION_ENTITY_TYPES = frozenset({ENTITY_TYPE_USER, ENTITY_TYPE_COURSE})

# source discriminator
SOURCE_CUSTOM = "custom"
SOURCE_BUILTIN = "builtin"
SOURCE_CHOICES = ((SOURCE_CUSTOM, "custom"), (SOURCE_BUILTIN, "builtin"))

# required_at stage
REQUIRED_AT_REGISTRATION = "registration"
REQUIRED_AT_PROFILE_COMPLETION = "profile_completion"
REQUIRED_AT_NEVER = "never"
REQUIRED_AT_CHOICES = (
    (REQUIRED_AT_REGISTRATION, "registration"),
    (REQUIRED_AT_PROFILE_COMPLETION, "profile_completion"),
    (REQUIRED_AT_NEVER, "never"),
)

# filled_by actor
FILLED_BY_USER = "user"
FILLED_BY_ADMIN = "admin"
FILLED_BY_BOTH = "both"
FILLED_BY_CHOICES = (
    (FILLED_BY_USER, "user"),
    (FILLED_BY_ADMIN, "admin"),
    (FILLED_BY_BOTH, "both"),
)

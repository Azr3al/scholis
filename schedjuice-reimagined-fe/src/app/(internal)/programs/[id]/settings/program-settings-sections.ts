export const PROGRAM_SETTINGS_SECTIONS = [
  {
    id: "general",
    title: "General",
    description: "How courses are created under this program.",
    keys: [
      "name",
      "description",
      "course_creation_method",
      "subject_strategy",
      "is_session_credit_scheduling",
      "default_max_sessions",
      "allow_multiple_sessions_per_day",
      "is_substitution_reserve_enabled",
      "default_substitution_reserve_days",
    ],
  },
  {
    id: "status",
    title: "Status",
    description: "Whether this program is active.",
    keys: ["is_active"],
  },
] as const;

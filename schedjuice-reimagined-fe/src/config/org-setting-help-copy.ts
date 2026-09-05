export type OrgSettingHelpEntry = {
  summary: string;
  pseudoCode: string;
};

export const ORG_SETTING_HELP: Partial<Record<string, OrgSettingHelpEntry>> = {
  auto_assign_creator_as_main_teacher: {
    summary:
      "When on, a teacher-only creator becomes main teacher on the new course and all of its sessions.",
    pseudoCode: `if flag and creator.roles == [teacher]:
  assign creator as MT on course
  assign creator to every course event`,
  },
  is_course_role_enabled: {
    summary:
      "When off, every teacher assignment is forced to the tenant’s Main Teacher role (role picker hidden).",
    pseudoCode: `if not flag:
  role = tenant.sole_MT_role  # error if missing
  assign(user, course, role=role)`,
  },
  is_substitute_teachers_enabled: {
    summary:
      "When on, a course role can be marked as a substitute role. Substitute assignments pick specific session dates and can auto-expire after the last one.",
    pseudoCode: `if flag:
  show "substitute role" toggle on course role form
  substitute role requires seniority in {MAIN_TEACHER, ASSISTANT_TEACHER}
  assigning a substitute role => custom session dates only`,
  },
  is_exam_board_in_course_enabled: {
    summary:
      "When on, exam session and exam board appear on course create/edit and are required.",
    pseudoCode: `if flag:
  show exam_session_date + exam_board
  require both on create/update
else:
  hide exam fields`,
  },
  is_course_id_card_expiry_enabled: {
    summary:
      "When on, courses may set an optional ID card expiry date that overrides the template expiry for enrolled students.",
    pseudoCode: `if flag:
  show id_card_expiry_date on course forms
  resolve per-student expiry from enrollments for ID cards
else:
  hide field; use template expires_on only`,
  },
  warn_on_long_course_duration: {
    summary:
      "When on, course create shows a warning if start and end dates span more than 30 calendar days.",
    pseudoCode: `if flag and calendar_days(end, start) > 30:
  show warning on course create forms`,
  },
  is_student_teacher_group_chat_enabled: {
    summary:
      "When on, each enrolled student gets a private group chat per active course with their main and assistant teachers. Whole-roster course chat is hidden.",
    pseudoCode: `if flag:
  hide course-wide chat in inbox + block course thread access
  on student enroll / teacher roster change:
    sync GROUP thread (student + MT/AT)
  after first enable for existing enrollments:
    manage.py backfill_student_teacher_group_chats --schema-name <tenant>`,
  },
  is_students_dm_admins_only_enabled: {
    summary:
      "When on, students may only start direct messages with the assigned student DM contact (an admin, manager, or superadmin).",
    pseudoCode: `if flag:
  require student_dm_contact_user_id on save
  student DM eligible-users => contact only`,
  },
  student_dm_contact_user_id: {
    summary:
      "The sole staff member students may message when admins-only direct messages are enabled.",
    pseudoCode: `if is_students_dm_admins_only_enabled:
  student_dm_contact_user_id required
  must be admin/manager/superadmin in tenant`,
  },
};

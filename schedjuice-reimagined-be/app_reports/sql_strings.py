course_data_sheet_sql = """
SELECT
    c.id as course_id,
    cc.name AS category_name,
    COALESCE(cc.sort_order, 0) AS category_sort_order,
    c.title AS title,
    c.start_date AS start_date,
    c.end_date AS end_date,
    c.course_type as course_type,
    c.student_count,
    c.assistant_teacher_count,
    e.time_from AS start_time,
    e.time_to AS end_time,
    STRING_AGG(
        CASE WHEN ar.seniority = 'MAIN_TEACHER'
            THEN u.name || CASE WHEN u.alternative_name IS NOT NULL
                THEN ' (' || u.alternative_name || ')' ELSE '' END
        END, ', '
    ) AS main_teachers,
    STRING_AGG(
        CASE WHEN ar.seniority = 'ASSISTANT_TEACHER'
            THEN u.name || CASE WHEN u.alternative_name IS NOT NULL
                THEN ' (' || u.alternative_name || ')' ELSE '' END
        END, ', '
    ) AS assistant_teachers,
    current_unit_post.finished_unit AS current_unit,
    current_unit_post.updated_at AS current_unit_updated_at
FROM app_course_course c
JOIN app_course_category cc ON cc.id = c.category_id
LEFT JOIN LATERAL (
    SELECT time_from, time_to FROM app_course_event e
    WHERE e.course_id = c.id ORDER BY e.time_from ASC LIMIT 1
) e ON TRUE
LEFT JOIN LATERAL (
    SELECT a.finished_unit, a.updated_at
    FROM app_announcement_announcement a
    WHERE a.course_id = c.id
      AND a.post_type = 'daily_lesson'
      AND a.finished_unit IS NOT NULL
    ORDER BY a.created_at DESC
    LIMIT 1
) current_unit_post ON TRUE
LEFT JOIN app_course_usercourse uc ON uc.course_id = c.id
LEFT JOIN app_course_assignedasrole ar ON ar.id = uc.assigned_as_role_id
LEFT JOIN app_auth_user u ON u.id = uc.user_id
WHERE c.start_date <= %s AND c.end_date >= %s
GROUP BY
    c.id, cc.name, cc.sort_order, c.title, c.start_date, c.end_date,
    c.course_type, c.student_count, c.assistant_teacher_count,
    e.time_from, e.time_to,
    current_unit_post.finished_unit, current_unit_post.updated_at
ORDER BY cc.sort_order, cc.name, c.title
"""

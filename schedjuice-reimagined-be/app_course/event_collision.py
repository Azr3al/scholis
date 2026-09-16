"""Which other courses have sessions that clash with this course's sessions."""
from __future__ import annotations

from django.db import connection

# Endpoint-touching sessions count as colliding, matching the previous Python loop.
_COLLIDING_COURSE_IDS_SQL = """
SELECT DISTINCT other.course_id
FROM app_course_event mine
JOIN app_course_event other
  ON other.course_id <> mine.course_id
 AND other.date = mine.date
 AND other.time_from <= mine.time_to
 AND other.time_to >= mine.time_from
WHERE mine.course_id = %s
  AND other.date >= %s
  AND other.date <= %s
ORDER BY other.course_id
"""


def colliding_course_ids(course_id: int, start_date, end_date) -> list[int]:
    if start_date is None or end_date is None:
        return []
    with connection.cursor() as cursor:
        cursor.execute(_COLLIDING_COURSE_IDS_SQL, [course_id, start_date, end_date])
        return [row[0] for row in cursor.fetchall()]

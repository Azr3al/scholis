from datetime import datetime
import pytz
from app_course import models


def check_and_release_results(assignment):
    if not assignment.results_release_date:
        return 0
    
    if datetime.now(tz=pytz.UTC) >= assignment.results_release_date:
        updated_count = models.Submission.objects.filter(
            assignment=assignment,
            is_graded=True,
            are_results_released=False
        ).update(are_results_released=True)
        return updated_count
    
    return 0

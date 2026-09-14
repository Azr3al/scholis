"""
Microsoft Graph wrapper for Education API - payment assignment CRUD and submission sync.

All operations use app-only auth (client credentials), same as MSGroup / Teams
creation — requires ``EduAssignments.ReadWrite.All`` and ``Files.Read.All`` application
permissions in Azure.
"""

import json
import logging
from datetime import datetime

import pytz

from app_microsoft.graph_wrapper.base import BaseMSRequest


class MSEducation(BaseMSRequest):
    """
    Wrapper for Microsoft Graph Education assignments API.

    ``use_app_auth=True`` (default): client credentials — assignment CRUD and submission sync.
    See: https://learn.microsoft.com/en-us/graph/api/educationclass-post-assignment
    """

    def __init__(self, tenant, *, use_app_auth: bool = True):
        super().__init__(tenant, use_app_auth=use_app_auth)

    def create_assignment(
        self,
        class_id: str,
        display_name: str,
        instructions: str,
        due_datetime: datetime,
        *,
        instructions_content_type: str = "text",
    ):
        """
        Create an education assignment in a Teams class.
        class_id: Microsoft group/education class ID (course.microsoft_group_id)
        display_name: e.g. "January 2025 payment"
        instructions: Assignment instructions (e.g. "Upload your payment screenshot")
        due_datetime: When the assignment is due (timezone-aware)
        instructions_content_type: Graph contentType, ``text`` or ``html``.
        """
        if due_datetime.tzinfo is None:
            due_datetime = pytz.UTC.localize(due_datetime)
        due_iso = due_datetime.isoformat()

        payload = {
            "displayName": display_name,
            "instructions": {
                "contentType": instructions_content_type,
                "content": instructions,
            },
            "dueDateTime": due_iso,
            "grading": {
                "@odata.type": "#microsoft.graph.educationAssignmentPointsGradeType",
                "maxPoints": 0,
            },
            "assignTo": {
                "@odata.type": "#microsoft.graph.educationAssignmentClassRecipient",
            },
            "addedStudentAction": "assignIfOpen",
            "status": "draft",
            "allowStudentsToAddResourcesToSubmission": True,
        }
        return self.post(
            f"{self.URL}education/classes/{class_id}/assignments",
            json.dumps(payload),
        )

    def publish_assignment(self, class_id: str, assignment_id: str):
        """Publish an assignment so students can see it and submit."""
        url = f"{self.URL}education/classes/{class_id}/assignments/{assignment_id}/publish"
        return self.post(url, json.dumps({}))

    def update_assignment(
        self,
        class_id: str,
        assignment_id: str,
        *,
        display_name: str | None = None,
        due_datetime: datetime | None = None,
    ):
        """
        Update an existing education assignment. Pass display_name and/or due_datetime
        to patch those fields. At least one must be provided.
        """
        payload = {}
        if display_name is not None:
            payload["displayName"] = display_name
        if due_datetime is not None:
            if due_datetime.tzinfo is None:
                due_datetime = pytz.UTC.localize(due_datetime)
            payload["dueDateTime"] = due_datetime.isoformat()
        if not payload:
            raise ValueError("At least one of display_name or due_datetime must be provided")
        url = f"{self.URL}education/classes/{class_id}/assignments/{assignment_id}"
        return self.patch(url, json.dumps(payload))

    def delete_assignment(self, class_id: str, assignment_id: str):
        """
        Delete an education assignment from Teams.
        See: https://learn.microsoft.com/en-us/graph/api/educationassignment-delete
        """
        url = f"{self.URL}education/classes/{class_id}/assignments/{assignment_id}"
        return self.delete(url)

    def list_assignments(self, class_id: str) -> list[dict]:
        """
        List all education assignments in a Teams class with pagination.
        See: https://learn.microsoft.com/en-us/graph/api/educationclass-list-assignments
        """
        url = f"{self.URL}education/classes/{class_id}/assignments"
        items: list[dict] = []
        while url:
            res = self.get(url)
            if res.status_code not in range(199, 300):
                logging.getLogger(__name__).error(
                    "list_assignments failed for class %s: %s %s",
                    class_id,
                    res.status_code,
                    getattr(res, "text", "")[:500],
                )
                break
            data = res.json()
            items.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
        return items

    def list_submissions(self, class_id: str, assignment_id: str, status_filter: str | None = "submitted"):
        """
        List submissions for an assignment.
        status_filter: e.g. "submitted" to get only turned-in submissions.
        """
        url = f"{self.URL}education/classes/{class_id}/assignments/{assignment_id}/submissions"
        if status_filter:
            url += f"?$filter=status eq '{status_filter}'"
        return self.get(url)

    def list_submitted_resources(self, class_id: str, assignment_id: str, submission_id: str):
        """List submitted resources (files, links) for a submission."""
        url = f"{self.URL}education/classes/{class_id}/assignments/{assignment_id}/submissions/{submission_id}/submittedResources"
        return self.get(url)

    def download_file_content(self, file_url: str):
        """
        Download file content from a Graph fileUrl (e.g. drives/.../items/...).
        Append /content to get raw bytes. Requires Files.Read.All permission.
        """
        content_url = f"{file_url}/content" if "/content" not in file_url else file_url
        res = self.get(content_url)
        if res.status_code not in range(199, 300):
            # 403 often means missing Files.Read.All permission in Azure app
            logging.getLogger(__name__).warning(
                f"Download failed: status={res.status_code}, url_snippet={file_url[:80]}..., "
                f"body={getattr(res, 'text', '')[:200]}"
            )
        return res

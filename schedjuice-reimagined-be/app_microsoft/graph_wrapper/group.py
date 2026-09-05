import json
from datetime import datetime

import pytz

from app_microsoft.graph_wrapper.base import BaseMSRequest
from app_microsoft.graph_wrapper.retry import graph_call_with_retry


class MSGroup(BaseMSRequest):
    member_settings = {
        "allowCreateUpdateChannels": False,
        "allowDeleteChannels": False,
        "allowAddRemoveApps": False,
        "allowCreateUpdateRemoveTabs": False,
        "allowCreateUpdateRemoveConnectors": False,
    }

    def __init__(self, tenant):
        self.tenant = tenant
        super().__init__(tenant)

    def make_channel(self, name, is_favourite=True):
        return {"displayName": name, "isFavouriteByDefault": is_favourite}

    def get(self, group_id: str):
        """GET a group by id (used to validate an existing team before linking)."""
        return super().get(f"{self.URL}groups/{group_id}")

    def create(self, name, group_type="educationClass"):
        payload = {
            "template@odata.bind": f"https://graph.microsoft.com/v1.0/teamsTemplates('{group_type}')",
            "displayName": name,
            "description": f"Hello, welcome to {name}. Created by Schedjuice at {datetime.now(tz=pytz.timezone('Asia/Rangoon'))}",
            "channels": [self.make_channel("General")],
            "mailEnabled": False,
            "memberSettings": self.member_settings,
            "owners@odata.bind": [
                "https://graph.microsoft.com/v1.0/users/" + self.tenant.default_owner_id
            ],
        }
        # Team creation is a single Graph mutation that occasionally 429s / hits
        # directory concurrency; retry transient failures before surfacing an error.
        return graph_call_with_retry(
            "create team",
            lambda: self.post(f"{self.BETA_URL}teams", json.dumps(payload)),
        )

    def add_channel(self, group_id: str, channel_name: str, is_favourite=True):
        return self.post(
            f"{self.URL}teams/{group_id}/channels",
            json.dumps(self.make_channel(channel_name, is_favourite)),
        )

    def add_member(self, user_id: str, group_id: str, role: str):
        if not user_id or not group_id:
            raise ValueError("add_member requires non-empty user_id and group_id")
        payload = {}
        if role == "owners":
            payload = {"@odata.id": "https://graph.microsoft.com/v1.0/users/" + user_id}

        elif role == "members":
            payload = {
                "@odata.id": "https://graph.microsoft.com/v1.0/directoryObjects/"
                + user_id
            }

        res = self.post(
            f"{self.URL}groups/{group_id}/{role}/$ref", json.dumps(payload)
        )
        if res.status_code in range(199, 300):
            return res

        combined = (res.text or "").lower()
        odata_msg = ""
        try:
            body = res.json()
            err = body.get("error") if isinstance(body, dict) else None
            if isinstance(err, dict) and err.get("message"):
                odata_msg = str(err["message"]).lower()
        except (TypeError, ValueError):
            pass
        combined = f"{combined} {odata_msg}"

        # Adding an existing member returns 400 with an OData message about references.
        if res.status_code in (400, 409) and (
            "already exist" in combined
            or "already exists" in combined
            or "already a member" in combined
        ):
            return res

        snippet = (res.text or "")[:800]
        raise RuntimeError(
            f"Microsoft Graph add group member failed (HTTP {res.status_code}): {snippet}"
        )

    def remove_member(self, group_id: str, user_id: str, role: str):
        return super(MSGroup, self).delete(
            f"{self.URL}groups/{group_id}/{role}/{user_id}/$ref"
        )

    def delete(self, group_id: str):
        return super().delete(f"{self.URL}groups/{group_id}")

    def list_owner_ids(self, group_id: str) -> set[str]:
        if not group_id:
            return set()
        ids: set[str] = set()
        url = f"{self.URL}groups/{group_id}/owners?$select=id"
        while url:
            res = self.get(url)
            if res.status_code not in range(199, 300):
                snippet = (res.text or "")[:800]
                raise RuntimeError(
                    f"Microsoft Graph list group owners failed (HTTP {res.status_code}): {snippet}"
                )
            body = res.json()
            for item in body.get("value") or []:
                owner_id = item.get("id")
                if owner_id:
                    ids.add(str(owner_id).strip())
            url = body.get("@odata.nextLink")
        return ids

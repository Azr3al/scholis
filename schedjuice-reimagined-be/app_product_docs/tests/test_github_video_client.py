import unittest
from io import BytesIO
from unittest.mock import MagicMock, patch

from app_product_docs.github_video_client import GitHubVideoClient

@patch("app_product_docs.github_video_client.requests.Session")
class GitHubVideoClientUploadAssetTests(unittest.TestCase):
    def test_upload_asset_sends_content_type_header(self, mock_session_cls):
        session = MagicMock()
        mock_session_cls.return_value = session
        session.get.return_value.status_code = 200
        session.get.return_value.json.return_value = {
            "upload_url": "https://uploads.github.com/release/1/assets{?name,label}",
        }
        session.post.return_value.status_code = 201
        session.post.return_value.json.return_value = {
            "browser_download_url": "https://github.com/o/r/releases/download/videos/x.png",
        }

        client = GitHubVideoClient(token="tok", repo="owner/repo", release_tag="videos")
        url = client.upload_asset(filename="x.png", file_obj=BytesIO(b"data"))

        self.assertEqual(url, "https://github.com/o/r/releases/download/videos/x.png")
        upload_call = session.post.call_args_list[-1]
        self.assertEqual(upload_call.kwargs["headers"]["Content-Type"], "image/png")

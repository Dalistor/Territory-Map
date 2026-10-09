"""DTOs for app updates and releases."""

from typing import Literal

from pydantic import BaseModel


class AppReleaseOut(BaseModel):
    """Release metadata for an Android client."""

    app: Literal["app", "admin-app"]
    version_code: int
    version_name: str
    min_version_code: int = 1
    download_url: str
    changelog: str | None = None
    published_at: str | None = None

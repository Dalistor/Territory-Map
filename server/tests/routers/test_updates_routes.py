"""Tests for the app updates and release download routes."""

import json
from pathlib import Path

import httpx
import pytest
from app.core.config import get_settings

pytestmark = pytest.mark.anyio


@pytest.fixture
def releases_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect RELEASES_DIR to a temporary folder."""
    releases_path = tmp_path / "releases"
    releases_path.mkdir(parents=True, exist_ok=True)
    settings = get_settings()
    monkeypatch.setattr(settings, "RELEASES_DIR", str(releases_path))
    return releases_path


async def test_get_latest_version_returns_404_when_no_release_exists(
    client: httpx.AsyncClient, releases_dir: Path
) -> None:
    response = await client.get("/updates/latest?app=app")
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "release_not_found"


async def test_get_latest_version_rejects_unknown_app_identifier(
    client: httpx.AsyncClient, releases_dir: Path
) -> None:
    response = await client.get("/updates/latest?app=unknown-client")
    assert response.status_code in (400, 422)


async def test_get_latest_version_returns_manifest(
    client: httpx.AsyncClient, releases_dir: Path
) -> None:
    app_dir = releases_dir / "app"
    app_dir.mkdir()
    manifest_data = {
        "app": "app",
        "version_code": 12,
        "version_name": "1.2.0",
        "min_version_code": 10,
        "download_url": "/updates/download/app",
        "changelog": "Novos recursos de sincronização e melhorias no mapa.",
        "published_at": "2026-10-09T16:00:00Z",
    }
    (app_dir / "version.json").write_text(json.dumps(manifest_data), encoding="utf-8")

    response = await client.get("/updates/latest?app=app")
    assert response.status_code == 200
    body = response.json()
    assert body["version_code"] == 12
    assert body["version_name"] == "1.2.0"
    assert body["min_version_code"] == 10
    assert body["download_url"] == "/updates/download/app"
    assert body["changelog"] == "Novos recursos de sincronização e melhorias no mapa."


async def test_download_apk_returns_file(client: httpx.AsyncClient, releases_dir: Path) -> None:
    app_dir = releases_dir / "admin-app"
    app_dir.mkdir()
    manifest_data = {
        "app": "admin-app",
        "version_code": 5,
        "version_name": "1.0.5",
        "min_version_code": 1,
        "download_url": "/updates/download/admin-app",
        "apk_filename": "admin-app-release.apk",
        "published_at": "2026-10-09T16:00:00Z",
    }
    (app_dir / "version.json").write_text(json.dumps(manifest_data), encoding="utf-8")
    apk_content = b"fake-apk-binary-content-12345"
    (app_dir / "admin-app-release.apk").write_bytes(apk_content)

    response = await client.get("/updates/download/admin-app")
    assert response.status_code == 200
    assert response.content == apk_content
    assert "application/vnd.android.package-archive" in response.headers.get("content-type", "")


async def test_download_apk_returns_404_when_missing(
    client: httpx.AsyncClient, releases_dir: Path
) -> None:
    response = await client.get("/updates/download/app")
    assert response.status_code == 404

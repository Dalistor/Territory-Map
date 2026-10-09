"""Routes for Android app update checks and APK downloads."""

import json
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import get_settings
from app.schemas.update import AppReleaseOut

router = APIRouter(prefix="/updates", tags=["updates"])

AppId = Literal["app", "admin-app"]


def _get_app_release_dir(app_id: str) -> Path:
    settings = get_settings()
    base_dir = Path(settings.RELEASES_DIR).resolve()
    target_dir = (base_dir / app_id).resolve()
    # Prevent path traversal outside base directory
    if not target_dir.is_relative_to(base_dir):
        raise ValueError("Invalid target directory path")
    return target_dir


@router.get("/latest", response_model=None)
def get_latest_version(app: Annotated[AppId, Query()]) -> AppReleaseOut | JSONResponse:
    """Return the latest release metadata for the given Android client."""
    try:
        app_dir = _get_app_release_dir(app)
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "code": "invalid_app_identifier",
                "detail": "Identificador de aplicativo inválido.",
            },
        )

    manifest_file = app_dir / "version.json"
    if not manifest_file.is_file():
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "code": "release_not_found",
                "detail": "Nenhuma versão encontrada para este aplicativo.",
            },
        )

    try:
        data = json.loads(manifest_file.read_text(encoding="utf-8"))
        return AppReleaseOut(**data)
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "code": "invalid_release_manifest",
                "detail": "Manifesto de versão corrompido.",
            },
        )


@router.get("/download/{app}", response_model=None)
def download_apk(app: AppId) -> FileResponse | JSONResponse:
    """Download the latest APK binary for the given Android client."""
    try:
        app_dir = _get_app_release_dir(app)
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "code": "invalid_app_identifier",
                "detail": "Identificador de aplicativo inválido.",
            },
        )

    manifest_file = app_dir / "version.json"
    if not manifest_file.is_file():
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "code": "release_not_found",
                "detail": "Nenhum manifesto de versão encontrado.",
            },
        )

    try:
        manifest_data = json.loads(manifest_file.read_text(encoding="utf-8"))
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "code": "invalid_release_manifest",
                "detail": "Manifesto de versão corrompido.",
            },
        )

    apk_filename = manifest_data.get("apk_filename", f"{app}-release.apk")
    apk_path = (app_dir / apk_filename).resolve()

    if not apk_path.is_relative_to(app_dir) or not apk_path.is_file():
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"code": "apk_file_not_found", "detail": "Arquivo APK não encontrado."},
        )

    return FileResponse(
        path=apk_path,
        media_type="application/vnd.android.package-archive",
        filename=apk_filename,
    )

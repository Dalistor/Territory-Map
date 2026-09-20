from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from app.core.deps import current_congregation
from app.main import app
from app.routers.admin_assignments import get_assignment_service
from fastapi.testclient import TestClient


class RecordingAssignmentService:
    def __init__(self) -> None:
        self.arguments = None

    def list_page(self, congregation_id, **kwargs):
        self.arguments = (congregation_id, kwargs)
        return [], 0


def test_assignment_history_query_converts_filters_and_returns_an_empty_page() -> None:
    congregation_id = uuid4()
    publisher_id = uuid4()
    territory_id = uuid4()
    service = RecordingAssignmentService()
    app.dependency_overrides[current_congregation] = lambda: SimpleNamespace(id=congregation_id)
    app.dependency_overrides[get_assignment_service] = lambda: service

    try:
        response = TestClient(app).get(
            "/admin/assignments",
            params={
                "publisher_id": str(publisher_id),
                "territory_id": str(territory_id),
                "from": "2026-01-10T00:00:00-03:00",
                "to": "2026-01-11T00:00:00-03:00",
                "page": 2,
                "page_size": 25,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "page": 2, "page_size": 25}
    assert service.arguments == (
        congregation_id,
        {
            "publisher_id": publisher_id,
            "territory_id": territory_id,
            "from_instant": datetime(2026, 1, 10, 3, tzinfo=UTC),
            "to_instant": datetime(2026, 1, 11, 3, tzinfo=UTC),
            "page": 2,
            "page_size": 25,
        },
    )


def test_assignment_history_query_answers_422_before_calling_the_service_for_bad_period() -> None:
    service = RecordingAssignmentService()
    app.dependency_overrides[current_congregation] = lambda: SimpleNamespace(id=uuid4())
    app.dependency_overrides[get_assignment_service] = lambda: service

    try:
        response = TestClient(app).get(
            "/admin/assignments",
            params={"from": "2026-01-11T00:00:00Z", "to": "2026-01-10T00:00:00Z"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert service.arguments is None

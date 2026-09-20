from datetime import UTC, datetime

import pytest
from app.schemas.assignment import AssignmentHistoryQuery
from pydantic import ValidationError


def test_assignment_history_query_normalizes_offset_instants_to_utc() -> None:
    query = AssignmentHistoryQuery.model_validate(
        {
            "from": "2026-01-10T00:00:00-03:00",
            "to": "2026-01-11T00:00:00-03:00",
        }
    )

    assert query.from_instant == datetime(2026, 1, 10, 3, tzinfo=UTC)
    assert query.to_instant == datetime(2026, 1, 11, 3, tzinfo=UTC)


@pytest.mark.parametrize(
    "payload",
    [
        {"from": "2026-01-11T00:00:00Z", "to": "2026-01-11T00:00:00Z"},
        {"from": "2026-01-12T00:00:00Z", "to": "2026-01-11T00:00:00Z"},
        {"from": "2026-01-10T00:00:00", "to": "2026-01-11T00:00:00Z"},
    ],
)
def test_assignment_history_query_rejects_invalid_periods(payload: dict[str, str]) -> None:
    with pytest.raises(ValidationError):
        AssignmentHistoryQuery.model_validate(payload)

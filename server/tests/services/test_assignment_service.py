"""Behaviour of the assignment history: one publisher at a time, and a past that stays.

These tests run against a real database rather than in-memory fakes, unlike the work
log suite. Nothing here is geometric, but two things the rules depend on live in the
database itself: the partial unique index that allows only one open assignment per
territory, and `TerritoryRepository.set_assigned_user`, which refreshes the loaded
relationship after the flush. A fake would answer both from Python and prove nothing
about the invariant the schema is there to hold.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from app.core.exceptions import NotFoundError
from app.core.geo import LatLng, points_to_wkt
from app.models.territory import Territory
from app.models.user import User
from app.repositories.territory import TerritoryRepository
from app.repositories.territory_assignment import TerritoryAssignmentRepository
from app.repositories.user import UserRepository
from app.services.assignment import AssignmentService
from sqlalchemy.orm import Session

NOW = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)
EARLIER = NOW - timedelta(days=30)


def square(lat: float, lng: float, size: float = 1.0) -> list[LatLng]:
    """A square ring whose south-west corner is `(lat, lng)`, walked anticlockwise."""
    return [
        LatLng(lat, lng),
        LatLng(lat, lng + size),
        LatLng(lat + size, lng + size),
        LatLng(lat + size, lng),
    ]


@pytest.fixture
def service(session: Session) -> AssignmentService:
    return AssignmentService(
        assignments=TerritoryAssignmentRepository(session),
        territories=TerritoryRepository(session),
        users=UserRepository(session),
        now_provider=lambda: NOW,
    )


@pytest.fixture
def make_territory(session: Session) -> Callable[..., Territory]:
    """Draw a territory straight through the repository.

    `TerritoryService` is a different unit, and its rules (overlap, unique name)
    would make these tests fail for reasons that belong there. What an assignment
    needs from a territory is only that it exists, inside a congregation.
    """
    drawn = 0

    def _make(congregation_id: UUID, name: str = "Centro") -> Territory:
        nonlocal drawn
        territory = TerritoryRepository(session).create(
            congregation_id, name, points_to_wkt(square(float(drawn * 2), 0.0))
        )
        drawn += 1
        return territory

    return _make


@pytest.fixture
def make_user(session: Session) -> Callable[..., User]:
    """Put a publisher on the map straight through the repository.

    Same reasoning as the territory factory: `UserService` owns code generation and
    expiry, and the assignment rules need none of it -- only a person who exists,
    in a congregation, with a given `is_active`.
    """

    def _make(congregation_id: UUID, name: str = "Ana", *, is_active: bool = True) -> User:
        repository = UserRepository(session)
        user = repository.create(congregation_id=congregation_id, name=name)
        if not is_active:
            user = repository.set_active(user, False)
        return user

    return _make


def test_designate_opens_an_assignment_and_points_the_territory_at_the_publisher(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id)

    assignment = service.designate(congregation.id, territory.id, publisher.id)

    assert assignment.user_id == publisher.id
    assert assignment.started_at == NOW
    assert assignment.completed_at is None
    assert territory.assigned_user_id == publisher.id


def test_designate_to_someone_else_closes_the_open_assignment_and_keeps_it_in_the_history(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    """Handing a territory over is one event, not two.

    The paper S-13 card has only two dates per line, so "gave it back" and
    "completed it" are the same stamp -- the previous holder is closed at the moment
    the next one starts, and the admin keeps the single click they had before.
    """
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    first = make_user(congregation.id, "Ana")
    second = make_user(congregation.id, "Bruno")
    previous = service.designate(congregation.id, territory.id, first.id, now=EARLIER)

    current = service.designate(congregation.id, territory.id, second.id)

    assert previous.completed_at == NOW
    assert current.started_at == NOW
    assert current.completed_at is None
    assert territory.assigned_user_id == second.id
    assert [a.id for a in service.list(congregation.id, territory.id)] == [
        current.id,
        previous.id,
    ]


def test_complete_closes_the_open_assignment_and_frees_the_territory(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id)
    service.designate(congregation.id, territory.id, publisher.id, now=EARLIER)

    completed = service.complete(congregation.id, territory.id)

    assert completed.completed_at == NOW
    assert completed.started_at == EARLIER
    assert territory.assigned_user_id is None
    assert [a.id for a in service.list(congregation.id, territory.id)] == [completed.id]


def test_delete_of_a_completed_record_leaves_the_open_assignment_untouched(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    first = make_user(congregation.id, "Ana")
    second = make_user(congregation.id, "Bruno")
    previous = service.designate(congregation.id, territory.id, first.id, now=EARLIER)
    current = service.designate(congregation.id, territory.id, second.id)

    service.delete(congregation.id, previous.id)

    assert territory.assigned_user_id == second.id
    assert [a.id for a in service.list(congregation.id, territory.id)] == [current.id]


def test_delete_of_the_open_record_frees_the_territory(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id)
    assignment = service.designate(congregation.id, territory.id, publisher.id)

    service.delete(congregation.id, assignment.id)

    assert territory.assigned_user_id is None
    assert service.list(congregation.id, territory.id) == []


def test_delete_of_the_open_record_does_not_reopen_the_completed_one_before_it(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    """Erasing the current holder frees the territory; it does not rewind to the last.

    A completed assignment stays completed -- its two dates are a closed stretch of
    time on the card. The projection is recomputed from the assignments that are
    still open, and after this deletion there are none.
    """
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    first = make_user(congregation.id, "Ana")
    second = make_user(congregation.id, "Bruno")
    previous = service.designate(congregation.id, territory.id, first.id, now=EARLIER)
    current = service.designate(congregation.id, territory.id, second.id)

    service.delete(congregation.id, current.id)

    assert territory.assigned_user_id is None
    assert [a.id for a in service.list(congregation.id, territory.id)] == [previous.id]


def test_list_gives_the_history_most_recent_first(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id)
    oldest = service.designate(congregation.id, territory.id, publisher.id, now=EARLIER)
    middle = service.designate(
        congregation.id, territory.id, publisher.id, now=NOW - timedelta(days=10)
    )
    newest = service.designate(congregation.id, territory.id, publisher.id)

    history = service.list(congregation.id, territory.id)

    assert [a.id for a in history] == [newest.id, middle.id, oldest.id]


def test_list_of_a_territory_of_another_congregation_is_not_found(
    service: AssignmentService,
    make_congregation,
    make_territory,
) -> None:
    ours = make_congregation("Central", "São Paulo")
    theirs = make_congregation("Norte", "São Paulo")
    stranger = make_territory(theirs.id)

    with pytest.raises(NotFoundError):
        service.list(ours.id, stranger.id)


def test_designate_with_a_nonexistent_territory_id_is_not_found(
    service: AssignmentService,
    make_congregation,
    make_user,
) -> None:
    congregation = make_congregation()
    publisher = make_user(congregation.id)

    with pytest.raises(NotFoundError):
        service.designate(congregation.id, uuid4(), publisher.id)


def test_designate_of_a_territory_of_another_congregation_is_not_found(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    ours = make_congregation("Central", "São Paulo")
    theirs = make_congregation("Norte", "São Paulo")
    stranger = make_territory(theirs.id)
    publisher = make_user(ours.id)

    with pytest.raises(NotFoundError):
        service.designate(ours.id, stranger.id, publisher.id)


def test_designate_with_a_nonexistent_user_id_is_not_found(
    service: AssignmentService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)

    with pytest.raises(NotFoundError):
        service.designate(congregation.id, territory.id, uuid4())


def test_designate_with_a_user_of_another_congregation_is_not_found(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    """The same generic failure as a missing territory, on purpose.

    Telling the two apart would confirm that an id names a real publisher
    somewhere, which is precisely what the congregation boundary is there to hide.
    """
    ours = make_congregation("Central", "São Paulo")
    theirs = make_congregation("Norte", "São Paulo")
    territory = make_territory(ours.id)
    stranger = make_user(theirs.id)

    with pytest.raises(NotFoundError):
        service.designate(ours.id, territory.id, stranger.id)


def test_designate_accepts_an_inactive_publisher(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    """Deactivation revokes app access, not the record of who is responsible."""
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    inactive = make_user(congregation.id, is_active=False)

    assignment = service.designate(congregation.id, territory.id, inactive.id)

    assert assignment.user_id == inactive.id
    assert territory.assigned_user_id == inactive.id


def test_complete_of_a_territory_of_another_congregation_is_not_found(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    ours = make_congregation("Central", "São Paulo")
    theirs = make_congregation("Norte", "São Paulo")
    stranger = make_territory(theirs.id)
    service.designate(theirs.id, stranger.id, make_user(theirs.id).id)

    with pytest.raises(NotFoundError):
        service.complete(ours.id, stranger.id)


def test_complete_without_an_open_assignment_is_not_found(
    service: AssignmentService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)

    with pytest.raises(NotFoundError):
        service.complete(congregation.id, territory.id)


def test_delete_with_a_nonexistent_assignment_id_is_not_found(
    service: AssignmentService,
    make_congregation,
) -> None:
    congregation = make_congregation()

    with pytest.raises(NotFoundError):
        service.delete(congregation.id, uuid4())


def test_delete_of_an_assignment_of_another_congregation_is_not_found(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    ours = make_congregation("Central", "São Paulo")
    theirs = make_congregation("Norte", "São Paulo")
    stranger_territory = make_territory(theirs.id)
    stranger = service.designate(theirs.id, stranger_territory.id, make_user(theirs.id).id)

    with pytest.raises(NotFoundError):
        service.delete(ours.id, stranger.id)

    assert service.list(theirs.id, stranger_territory.id) == [stranger]


def test_list_all_gives_every_assignment_of_the_congregation_most_recent_first(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    """The History page reads the congregation whole, not one territory at a time."""
    congregation = make_congregation()
    centro = make_territory(congregation.id, "Centro")
    bairro = make_territory(congregation.id, "Bairro")
    publisher = make_user(congregation.id)
    older = service.designate(congregation.id, centro.id, publisher.id, now=EARLIER)
    newer = service.designate(congregation.id, bairro.id, publisher.id)

    history = service.list_all(congregation.id)

    assert [a.id for a in history] == [newer.id, older.id]


def test_list_all_mixes_open_and_completed_assignments_in_the_same_list(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    """The listing is the history, not the archive: what is in force belongs in it too."""
    congregation = make_congregation()
    centro = make_territory(congregation.id, "Centro")
    bairro = make_territory(congregation.id, "Bairro")
    publisher = make_user(congregation.id)
    completed = service.designate(congregation.id, centro.id, publisher.id, now=EARLIER)
    service.complete(congregation.id, centro.id, now=NOW - timedelta(days=20))
    still_open = service.designate(congregation.id, bairro.id, publisher.id)

    history = service.list_all(congregation.id)

    assert [a.id for a in history] == [still_open.id, completed.id]
    assert history[0].completed_at is None
    assert history[1].completed_at == NOW - timedelta(days=20)


def test_list_all_of_a_congregation_without_assignments_is_empty(
    service: AssignmentService,
    make_congregation,
    make_territory,
) -> None:
    congregation = make_congregation()
    make_territory(congregation.id)

    assert service.list_all(congregation.id) == []


def test_list_all_does_not_show_the_assignment_of_another_congregation(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    ours = make_congregation("Central", "São Paulo")
    theirs = make_congregation("Norte", "São Paulo")
    our_territory = make_territory(ours.id)
    their_territory = make_territory(theirs.id)
    mine = service.designate(ours.id, our_territory.id, make_user(ours.id).id)
    service.designate(theirs.id, their_territory.id, make_user(theirs.id).id)

    assert [a.id for a in service.list_all(ours.id)] == [mine.id]


def test_list_page_passes_the_congregation_filters_and_offset_to_the_repository() -> None:
    class RecordingAssignments:
        def __init__(self) -> None:
            self.arguments = None

        def list_page_by_congregation(self, congregation_id, **kwargs):
            self.arguments = (congregation_id, kwargs)
            return [], 9

    repository = RecordingAssignments()
    service = AssignmentService(
        assignments=repository,  # type: ignore[arg-type]
        territories=None,  # type: ignore[arg-type]
        users=None,  # type: ignore[arg-type]
        now_provider=lambda: NOW,
    )
    congregation_id = uuid4()
    publisher_id = uuid4()
    territory_id = uuid4()

    items, total = service.list_page(
        congregation_id,
        publisher_id=publisher_id,
        territory_id=territory_id,
        from_instant=EARLIER,
        to_instant=NOW,
        page=3,
        page_size=4,
    )

    assert (items, total) == ([], 9)
    assert repository.arguments == (
        congregation_id,
        {
            "publisher_id": publisher_id,
            "territory_id": territory_id,
            "from_instant": EARLIER,
            "to_instant": NOW,
            "limit": 4,
            "offset": 8,
        },
    )


def test_designate_stores_the_publishers_name_on_the_assignment(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    """The S-13 line names the person, so it stays readable after they are deleted."""
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id, name="Bruno")

    assignment = service.designate(congregation.id, territory.id, publisher.id)

    assert (assignment.user_id, assignment.user_name) == (publisher.id, "Bruno")


def test_renaming_the_publisher_afterwards_does_not_rewrite_the_assignments_already_opened(
    service: AssignmentService,
    session: Session,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    """The name on the line is a photograph, not a live view.

    Accepted price of dropping the foreign key, and precisely what lets the card
    survive the deletion of the person it names.
    """
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id, name="Bruno")
    assignment = service.designate(congregation.id, territory.id, publisher.id)

    publisher.name = "Bruno Alves"
    session.flush()

    assert assignment.user_name == "Bruno"


def test_update_assignment_publisher(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher1 = make_user(congregation.id, name="Bruno")
    publisher2 = make_user(congregation.id, name="Carlos")
    assignment = service.designate(congregation.id, territory.id, publisher1.id)

    updated = service.update(
        congregation.id,
        assignment.id,
        territory_id=territory.id,
        user_id=publisher2.id,
    )

    assert updated.user_id == publisher2.id
    assert updated.user_name == "Carlos"
    assert territory.assigned_user_id == publisher2.id


def test_update_assignment_dates(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id, name="Bruno")
    assignment = service.designate(congregation.id, territory.id, publisher.id)
    service.complete(congregation.id, territory.id)

    new_start = NOW - timedelta(days=20)
    new_end = NOW - timedelta(days=5)
    updated = service.update(
        congregation.id,
        assignment.id,
        territory_id=territory.id,
        started_at=new_start,
        completed_at=new_end,
    )

    assert updated.started_at == new_start
    assert updated.completed_at == new_end


def test_update_assignment_reopen_and_conflict(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    from app.core.exceptions import OpenAssignmentConflictError

    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id, name="Bruno")
    past = service.designate(congregation.id, territory.id, publisher.id)
    service.complete(congregation.id, territory.id)

    # Reopen when free
    reopened = service.update(
        congregation.id,
        past.id,
        territory_id=territory.id,
        clear_completed_at=True,
    )
    assert reopened.completed_at is None
    assert territory.assigned_user_id == publisher.id

    # Complete it again and create another open one
    service.complete(congregation.id, territory.id)
    publisher2 = make_user(congregation.id, name="Daniel")
    service.designate(congregation.id, territory.id, publisher2.id)

    # Reopening past now should raise conflict
    with pytest.raises(OpenAssignmentConflictError):
        service.update(
            congregation.id,
            past.id,
            territory_id=territory.id,
            clear_completed_at=True,
        )


def test_update_assignment_invalid_dates_fails(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    from app.core.exceptions import InvalidAssignmentDatesError

    congregation = make_congregation()
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id, name="Bruno")
    assignment = service.designate(congregation.id, territory.id, publisher.id)

    with pytest.raises(InvalidAssignmentDatesError):
        service.update(
            congregation.id,
            assignment.id,
            territory_id=territory.id,
            started_at=NOW,
            completed_at=NOW - timedelta(days=1),
        )


def test_update_assignment_not_found(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    congregation = make_congregation()
    other_congregation = make_congregation(name="Outra", city="Outra")
    territory = make_territory(congregation.id)
    publisher = make_user(congregation.id, name="Bruno")
    other_publisher = make_user(other_congregation.id, name="Estranho")
    assignment = service.designate(congregation.id, territory.id, publisher.id)

    # Nonexistent assignment
    with pytest.raises(NotFoundError):
        service.update(congregation.id, uuid4())

    # Wrong territory
    with pytest.raises(NotFoundError):
        service.update(congregation.id, assignment.id, territory_id=uuid4())

    # Other congregation's publisher
    with pytest.raises(NotFoundError):
        service.update(congregation.id, assignment.id, user_id=other_publisher.id)


def test_open_started_by_territory_maps_each_open_assignment_to_its_start(
    service: AssignmentService,
    make_congregation,
    make_territory,
    make_user,
) -> None:
    """Only the assignment in force counts, and only inside the caller's congregation."""
    congregation = make_congregation()
    other = make_congregation(name="Norte", city="Contagem")
    out = make_territory(congregation.id, "Centro")
    returned = make_territory(congregation.id, "Vila")
    free = make_territory(congregation.id, "Livre")
    foreign = make_territory(other.id, "Centro")
    publisher = make_user(congregation.id)
    service.designate(congregation.id, out.id, publisher.id, now=EARLIER)
    service.designate(congregation.id, returned.id, publisher.id, now=EARLIER)
    service.complete(congregation.id, returned.id)
    service.designate(other.id, foreign.id, make_user(other.id).id)

    started = service.open_started_by_territory(congregation.id)

    assert started == {out.id: EARLIER}
    assert free.id not in started

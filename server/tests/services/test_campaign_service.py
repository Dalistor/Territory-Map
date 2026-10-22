"""Behaviour of campaigns: several territories, several publishers, one period at a time.

Run against the real database for the reason the assignment suite gives: the rules here
lean on two partial unique indexes (one open period per campaign, one open line per
territory) and on the projection refresh of `TerritoryRepository.set_assigned_user`, and
a fake would answer both from Python.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from app.core.exceptions import (
    CampaignActiveError,
    CampaignWithoutPublishersError,
    DuplicateNameError,
    NotFoundError,
    TerritoryInCampaignError,
)
from app.core.geo import LatLng, points_to_wkt
from app.models.territory import Territory
from app.models.user import User
from app.repositories.campaign import CampaignRepository
from app.repositories.territory import TerritoryRepository
from app.repositories.territory_assignment import TerritoryAssignmentRepository
from app.repositories.user import UserRepository
from app.services.assignment import AssignmentService
from app.services.campaign import CampaignService
from sqlalchemy.orm import Session

NOW = datetime(2026, 10, 22, 12, 0, tzinfo=UTC)
EARLIER = NOW - timedelta(days=30)
LATER = NOW + timedelta(days=10)


def square(lat: float, lng: float, size: float = 1.0) -> list[LatLng]:
    return [
        LatLng(lat, lng),
        LatLng(lat, lng + size),
        LatLng(lat + size, lng + size),
        LatLng(lat + size, lng),
    ]


@pytest.fixture
def service(session: Session) -> CampaignService:
    return CampaignService(
        campaigns=CampaignRepository(session),
        assignments=TerritoryAssignmentRepository(session),
        territories=TerritoryRepository(session),
        users=UserRepository(session),
        now_provider=lambda: NOW,
    )


@pytest.fixture
def assignments(session: Session) -> AssignmentService:
    return AssignmentService(
        assignments=TerritoryAssignmentRepository(session),
        territories=TerritoryRepository(session),
        users=UserRepository(session),
        now_provider=lambda: EARLIER,
    )


@pytest.fixture
def make_territory(session: Session) -> Callable[..., Territory]:
    drawn = 0

    def _make(congregation_id: UUID, name: str) -> Territory:
        nonlocal drawn
        territory = TerritoryRepository(session).create(
            congregation_id, name, points_to_wkt(square(float(drawn * 2), 0.0))
        )
        drawn += 1
        return territory

    return _make


@pytest.fixture
def make_user(session: Session) -> Callable[..., User]:
    def _make(congregation_id: UUID, name: str) -> User:
        return UserRepository(session).create(congregation_id=congregation_id, name=name)

    return _make


@pytest.fixture
def scene(make_congregation, make_territory, make_user):
    """A congregation with three territories and three publishers, nothing designated."""
    congregation = make_congregation()
    return {
        "congregation": congregation,
        "n3": make_territory(congregation.id, "N3"),
        "n5": make_territory(congregation.id, "N5"),
        "n8": make_territory(congregation.id, "N8"),
        "ana": make_user(congregation.id, "Ana"),
        "bruno": make_user(congregation.id, "Bruno"),
        "carla": make_user(congregation.id, "Carla"),
    }


def ids(*rows) -> list[UUID]:
    return [row.id for row in rows]


# -- create, rename, list, delete ---------------------------------------------------


def test_create_groups_the_territories_under_a_name(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]

    campaign = service.create(
        congregation.id, "Celebração", ids(scene["n8"], scene["n3"], scene["n3"])
    )

    assert campaign.name == "Celebração"
    assert [t.name for t in campaign.territories] == ["N3", "N8"]
    assert [c.id for c in service.list(congregation.id)] == [campaign.id]
    assert service.get(congregation.id, campaign.id) is campaign


def test_a_repeated_name_in_the_congregation_is_refused(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]
    service.create(congregation.id, "Celebração", ids(scene["n3"]))

    with pytest.raises(DuplicateNameError, match="campanha"):
        service.create(congregation.id, "Celebração", ids(scene["n5"]))


def test_renaming_to_the_name_of_another_campaign_is_refused(
    service: CampaignService, scene
) -> None:
    congregation = scene["congregation"]
    service.create(congregation.id, "Celebração", ids(scene["n3"]))
    other = service.create(congregation.id, "Assembleia", ids(scene["n5"]))

    with pytest.raises(DuplicateNameError):
        service.update(congregation.id, other.id, name="Celebração")

    assert service.update(congregation.id, other.id, name="Assembleia").name == "Assembleia"
    assert service.update(congregation.id, other.id, name="Convite").name == "Convite"


def test_a_territory_of_another_congregation_is_not_found(
    service: CampaignService, scene, make_congregation, make_territory
) -> None:
    stranger = make_territory(make_congregation(name="Outra").id, "Longe")

    with pytest.raises(NotFoundError):
        service.create(scene["congregation"].id, "Celebração", ids(stranger))


def test_a_campaign_of_another_congregation_is_not_found(
    service: CampaignService, scene, make_congregation
) -> None:
    campaign = service.create(scene["congregation"].id, "Celebração", ids(scene["n3"]))
    other = make_congregation(name="Outra")

    with pytest.raises(NotFoundError):
        service.get(other.id, campaign.id)
    with pytest.raises(NotFoundError):
        service.delete(other.id, campaign.id)


def test_deleting_an_inactive_campaign_removes_it(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))

    service.delete(congregation.id, campaign.id)

    with pytest.raises(NotFoundError):
        service.get(congregation.id, campaign.id)


def test_deleting_an_active_campaign_is_refused(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))
    service.designate(congregation.id, campaign.id, ids(scene["ana"]))

    with pytest.raises(CampaignActiveError, match="conclu"):
        service.delete(congregation.id, campaign.id)


def test_changing_the_territories_of_an_inactive_campaign_only_regroups_them(
    service: CampaignService, scene, session: Session
) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))

    updated = service.update(congregation.id, campaign.id, territory_ids=ids(scene["n5"]))

    assert [t.name for t in updated.territories] == ["N5"]
    assert TerritoryAssignmentRepository(session).get_open(scene["n5"].id) is None


# -- designate ----------------------------------------------------------------------


def test_designating_replaces_the_dirigente_of_every_territory(
    service: CampaignService, assignments: AssignmentService, scene, session: Session
) -> None:
    congregation = scene["congregation"]
    previous = assignments.designate(congregation.id, scene["n5"].id, scene["carla"].id)
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"], scene["n5"]))

    service.designate(congregation.id, campaign.id, ids(scene["ana"], scene["bruno"], scene["ana"]))

    period = campaign.designations[0]
    assert period.started_at == NOW
    assert period.completed_at is None
    assert sorted(p.user_name for p in period.publishers) == ["Ana", "Bruno"]
    assert previous.completed_at == NOW
    card = TerritoryAssignmentRepository(session)
    for territory in (scene["n3"], scene["n5"]):
        line = card.get_open(territory.id)
        assert line.campaign_designation_id == period.id
        assert line.user_id is None
        assert line.started_at == NOW
        assert territory.assigned_user_id is None


def test_designating_without_publishers_is_refused(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))

    with pytest.raises(CampaignWithoutPublishersError):
        service.designate(congregation.id, campaign.id, [])


def test_designating_a_publisher_of_another_congregation_is_not_found(
    service: CampaignService, scene, make_congregation, make_user
) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))
    stranger = make_user(make_congregation(name="Outra").id, "Zé")

    with pytest.raises(NotFoundError):
        service.designate(congregation.id, campaign.id, ids(stranger))


def test_designating_twice_while_open_is_refused(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))
    service.designate(congregation.id, campaign.id, ids(scene["ana"]))

    with pytest.raises(CampaignActiveError, match="publicadores"):
        service.designate(congregation.id, campaign.id, ids(scene["bruno"]))


def test_a_territory_in_another_active_campaign_is_refused_naming_both(
    service: CampaignService, scene, session: Session
) -> None:
    congregation = scene["congregation"]
    first = service.create(congregation.id, "Celebração", ids(scene["n5"]))
    service.designate(congregation.id, first.id, ids(scene["ana"]))
    second = service.create(congregation.id, "Assembleia", ids(scene["n3"], scene["n5"]))

    with pytest.raises(TerritoryInCampaignError) as refused:
        service.designate(congregation.id, second.id, ids(scene["bruno"]))

    assert "N5" in refused.value.message
    assert "Celebração" in refused.value.message
    assert CampaignRepository(session).get_open_designation(second.id) is None
    assert TerritoryAssignmentRepository(session).get_open(scene["n3"].id) is None


# -- publishers, complete -----------------------------------------------------------


def test_the_publishers_of_the_open_period_can_be_swapped(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))
    service.designate(congregation.id, campaign.id, ids(scene["ana"], scene["bruno"]))

    service.set_publishers(congregation.id, campaign.id, ids(scene["bruno"], scene["carla"]))

    period = campaign.designations[0]
    assert sorted(p.user_name for p in period.publishers) == ["Bruno", "Carla"]


def test_swapping_publishers_needs_an_open_period(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))

    with pytest.raises(NotFoundError):
        service.set_publishers(congregation.id, campaign.id, ids(scene["ana"]))
    with pytest.raises(CampaignWithoutPublishersError):
        service.set_publishers(congregation.id, campaign.id, [])


def test_completing_closes_the_period_and_every_line_with_the_same_date(
    service: CampaignService, scene, session: Session
) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"], scene["n5"]))
    service.designate(congregation.id, campaign.id, ids(scene["ana"]), now=EARLIER)
    card = TerritoryAssignmentRepository(session)
    lines = [card.get_open(scene["n3"].id), card.get_open(scene["n5"].id)]

    service.complete(congregation.id, campaign.id)

    assert campaign.designations[0].completed_at == NOW
    assert [line.completed_at for line in lines] == [NOW, NOW]
    assert card.get_open(scene["n3"].id) is None
    assert scene["n3"].assigned_user_id is None


def test_a_completed_campaign_can_be_designated_again(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))
    service.designate(congregation.id, campaign.id, ids(scene["ana"]), now=EARLIER)
    service.complete(congregation.id, campaign.id, now=EARLIER)

    service.designate(congregation.id, campaign.id, ids(scene["bruno"]))

    assert [d.completed_at for d in campaign.designations] == [None, EARLIER]


def test_completing_needs_an_open_period(service: CampaignService, scene) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))

    with pytest.raises(NotFoundError):
        service.complete(congregation.id, campaign.id)


# -- territories of an active campaign ---------------------------------------------


def test_adding_a_territory_to_an_active_campaign_replaces_its_dirigente(
    service: CampaignService, assignments: AssignmentService, scene, session: Session
) -> None:
    congregation = scene["congregation"]
    previous = assignments.designate(congregation.id, scene["n8"].id, scene["carla"].id)
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))
    service.designate(congregation.id, campaign.id, ids(scene["ana"]), now=EARLIER)

    service.update(
        congregation.id, campaign.id, territory_ids=ids(scene["n3"], scene["n8"]), now=LATER
    )

    line = TerritoryAssignmentRepository(session).get_open(scene["n8"].id)
    assert previous.completed_at == LATER
    assert line.campaign_designation_id == campaign.designations[0].id
    assert line.started_at == LATER
    assert scene["n8"].assigned_user_id is None


def test_removing_a_territory_from_an_active_campaign_closes_its_line(
    service: CampaignService, scene, session: Session
) -> None:
    congregation = scene["congregation"]
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"], scene["n5"]))
    service.designate(congregation.id, campaign.id, ids(scene["ana"]), now=EARLIER)
    card = TerritoryAssignmentRepository(session)
    line = card.get_open(scene["n5"].id)

    service.update(congregation.id, campaign.id, territory_ids=ids(scene["n3"]))

    assert line.completed_at == NOW
    assert card.get_open(scene["n5"].id) is None
    assert card.get_open(scene["n3"].id).completed_at is None
    assert scene["n5"].assigned_user_id is None


def test_adding_a_territory_held_by_another_active_campaign_is_refused(
    service: CampaignService, scene
) -> None:
    congregation = scene["congregation"]
    other = service.create(congregation.id, "Assembleia", ids(scene["n5"]))
    service.designate(congregation.id, other.id, ids(scene["bruno"]))
    campaign = service.create(congregation.id, "Celebração", ids(scene["n3"]))
    service.designate(congregation.id, campaign.id, ids(scene["ana"]))

    with pytest.raises(TerritoryInCampaignError, match="Assembleia"):
        service.update(congregation.id, campaign.id, territory_ids=ids(scene["n3"], scene["n5"]))


# -- what the phone reads -----------------------------------------------------------


def test_the_publisher_sees_only_the_active_campaigns_they_are_in(
    service: CampaignService, scene
) -> None:
    congregation = scene["congregation"]
    mine = service.create(congregation.id, "Celebração", ids(scene["n3"]))
    service.designate(congregation.id, mine.id, ids(scene["ana"], scene["bruno"]))
    finished = service.create(congregation.id, "Assembleia", ids(scene["n5"]))
    service.designate(congregation.id, finished.id, ids(scene["ana"]), now=EARLIER)
    service.complete(congregation.id, finished.id)
    theirs = service.create(congregation.id, "Convite", ids(scene["n8"]))
    service.designate(congregation.id, theirs.id, ids(scene["carla"]))

    periods = service.active_for_publisher(scene["ana"])

    assert [p.campaign.name for p in periods] == ["Celebração"]
    assert [t.name for t in periods[0].campaign.territories] == ["N3"]


def test_an_unknown_campaign_id_is_not_found(service: CampaignService, scene) -> None:
    with pytest.raises(NotFoundError):
        service.designate(scene["congregation"].id, uuid4(), ids(scene["ana"]))

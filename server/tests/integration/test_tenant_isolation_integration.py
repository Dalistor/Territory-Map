"""Two congregations on the same streets, and the wall between their data.

The overlap is the point. Congregations are not carved out of a map by this system --
two of them really can cover the same neighbourhood, and the rule that forbids
territories from invading each other is scoped to one congregation for exactly that
reason. So these flows draw the *same square* twice, once for each tenant, and then
check that geometry buys nobody anything: what a caller may see is decided by the
token, and only by the token.

The failures this guards against are the quiet kind. A repository that forgot one
`congregation_id` filter, a route that read a tenant from a path parameter instead of
from the credential, a service that resolved a block by id alone -- each of those keeps
every other test in the suite green while handing one congregation another's map. And
the answer is always 404, never 403: a 403 would confirm the id names something real
somewhere else, which is the one fact the boundary exists to withhold.
"""

from datetime import UTC, datetime, timedelta

import pytest

pytestmark = pytest.mark.anyio


def an_hour_ago() -> datetime:
    return (datetime.now(UTC) - timedelta(hours=1)).replace(microsecond=0)


class Tenant:
    """One congregation, its admin token, and the map and people behind it."""

    def __init__(self, admin_token: str) -> None:
        self.admin_token = admin_token
        self.app_token: str = ""
        self.user_id: str = ""
        self.territory_id: str = ""
        self.block_id: str = ""


async def build_tenant(api, register_congregation, square, *, name: str, city: str) -> Tenant:
    """Provision a congregation and give it a publisher, a territory and a block.

    Every tenant is built over the same ring, so the two ends up geographically on top
    of each other -- which is legal, and is what makes the isolation checks meaningful.
    """
    register_congregation(name=name, city=city)
    signed_in = await api.login(name, city)
    tenant = Tenant(signed_in.json()["access_token"])

    registered = await api.register_publisher(tenant.admin_token, f"Publicador de {name}")
    tenant.user_id = registered.json()["id"]
    tenant.app_token = (await api.activate(registered.json()["access_code"])).json()["token"]

    drawn = await api.draw_territory(tenant.admin_token, "Centro", square(-18.90, -48.30))
    assert drawn.status_code == 201, drawn.text
    tenant.territory_id = drawn.json()["id"]

    block = await api.draw_block(
        tenant.admin_token,
        tenant.territory_id,
        square(-18.899, -48.299, side=0.002),
    )
    assert block.status_code == 201, block.text
    tenant.block_id = block.json()["id"]
    return tenant


@pytest.fixture
async def tenants(api, register_congregation, square) -> tuple[Tenant, Tenant]:
    """Two congregations covering exactly the same square of the city."""
    first = await build_tenant(
        api, register_congregation, square, name="Central", city="Uberlândia"
    )
    second = await build_tenant(api, register_congregation, square, name="Norte", city="Contagem")
    return first, second


async def test_two_congregations_may_demarcate_the_very_same_area(tenants):
    """The setup itself is an assertion: neither drawing was refused as an overlap.

    `find_overlapping` only ever looks inside one congregation, and if it did not, the
    second tenant here could not exist at all.
    """
    first, second = tenants
    assert first.territory_id != second.territory_id


async def test_each_admin_lists_only_their_own_territories(api, tenants):
    first, second = tenants

    mine = await api.list_territories(first.admin_token)
    theirs = await api.list_territories(second.admin_token)

    assert [item["id"] for item in mine.json()] == [first.territory_id]
    assert [item["id"] for item in theirs.json()] == [second.territory_id]


async def test_each_admin_lists_only_their_own_publishers(api, tenants):
    first, second = tenants

    mine = await api.list_publishers(first.admin_token)

    assert [person["name"] for person in mine.json()] == ["Publicador de Central"]


async def test_the_phone_reads_only_the_map_of_its_own_congregation(api, tenants):
    """Same coordinates on both sides, so only the token can tell the maps apart."""
    first, second = tenants

    read = await api.read_map(first.app_token)

    assert [territory["id"] for territory in read.json()] == [first.territory_id]


async def test_an_admin_cannot_read_a_territory_of_the_other_congregation(api, tenants):
    first, second = tenants

    response = await api.read_territory(first.admin_token, second.territory_id)

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_an_admin_cannot_redraw_or_delete_a_territory_of_the_other_congregation(
    api, tenants, square
):
    """A 404 that also has to be true afterwards: the other map must be untouched."""
    first, second = tenants

    redraw = await api.redraw_territory(
        first.admin_token, second.territory_id, square(-19.5, -47.5)
    )
    removal = await api.delete_territory(first.admin_token, second.territory_id)

    assert (redraw.status_code, removal.status_code) == (404, 404)
    survivor = await api.read_territory(second.admin_token, second.territory_id)
    assert survivor.status_code == 200
    assert survivor.json()["boundary"][0] == {"lat": -18.90, "lng": -48.30}


async def test_an_admin_cannot_read_the_work_history_of_the_other_congregation(api, tenants):
    first, second = tenants
    await api.mark_worked(second.app_token, second.block_id, an_hour_ago())

    response = await api.work_logs(first.admin_token, second.block_id)

    assert response.status_code == 404


async def test_an_admin_cannot_reissue_a_code_for_the_other_congregations_publisher(api, tenants):
    """The worst of the cross-tenant writes: it would hand out a working credential."""
    first, second = tenants

    response = await api.new_access_code(first.admin_token, second.user_id)

    assert response.status_code == 404


async def test_an_admin_cannot_revoke_the_other_congregations_publisher(api, tenants):
    first, second = tenants

    response = await api.set_publisher_active(first.admin_token, second.user_id, is_active=False)

    assert response.status_code == 404
    assert (await api.read_map(second.app_token)).status_code == 200


async def test_a_phone_cannot_mark_a_block_of_the_other_congregation(api, tenants):
    first, second = tenants

    response = await api.mark_worked(first.app_token, second.block_id, an_hour_ago())

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    # Nothing was recorded on the block it tried to reach.
    history = await api.work_logs(second.admin_token, second.block_id)
    assert history.json() == []

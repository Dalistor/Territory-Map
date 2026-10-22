from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from app.models.campaign import Campaign
from app.models.campaign_designation import CampaignDesignation
from app.models.territory import Territory
from app.models.territory_assignment import TerritoryAssignment
from app.repositories.territory_assignment import TerritoryAssignmentRepository
from geoalchemy2 import WKTElement
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError


def make_territory(session, congregation_id, name: str) -> Territory:
    territory = Territory(
        congregation_id=congregation_id,
        name=name,
        boundary=WKTElement("POLYGON((-48 -23, -47 -23, -47 -22, -48 -22, -48 -23))", srid=4326),
    )
    session.add(territory)
    session.flush()
    return territory


def add_assignment(
    session,
    territory: Territory,
    *,
    started_at: datetime,
    completed_at: datetime | None = None,
    user_id=None,
    assignment_id=None,
) -> TerritoryAssignment:
    assignment = TerritoryAssignment(
        id=assignment_id or uuid4(),
        territory_id=territory.id,
        user_id=user_id or uuid4(),
        user_name="Publicador",
        started_at=started_at,
        completed_at=completed_at,
    )
    session.add(assignment)
    session.flush()
    return assignment


def test_lista_paginada_inclui_designacao_iniciada_antes_e_devolvida_no_intervalo(
    session, make_congregation
):
    congregation = make_congregation()
    territory = make_territory(session, congregation.id, "Centro")
    interval_start = datetime(2026, 9, 10, tzinfo=UTC)
    interval_end = datetime(2026, 9, 20, tzinfo=UTC)
    completed_inside = add_assignment(
        session,
        territory,
        started_at=datetime(2026, 9, 1, tzinfo=UTC),
        completed_at=datetime(2026, 9, 15, tzinfo=UTC),
    )

    items, total = TerritoryAssignmentRepository(session).list_page_by_congregation(
        congregation.id,
        from_instant=interval_start,
        to_instant=interval_end,
        limit=50,
        offset=0,
    )

    assert [assignment.id for assignment in items] == [completed_inside.id]
    assert total == 1
    assert all("territory" in assignment.__dict__ for assignment in items)


def test_lista_paginada_inclui_designacao_aberta_iniciada_antes_do_fim(session, make_congregation):
    congregation = make_congregation()
    territory = make_territory(session, congregation.id, "Centro")
    open_before_end = add_assignment(
        session,
        territory,
        started_at=datetime(2026, 9, 16, tzinfo=UTC),
    )

    items, total = TerritoryAssignmentRepository(session).list_page_by_congregation(
        congregation.id,
        from_instant=datetime(2026, 9, 10, tzinfo=UTC),
        to_instant=datetime(2026, 9, 20, tzinfo=UTC),
        limit=50,
        offset=0,
    )

    assert [assignment.id for assignment in items] == [open_before_end.id]
    assert total == 1


def test_lista_paginada_exclui_designacao_que_comeca_no_fim_exclusivo(session, make_congregation):
    congregation = make_congregation()
    territory = make_territory(session, congregation.id, "Centro")
    starts_at_exclusive_end = add_assignment(
        session,
        territory,
        started_at=datetime(2026, 9, 20, tzinfo=UTC),
        completed_at=datetime(2026, 9, 21, tzinfo=UTC),
    )

    items, total = TerritoryAssignmentRepository(session).list_page_by_congregation(
        congregation.id,
        from_instant=datetime(2026, 9, 10, tzinfo=UTC),
        to_instant=datetime(2026, 9, 20, tzinfo=UTC),
        limit=50,
        offset=0,
    )

    assert starts_at_exclusive_end.id not in {assignment.id for assignment in items}
    assert total == 0


def test_lista_paginada_aceita_devolucao_exatamente_no_inicio_do_periodo(
    session, make_congregation
):
    congregation = make_congregation()
    territory = make_territory(session, congregation.id, "Centro")
    completed_at_start = add_assignment(
        session,
        territory,
        started_at=datetime(2026, 9, 2, tzinfo=UTC),
        completed_at=datetime(2026, 9, 10, tzinfo=UTC),
    )

    items, total = TerritoryAssignmentRepository(session).list_page_by_congregation(
        congregation.id,
        from_instant=datetime(2026, 9, 10, tzinfo=UTC),
        to_instant=datetime(2026, 9, 20, tzinfo=UTC),
        limit=50,
        offset=0,
    )

    assert [assignment.id for assignment in items] == [completed_at_start.id]
    assert total == 1


def test_lista_paginada_combina_filtros_sem_vazar_outra_congregacao(session, make_congregation):
    congregation = make_congregation()
    other_congregation = make_congregation(name="Leste", city="Campinas")
    matching_territory = make_territory(session, congregation.id, "Centro")
    other_territory = make_territory(session, congregation.id, "Norte")
    foreign_territory = make_territory(session, other_congregation.id, "Centro")
    publisher_id = uuid4()
    matched = add_assignment(
        session,
        matching_territory,
        user_id=publisher_id,
        started_at=datetime(2026, 9, 12, tzinfo=UTC),
        completed_at=datetime(2026, 9, 13, tzinfo=UTC),
    )
    add_assignment(
        session,
        other_territory,
        user_id=publisher_id,
        started_at=datetime(2026, 9, 12, tzinfo=UTC),
        completed_at=datetime(2026, 9, 13, tzinfo=UTC),
    )
    add_assignment(
        session,
        matching_territory,
        user_id=uuid4(),
        started_at=datetime(2026, 9, 11, tzinfo=UTC),
        completed_at=datetime(2026, 9, 12, tzinfo=UTC),
    )
    foreign = add_assignment(
        session,
        foreign_territory,
        user_id=publisher_id,
        started_at=datetime(2026, 9, 12, tzinfo=UTC),
        completed_at=datetime(2026, 9, 13, tzinfo=UTC),
    )

    items, total = TerritoryAssignmentRepository(session).list_page_by_congregation(
        congregation.id,
        publisher_id=publisher_id,
        territory_id=matching_territory.id,
        limit=50,
        offset=0,
    )

    assert [assignment.id for assignment in items] == [matched.id]
    assert total == 1
    assert foreign.id not in {assignment.id for assignment in items}


def test_lista_paginada_desempata_por_id_sem_repetir_ou_pular_linhas(session, make_congregation):
    congregation = make_congregation()
    territory = make_territory(session, congregation.id, "Centro")
    started_at = datetime(2026, 9, 12, tzinfo=UTC)
    assignment_ids = [
        UUID("00000000-0000-0000-0000-000000000001"),
        UUID("00000000-0000-0000-0000-000000000002"),
        UUID("00000000-0000-0000-0000-000000000003"),
    ]
    for assignment_id in assignment_ids:
        add_assignment(
            session,
            territory,
            assignment_id=assignment_id,
            started_at=started_at,
            completed_at=datetime(2026, 9, 13, tzinfo=UTC),
        )

    first_page, total = TerritoryAssignmentRepository(session).list_page_by_congregation(
        congregation.id,
        limit=2,
        offset=0,
    )
    second_page, second_total = TerritoryAssignmentRepository(session).list_page_by_congregation(
        congregation.id,
        limit=2,
        offset=2,
    )

    assert [assignment.id for assignment in first_page] == assignment_ids[:0:-1]
    assert [assignment.id for assignment in second_page] == assignment_ids[:1]
    assert total == second_total == 3


def open_campaign_period(session, congregation_id, name: str = "Celebração"):
    """A campaign with an open designation period, written straight through the models."""

    campaign = Campaign(congregation_id=congregation_id, name=name)
    session.add(campaign)
    session.flush()
    period = CampaignDesignation(
        campaign_id=campaign.id, started_at=datetime(2026, 10, 1, tzinfo=UTC)
    )
    session.add(period)
    session.flush()
    return period


def test_linha_sem_publicador_e_sem_campanha_e_recusada_pelo_banco(session, make_congregation):
    """The CHECK is what keeps the card from ever holding a row that names nobody."""

    congregation = make_congregation()
    territory = make_territory(session, congregation.id, "Centro")
    session.add(
        TerritoryAssignment(territory_id=territory.id, started_at=datetime(2026, 10, 1, tzinfo=UTC))
    )

    with pytest.raises(IntegrityError, match="ck_territory_assignments_author"):
        session.flush()


def test_linha_de_campanha_dispensa_publicador(session, make_congregation):
    congregation = make_congregation()
    territory = make_territory(session, congregation.id, "Centro")
    period = open_campaign_period(session, congregation.id)

    line = TerritoryAssignment(
        territory_id=territory.id,
        campaign_designation_id=period.id,
        started_at=datetime(2026, 10, 1, tzinfo=UTC),
    )
    session.add(line)
    session.flush()

    assert line.user_id is None
    assert line.campaign_designation.campaign.name == "Celebração"


def test_linha_de_campanha_e_designacao_individual_nao_ficam_abertas_juntas(
    session, make_congregation
):
    """`uq_territory_assignments_open` counts the campaign line like any other open row."""

    congregation = make_congregation()
    territory = make_territory(session, congregation.id, "Centro")
    add_assignment(session, territory, started_at=datetime(2026, 9, 1, tzinfo=UTC))
    period = open_campaign_period(session, congregation.id)
    session.add(
        TerritoryAssignment(
            territory_id=territory.id,
            campaign_designation_id=period.id,
            started_at=datetime(2026, 10, 1, tzinfo=UTC),
        )
    )

    with pytest.raises(IntegrityError, match="uq_territory_assignments_open"):
        session.flush()


def test_campanha_tem_no_maximo_um_periodo_aberto(session, make_congregation):

    congregation = make_congregation()
    period = open_campaign_period(session, congregation.id)
    session.add(
        CampaignDesignation(
            campaign_id=period.campaign_id, started_at=datetime(2026, 10, 2, tzinfo=UTC)
        )
    )

    with pytest.raises(IntegrityError, match="uq_campaign_designations_open"):
        session.flush()


def test_apagar_a_campanha_leva_as_linhas_dela_no_cartao(session, make_congregation):
    """CASCADE from campaign to period to card line: the row only means something with it."""

    congregation = make_congregation()
    territory = make_territory(session, congregation.id, "Centro")
    period = open_campaign_period(session, congregation.id)
    line = TerritoryAssignment(
        territory_id=territory.id,
        campaign_designation_id=period.id,
        started_at=datetime(2026, 10, 1, tzinfo=UTC),
    )
    session.add(line)
    session.flush()
    line_id = line.id

    session.delete(period.campaign)
    session.flush()
    session.expunge_all()

    assert (
        session.scalars(
            select(TerritoryAssignment).where(TerritoryAssignment.id == line_id)
        ).one_or_none()
        is None
    )

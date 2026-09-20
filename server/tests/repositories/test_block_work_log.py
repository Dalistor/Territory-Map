from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.models.block import Block
from app.models.block_work_log import BlockWorkLog
from app.models.territory import Territory
from app.repositories.block_work_log import BlockWorkLogRepository
from geoalchemy2 import WKTElement


def rectangle_wkt(left: float, right: float, bottom: float, top: float) -> str:
    return (
        f"POLYGON(({left} {bottom}, {right} {bottom}, "
        f"{right} {top}, {left} {top}, {left} {bottom}))"
    )


def test_lista_o_ultimo_trabalho_do_territorio_com_nome_preservado(
    session,
    make_congregation,
):
    congregation = make_congregation()
    territory = Territory(
        congregation_id=congregation.id,
        name="Centro",
        boundary=WKTElement("POLYGON((-48 -23, -47 -23, -47 -22, -48 -22, -48 -23))", srid=4326),
    )
    session.add(territory)
    session.flush()

    first_block = Block(
        territory_id=territory.id,
        number=1,
        polygon=WKTElement(
            "POLYGON((-48 -23, -47.5 -23, -47.5 -22.5, -48 -22.5, -48 -23))", srid=4326
        ),
    )
    second_block = Block(
        territory_id=territory.id,
        number=2,
        polygon=WKTElement(
            "POLYGON((-47.5 -23, -47 -23, -47 -22.5, -47.5 -22.5, -47.5 -23))", srid=4326
        ),
    )
    session.add_all([first_block, second_block])
    session.flush()

    older = datetime(2026, 9, 1, 10, tzinfo=UTC)
    newer = datetime(2026, 9, 2, 10, tzinfo=UTC)
    newer_user_id = uuid4()
    session.add_all(
        [
            BlockWorkLog(
                id=uuid4(),
                block_id=first_block.id,
                user_id=uuid4(),
                user_name="Nome antigo",
                worked_at=older,
            ),
            BlockWorkLog(
                id=uuid4(),
                block_id=second_block.id,
                user_id=newer_user_id,
                user_name="Nome preservado",
                worked_at=newer,
            ),
        ]
    )
    session.flush()

    result = BlockWorkLogRepository(session).list_latest_work_by_territory(congregation.id)

    assert result == [
        (
            territory.id,
            newer_user_id,
            "Nome preservado",
            newer,
        )
    ]


def test_lista_no_maximo_um_trabalho_por_territorio(
    session,
    make_congregation,
):
    congregation = make_congregation()
    territories = [
        Territory(
            congregation_id=congregation.id,
            name=name,
            boundary=WKTElement(rectangle_wkt(offset, offset + 1, -23, -22), srid=4326),
        )
        for name, offset in [("Centro", -48), ("Norte", -47)]
    ]
    session.add_all(territories)
    session.flush()

    blocks = [
        Block(
            territory_id=territory.id,
            number=1,
            polygon=WKTElement(rectangle_wkt(offset, offset + 0.5, -23, -22.5), srid=4326),
        )
        for territory, offset in zip(territories, [-48, -47], strict=True)
    ]
    session.add_all(blocks)
    session.flush()

    worked_at = datetime(2026, 9, 2, 10, tzinfo=UTC)
    session.add_all(
        [
            BlockWorkLog(
                id=uuid4(),
                block_id=block.id,
                user_id=uuid4(),
                user_name=f"Pessoa {index}",
                worked_at=worked_at,
            )
            for index, block in enumerate(blocks, start=1)
        ]
    )
    session.flush()

    result = BlockWorkLogRepository(session).list_latest_work_by_territory(congregation.id)

    assert {row[0] for row in result} == {territory.id for territory in territories}
    assert len(result) == len(territories)


def test_lista_vazia_quando_a_congregacao_nao_tem_trabalho(session, make_congregation):
    congregation = make_congregation()

    result = BlockWorkLogRepository(session).list_latest_work_by_territory(congregation.id)

    assert result == []


def test_ignora_registros_de_outra_congregacao(session, make_congregation):
    congregation = make_congregation(name="Central")
    other_congregation = make_congregation(name="Jardim", city="Campinas")
    territories = [
        Territory(
            congregation_id=owner.id,
            name=name,
            boundary=WKTElement(rectangle_wkt(offset, offset + 1, -23, -22), srid=4326),
        )
        for owner, name, offset in [
            (congregation, "Centro", -48),
            (other_congregation, "Centro", -47),
        ]
    ]
    session.add_all(territories)
    session.flush()
    blocks = [
        Block(
            territory_id=territory.id,
            number=1,
            polygon=WKTElement(rectangle_wkt(offset, offset + 0.5, -23, -22.5), srid=4326),
        )
        for territory, offset in zip(territories, [-48, -47], strict=True)
    ]
    session.add_all(blocks)
    session.flush()
    other_log = BlockWorkLog(
        id=uuid4(),
        block_id=blocks[1].id,
        user_id=uuid4(),
        user_name="Outra congregação",
        worked_at=datetime(2026, 9, 3, 10, tzinfo=UTC),
    )
    own_log = BlockWorkLog(
        id=uuid4(),
        block_id=blocks[0].id,
        user_id=uuid4(),
        user_name="Nossa congregação",
        worked_at=datetime(2026, 9, 2, 10, tzinfo=UTC),
    )
    session.add_all([other_log, own_log])
    session.flush()

    result = BlockWorkLogRepository(session).list_latest_work_by_territory(congregation.id)

    assert result == [
        (
            territories[0].id,
            own_log.user_id,
            own_log.user_name,
            own_log.worked_at,
        )
    ]


def test_desempata_por_id_quando_os_trabalhos_tem_a_mesma_data(
    session,
    make_congregation,
):
    congregation = make_congregation()
    territory = Territory(
        congregation_id=congregation.id,
        name="Centro",
        boundary=WKTElement("POLYGON((-48 -23, -47 -23, -47 -22, -48 -22, -48 -23))", srid=4326),
    )
    session.add(territory)
    session.flush()
    blocks = [
        Block(
            territory_id=territory.id,
            number=number,
            polygon=WKTElement(rectangle_wkt(offset, offset + 0.5, -23, -22.5), srid=4326),
        )
        for number, offset in [(1, -48), (2, -47.5)]
    ]
    session.add_all(blocks)
    session.flush()
    worked_at = datetime(2026, 9, 2, 10, tzinfo=UTC)
    lower_log_id = UUID("00000000-0000-0000-0000-000000000001")
    higher_log_id = UUID("00000000-0000-0000-0000-000000000002")
    session.add_all(
        [
            BlockWorkLog(
                id=lower_log_id,
                block_id=blocks[0].id,
                user_id=uuid4(),
                user_name="Desempate menor",
                worked_at=worked_at,
            ),
            BlockWorkLog(
                id=higher_log_id,
                block_id=blocks[1].id,
                user_id=uuid4(),
                user_name="Desempate maior",
                worked_at=worked_at,
            ),
        ]
    )
    session.flush()

    result = BlockWorkLogRepository(session).list_latest_work_by_territory(congregation.id)

    assert result[0][0] == territory.id
    assert result[0][2] == "Desempate maior"

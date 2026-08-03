"""Creating the tenant that every other row hangs off.

Runs against the real database because the uniqueness of `(name, city)` is a database
constraint, and a fake would only prove the fake.
"""

import pytest
from app.core import security
from app.core.exceptions import DuplicateNameError
from app.repositories.congregation import CongregationRepository
from app.services.congregation import CongregationService
from sqlalchemy.orm import Session


@pytest.fixture
def service(session: Session) -> CongregationService:
    return CongregationService(CongregationRepository(session))


def test_creates_a_congregation_with_the_given_name_and_city(
    service: CongregationService,
) -> None:
    congregation = service.create("Central", "Belo Horizonte", "uma-senha-longa")

    assert congregation.id is not None
    assert congregation.name == "Central"
    assert congregation.city == "Belo Horizonte"


def test_stores_the_password_hashed_and_verifiable(service: CongregationService) -> None:
    congregation = service.create("Central", "Belo Horizonte", "uma-senha-longa")

    assert congregation.password_hash != "uma-senha-longa"
    assert security.verify_password("uma-senha-longa", congregation.password_hash)
    assert not security.verify_password("outra-senha", congregation.password_hash)


def test_refuses_the_same_name_in_the_same_city(service: CongregationService) -> None:
    service.create("Central", "Belo Horizonte", "uma-senha-longa")

    with pytest.raises(DuplicateNameError) as raised:
        service.create("Central", "Belo Horizonte", "outra-senha-longa")

    assert "Central" in raised.value.message
    assert "Belo Horizonte" in raised.value.message


def test_allows_the_same_name_in_a_different_city(service: CongregationService) -> None:
    service.create("Central", "Belo Horizonte", "uma-senha-longa")

    other = service.create("Central", "Contagem", "uma-senha-longa")

    assert other.city == "Contagem"

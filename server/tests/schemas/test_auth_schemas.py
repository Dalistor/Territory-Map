"""Tests for the authentication DTOs."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.schemas.auth import CongregationOut, LoginIn, TokenOut
from pydantic import ValidationError


def valid_login(**overrides):
    return {
        "name": "Congregação Central",
        "city": "São Paulo",
        "password": "s3nha-forte",
        **overrides,
    }


def test_login_in_accepts_name_city_and_password():
    body = LoginIn(**valid_login())

    assert (body.name, body.city, body.password) == (
        "Congregação Central",
        "São Paulo",
        "s3nha-forte",
    )


@pytest.mark.parametrize("field", ["name", "city"])
def test_login_in_strips_the_surrounding_whitespace_of_a_typed_field(field):
    body = LoginIn(**valid_login(**{field: "  Centro  "}))

    assert getattr(body, field) == "Centro"


@pytest.mark.parametrize("field", ["name", "city", "password"])
def test_login_in_rejects_an_empty_field(field):
    with pytest.raises(ValidationError):
        LoginIn(**valid_login(**{field: ""}))


@pytest.mark.parametrize("field", ["name", "city"])
def test_login_in_rejects_a_typed_field_made_only_of_whitespace(field):
    with pytest.raises(ValidationError):
        LoginIn(**valid_login(**{field: "   "}))


@pytest.mark.parametrize("field", ["name", "city"])
def test_login_in_rejects_a_field_longer_than_the_column_holds(field):
    with pytest.raises(ValidationError):
        LoginIn(**valid_login(**{field: "a" * 121}))


def test_login_in_rejects_an_absurdly_long_password():
    with pytest.raises(ValidationError):
        LoginIn(**valid_login(password="a" * 129))


@pytest.mark.parametrize("password", ["  espaço nas pontas  ", "   "])
def test_login_in_keeps_the_password_exactly_as_typed(password):
    # A password is a secret byte sequence, not a display string: trimming it would
    # silently authenticate against something other than what the admin typed --
    # which is also why a password of nothing but spaces is a password, not a blank.
    assert LoginIn(**valid_login(password=password)).password == password


def test_login_in_requires_every_field():
    with pytest.raises(ValidationError):
        LoginIn(name="Centro", city="São Paulo")


def test_congregation_out_never_exposes_the_password_hash():
    row = SimpleNamespace(
        id=uuid4(),
        name="Congregação Central",
        city="São Paulo",
        password_hash="$2b$12$notarealhash",
    )

    dto = CongregationOut.model_validate(row)

    assert set(dto.model_dump()) == {"id", "name", "city"}
    assert "notarealhash" not in dto.model_dump_json()


def test_congregation_out_rejects_an_id_that_is_not_a_uuid():
    with pytest.raises(ValidationError):
        CongregationOut(id="not-a-uuid", name="Centro", city="São Paulo")


def test_token_out_carries_the_congregation_and_defaults_to_a_bearer_token():
    congregation = CongregationOut(id=uuid4(), name="Centro", city="São Paulo")

    dto = TokenOut(access_token="jwt.value.here", congregation=congregation)

    assert dto.token_type == "bearer"
    assert dto.congregation.name == "Centro"


def test_token_out_requires_the_access_token():
    with pytest.raises(ValidationError):
        TokenOut(congregation=CongregationOut(id=uuid4(), name="Centro", city="São Paulo"))

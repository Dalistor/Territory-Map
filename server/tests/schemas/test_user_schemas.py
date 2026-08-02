"""Tests for the publisher DTOs and for the access-code exchange."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.core.security import ACCESS_CODE_LENGTH
from app.schemas.auth import CongregationOut
from app.schemas.user import (
    AccessCodeOut,
    ActivateIn,
    ActivateOut,
    UserBriefOut,
    UserCreateIn,
    UserOut,
    UserPatchIn,
)
from pydantic import ValidationError

VALID_CODE = "ABCDEFGH"
EXPIRES_AT = datetime(2026, 8, 3, 12, 0, tzinfo=UTC)


def user_row(**overrides):
    """A stand-in for the ORM row, carrying the two fields that must never leak."""
    fields = {
        "id": uuid4(),
        "congregation_id": uuid4(),
        "name": "Maria",
        "access_code": VALID_CODE,
        "access_code_expires_at": EXPIRES_AT,
        "activated_at": None,
        "is_active": True,
        "token_version": 3,
        "password_hash": "$2b$12$notarealhash",
    }
    return SimpleNamespace(**{**fields, **overrides})


def test_user_create_in_accepts_the_name_the_admin_typed():
    assert UserCreateIn(name="Maria Silva").name == "Maria Silva"


def test_user_create_in_strips_the_surrounding_whitespace_of_the_name():
    assert UserCreateIn(name="  Maria Silva  ").name == "Maria Silva"


@pytest.mark.parametrize("name", ["", "   ", "a" * 121])
def test_user_create_in_rejects_a_blank_or_oversized_name(name):
    with pytest.raises(ValidationError):
        UserCreateIn(name=name)


def test_user_create_in_does_not_accept_a_congregation_from_the_client():
    # The tenant always comes from the token; a body field would be a way around it.
    assert "congregation_id" not in UserCreateIn.model_fields


def test_user_out_exposes_exactly_the_fields_of_the_contract():
    dto = UserOut.model_validate(user_row())

    assert set(dto.model_dump()) == {
        "id",
        "name",
        "access_code",
        "access_code_expires_at",
        "activated_at",
        "is_active",
    }


def test_user_out_never_exposes_the_token_version_or_the_password_hash():
    dto = UserOut.model_validate(user_row())

    dumped = dto.model_dump()
    assert "token_version" not in dumped
    assert "password_hash" not in dumped
    serialised = dto.model_dump_json()
    assert "token_version" not in serialised
    assert "notarealhash" not in serialised


def test_user_out_reports_a_spent_code_as_null_instead_of_omitting_it():
    dto = UserOut.model_validate(
        user_row(access_code=None, access_code_expires_at=None, activated_at=EXPIRES_AT)
    )

    assert dto.access_code is None
    assert dto.activated_at == EXPIRES_AT


def test_user_patch_in_accepts_the_activation_flag():
    assert UserPatchIn(is_active=False).is_active is False


def test_user_patch_in_rejects_a_value_that_is_not_a_boolean():
    with pytest.raises(ValidationError):
        UserPatchIn(is_active="talvez")


def test_user_patch_in_requires_the_flag_it_is_meant_to_carry():
    with pytest.raises(ValidationError):
        UserPatchIn()


def test_access_code_out_carries_the_code_and_when_it_dies():
    dto = AccessCodeOut(access_code=VALID_CODE, access_code_expires_at=EXPIRES_AT)

    assert dto.model_dump() == {
        "access_code": VALID_CODE,
        "access_code_expires_at": EXPIRES_AT,
    }


def test_access_code_out_requires_an_expiry():
    with pytest.raises(ValidationError):
        AccessCodeOut(access_code=VALID_CODE)


def test_activate_in_uppercases_a_code_typed_in_lowercase():
    assert ActivateIn(access_code="abcdefgh").access_code == "ABCDEFGH"


def test_activate_in_strips_the_whitespace_around_a_pasted_code():
    assert ActivateIn(access_code="  abcdefgh  ").access_code == VALID_CODE


@pytest.mark.parametrize(
    "code",
    [
        pytest.param("", id="empty"),
        pytest.param("   ", id="whitespace"),
        # Built from the length the server actually mints, so that changing
        # ACCESS_CODE_LENGTH moves these cases with it instead of leaving them behind.
        pytest.param("A" * (ACCESS_CODE_LENGTH - 1), id="one-short"),
        pytest.param("A" * (ACCESS_CODE_LENGTH + 1), id="one-long"),
    ],
)
def test_activate_in_rejects_a_code_that_is_not_the_length_the_server_mints(code):
    with pytest.raises(ValidationError):
        ActivateIn(access_code=code)


def test_activate_out_answers_with_the_token_the_user_and_the_congregation():
    dto = ActivateOut(
        token="app.token.value",
        user=UserBriefOut(id=uuid4(), name="Maria"),
        congregation=CongregationOut(id=uuid4(), name="Centro", city="São Paulo"),
    )

    assert dto.user.name == "Maria"
    assert dto.congregation.city == "São Paulo"


def test_user_brief_out_carries_only_the_identity_of_the_publisher():
    dto = UserBriefOut.model_validate(user_row())

    assert set(dto.model_dump()) == {"id", "name"}

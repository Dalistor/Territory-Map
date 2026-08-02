"""Behaviour of the publisher's lifecycle and of the disposable access code."""

import ast
import inspect
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from app.core.exceptions import (
    DomainError,
    InactiveUserError,
    InvalidAccessCodeError,
    NotFoundError,
)
from app.core.security import ACCESS_CODE_ALPHABET, ACCESS_CODE_LENGTH, decode_token
from app.models.user import User
from app.services import user as user_service
from app.services.user import UserService

NOW = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)


class FakeUserRepository:
    """In-memory stand-in for `UserRepository`, with the same interface.

    A fake and not a mock: the service is judged by the state it leaves behind
    (code wiped, version bumped), and a mock would only record that a method was
    called. The few places where the real repository leans on database defaults
    -- `token_version` at 0, `is_active` at true -- are applied here on insert,
    which is exactly what the column defaults do on flush.
    """

    def __init__(self, users: list[User] | None = None) -> None:
        self.users: list[User] = list(users or [])

    def get(self, user_id: UUID) -> User | None:
        return next((user for user in self.users if user.id == user_id), None)

    def get_by_access_code(self, code: str | None) -> User | None:
        if not code:
            return None
        return next((user for user in self.users if user.access_code == code), None)

    def list_by_congregation(self, congregation_id: UUID) -> list[User]:
        found = [user for user in self.users if user.congregation_id == congregation_id]
        return sorted(found, key=lambda user: user.name)

    def create(
        self,
        *,
        congregation_id: UUID,
        name: str,
        access_code: str | None = None,
        access_code_expires_at: datetime | None = None,
    ) -> User:
        user = User(
            id=uuid4(),
            congregation_id=congregation_id,
            name=name,
            access_code=access_code,
            access_code_expires_at=access_code_expires_at,
            token_version=0,
            is_active=True,
        )
        self.users.append(user)
        return user

    def set_access_code(self, user: User, code: str | None, expires_at: datetime | None) -> User:
        user.access_code = code
        user.access_code_expires_at = expires_at
        return user

    def redeem_code(self, user: User, now: datetime) -> User:
        user.access_code = None
        user.access_code_expires_at = None
        user.activated_at = now
        user.token_version += 1
        return user

    def set_active(self, user: User, is_active: bool) -> User:
        user.is_active = is_active
        return user

    def expire_codes(self, now: datetime) -> int:
        stale = [
            user
            for user in self.users
            if user.access_code is not None and user.access_code_expires_at < now
        ]
        for user in stale:
            user.access_code = None
            user.access_code_expires_at = None
        return len(stale)


def make_service(repository: FakeUserRepository | None = None) -> UserService:
    return UserService(repository or FakeUserRepository(), now_provider=lambda: NOW)


def test_create_mints_an_eight_character_code_from_the_unambiguous_alphabet():
    service = make_service()

    user = service.create(congregation_id=uuid4(), name="Ana", now=NOW)

    assert len(user.access_code) == ACCESS_CODE_LENGTH
    assert set(user.access_code) <= set(ACCESS_CODE_ALPHABET)


def test_create_gives_the_code_twenty_four_hours_from_the_injected_now():
    service = make_service()

    user = service.create(congregation_id=uuid4(), name="Ana", now=NOW)

    assert user.access_code_expires_at == NOW + timedelta(hours=24)


def test_create_stores_the_name_under_the_given_congregation():
    congregation_id = uuid4()
    repository = FakeUserRepository()
    service = make_service(repository)

    service.create(congregation_id=congregation_id, name="Ana", now=NOW)

    assert [user.name for user in repository.list_by_congregation(congregation_id)] == ["Ana"]


def test_a_newly_created_user_is_not_activated_and_starts_at_token_version_zero():
    """Registration hands out a code; it does not activate anybody."""
    service = make_service()

    user = service.create(congregation_id=uuid4(), name="Ana", now=NOW)

    assert user.activated_at is None
    assert user.token_version == 0
    assert user.is_active is True


def test_create_draws_another_code_when_the_first_one_is_already_taken():
    """The code is unique globally, so a collision costs a retry, never a duplicate."""
    taken = FakeUserRepository()
    taken.create(congregation_id=uuid4(), name="Bia", access_code="AAAAAAAA")
    drawn = iter(["AAAAAAAA", "BBBBBBBB"])
    service = UserService(
        taken,
        now_provider=lambda: NOW,
        generate_access_code=lambda: next(drawn),
    )

    user = service.create(congregation_id=uuid4(), name="Ana", now=NOW)

    assert user.access_code == "BBBBBBBB"


def test_create_gives_up_instead_of_retrying_forever_when_every_draw_collides():
    """A generator that can only produce taken codes must end the call, not hang it."""
    taken = FakeUserRepository()
    taken.create(congregation_id=uuid4(), name="Bia", access_code="AAAAAAAA")
    service = UserService(
        taken,
        now_provider=lambda: NOW,
        generate_access_code=lambda: "AAAAAAAA",
    )

    with pytest.raises(DomainError):
        service.create(congregation_id=uuid4(), name="Ana", now=NOW)


def test_redeeming_a_valid_code_returns_an_app_token_that_names_the_user():
    congregation_id = uuid4()
    service = make_service()
    created = service.create(congregation_id=congregation_id, name="Ana", now=NOW)

    user, token = service.activate(created.access_code, now=NOW + timedelta(hours=1))

    payload = decode_token(token)
    assert payload["user_id"] == str(user.id)
    assert payload["congregation_id"] == str(congregation_id)
    assert payload["type"] == "app"


def test_redeeming_a_code_stamps_the_activation_moment():
    service = make_service()
    created = service.create(congregation_id=uuid4(), name="Ana", now=NOW)
    redeemed_at = NOW + timedelta(hours=1)

    user, _ = service.activate(created.access_code, now=redeemed_at)

    assert user.activated_at == redeemed_at


def test_redeeming_a_code_wipes_it_from_the_row():
    """The credential is spent: it stops existing, in the database too."""
    service = make_service()
    created = service.create(congregation_id=uuid4(), name="Ana", now=NOW)

    user, _ = service.activate(created.access_code, now=NOW)

    assert user.access_code is None
    assert user.access_code_expires_at is None


def test_redeeming_a_code_bumps_the_token_version():
    service = make_service()
    created = service.create(congregation_id=uuid4(), name="Ana", now=NOW)

    user, token = service.activate(created.access_code, now=NOW)

    assert user.token_version == 1
    assert decode_token(token)["token_version"] == 1


def test_a_code_that_belongs_to_nobody_is_refused():
    service = make_service()

    with pytest.raises(InvalidAccessCodeError):
        service.activate("ZZZZZZZZ", now=NOW)


def test_the_same_code_cannot_be_redeemed_twice():
    """Single use: the second attempt finds nothing, because the first wiped it."""
    service = make_service()
    created = service.create(congregation_id=uuid4(), name="Ana", now=NOW)
    code = created.access_code
    service.activate(code, now=NOW)

    with pytest.raises(InvalidAccessCodeError):
        service.activate(code, now=NOW)


def test_a_code_past_its_validity_is_refused():
    service = make_service()
    created = service.create(congregation_id=uuid4(), name="Ana", now=NOW)

    with pytest.raises(InvalidAccessCodeError):
        service.activate(created.access_code, now=NOW + timedelta(hours=24, seconds=1))


def test_a_code_still_works_at_the_very_instant_it_expires():
    """The cut-off matches the cleanup job's, so the two never disagree on a code."""
    service = make_service()
    created = service.create(congregation_id=uuid4(), name="Ana", now=NOW)

    user, _ = service.activate(created.access_code, now=NOW + timedelta(hours=24))

    assert user.activated_at == NOW + timedelta(hours=24)


def test_a_code_with_no_expiry_at_all_is_refused():
    """A live code without a deadline is corrupt data, and corrupt credentials lose."""
    repository = FakeUserRepository()
    repository.create(congregation_id=uuid4(), name="Ana", access_code="AAAAAAAA")
    service = make_service(repository)

    with pytest.raises(InvalidAccessCodeError):
        service.activate("AAAAAAAA", now=NOW)


def test_unknown_expired_and_already_used_codes_fail_with_the_very_same_message():
    """Any difference between the three would confirm that some code exists."""
    service = make_service()
    expired = service.create(congregation_id=uuid4(), name="Bia", now=NOW)
    spent = service.create(congregation_id=uuid4(), name="Ana", now=NOW)
    spent_code = spent.access_code
    service.activate(spent_code, now=NOW)

    messages = []
    for code, when in [
        ("ZZZZZZZZ", NOW),
        (expired.access_code, NOW + timedelta(hours=25)),
        (spent_code, NOW),
    ]:
        with pytest.raises(InvalidAccessCodeError) as raised:
            service.activate(code, now=when)
        messages.append((raised.value.code, str(raised.value)))

    assert len(set(messages)) == 1, f"as três falhas se distinguem: {messages}"


def test_a_revoked_publisher_cannot_redeem_a_valid_code():
    """Says so plainly: the admin turned this person off and can turn them back on."""
    repository = FakeUserRepository()
    service = make_service(repository)
    created = service.create(congregation_id=uuid4(), name="Ana", now=NOW)
    repository.set_active(created, False)

    with pytest.raises(InactiveUserError):
        service.activate(created.access_code, now=NOW)


def test_regenerating_replaces_the_code_and_restarts_the_twenty_four_hours():
    congregation_id = uuid4()
    service = make_service()
    created = service.create(congregation_id=congregation_id, name="Ana", now=NOW)
    first_code = created.access_code
    later = NOW + timedelta(hours=5)

    user = service.regenerate_code(congregation_id, created.id, now=later)

    assert user.access_code != first_code
    assert user.access_code_expires_at == later + timedelta(hours=24)


def test_the_previous_code_stops_working_the_moment_a_new_one_is_issued():
    congregation_id = uuid4()
    service = make_service()
    created = service.create(congregation_id=congregation_id, name="Ana", now=NOW)
    first_code = created.access_code
    service.regenerate_code(congregation_id, created.id, now=NOW)

    with pytest.raises(InvalidAccessCodeError):
        service.activate(first_code, now=NOW)


def test_an_already_activated_publisher_can_be_given_a_new_code():
    """The phone-swap path: activation history stays, a fresh code is handed out."""
    congregation_id = uuid4()
    service = make_service()
    created = service.create(congregation_id=congregation_id, name="Ana", now=NOW)
    service.activate(created.access_code, now=NOW)

    user = service.regenerate_code(congregation_id, created.id, now=NOW + timedelta(days=30))

    assert len(user.access_code) == ACCESS_CODE_LENGTH
    assert user.activated_at == NOW
    assert user.token_version == 1


def test_a_second_redemption_bumps_the_version_again_and_strands_the_first_token():
    """One publisher, one live device: activating the new phone unplugs the old one."""
    congregation_id = uuid4()
    service = make_service()
    created = service.create(congregation_id=congregation_id, name="Ana", now=NOW)
    _, first_token = service.activate(created.access_code, now=NOW)
    regenerated = service.regenerate_code(congregation_id, created.id, now=NOW)

    user, second_token = service.activate(regenerated.access_code, now=NOW)

    assert user.token_version == 2
    assert decode_token(second_token)["token_version"] == 2
    assert decode_token(first_token)["token_version"] < user.token_version


def test_regenerating_the_code_of_another_congregations_publisher_finds_nothing():
    """404, never 403: the answer must not confirm that the person exists."""
    other_congregation = uuid4()
    service = make_service()
    stranger = service.create(congregation_id=other_congregation, name="Ana", now=NOW)

    with pytest.raises(NotFoundError):
        service.regenerate_code(uuid4(), stranger.id, now=NOW)


def test_regenerating_the_code_of_a_publisher_that_does_not_exist_finds_nothing():
    service = make_service()

    with pytest.raises(NotFoundError):
        service.regenerate_code(uuid4(), uuid4(), now=NOW)


def test_a_publisher_created_in_one_congregation_is_out_of_reach_from_another():
    """`create` scopes the row to the admin's congregation, and nothing else opens it."""
    mine, theirs = uuid4(), uuid4()
    service = make_service()
    ours = service.create(congregation_id=mine, name="Ana", now=NOW)

    with pytest.raises(NotFoundError):
        service.set_active(theirs, ours.id, is_active=False)


def test_set_active_revokes_access():
    congregation_id = uuid4()
    service = make_service()
    created = service.create(congregation_id=congregation_id, name="Ana", now=NOW)

    user = service.set_active(congregation_id, created.id, is_active=False)

    assert user.is_active is False


def test_set_active_gives_revoked_access_back():
    congregation_id = uuid4()
    service = make_service()
    created = service.create(congregation_id=congregation_id, name="Ana", now=NOW)
    service.set_active(congregation_id, created.id, is_active=False)

    user = service.set_active(congregation_id, created.id, is_active=True)

    assert user.is_active is True


def test_set_active_on_a_publisher_that_does_not_exist_finds_nothing():
    service = make_service()

    with pytest.raises(NotFoundError):
        service.set_active(uuid4(), uuid4(), is_active=False)


def test_listing_shows_only_the_publishers_of_the_asking_congregation():
    mine, theirs = uuid4(), uuid4()
    service = make_service()
    service.create(congregation_id=mine, name="Ana", now=NOW)
    service.create(congregation_id=theirs, name="Bia", now=NOW)
    service.create(congregation_id=mine, name="Caio", now=NOW)

    listed = service.list(mine)

    assert [user.name for user in listed] == ["Ana", "Caio"]


def test_expire_codes_clears_the_stale_ones_and_reports_how_many():
    congregation_id = uuid4()
    service = make_service()
    stale = service.create(congregation_id=congregation_id, name="Ana", now=NOW)

    cleared = service.expire_codes(now=NOW + timedelta(hours=25))

    assert cleared == 1
    assert stale.access_code is None
    assert stale.access_code_expires_at is None


def test_expire_codes_leaves_a_code_that_is_still_within_its_validity():
    congregation_id = uuid4()
    service = make_service()
    fresh = service.create(congregation_id=congregation_id, name="Bia", now=NOW)
    code = fresh.access_code

    cleared = service.expire_codes(now=NOW + timedelta(hours=23))

    assert cleared == 0
    assert fresh.access_code == code


def test_expire_codes_does_not_disturb_a_publisher_who_already_redeemed():
    """Nothing to clear on an activated row, and the activation must survive the sweep."""
    congregation_id = uuid4()
    service = make_service()
    created = service.create(congregation_id=congregation_id, name="Ana", now=NOW)
    activated, _ = service.activate(created.access_code, now=NOW)

    cleared = service.expire_codes(now=NOW + timedelta(days=365))

    assert cleared == 0
    assert activated.activated_at == NOW
    assert activated.token_version == 1


def test_expire_codes_sweeps_only_the_stale_rows_of_a_mixed_bag():
    service = make_service()
    stale = service.create(congregation_id=uuid4(), name="Ana", now=NOW)
    fresh = service.create(congregation_id=uuid4(), name="Bia", now=NOW + timedelta(hours=10))
    fresh_code = fresh.access_code

    cleared = service.expire_codes(now=NOW + timedelta(hours=25))

    assert cleared == 1
    assert stale.access_code is None
    assert fresh.access_code == fresh_code


def _rendered(error: DomainError) -> str:
    """Every string an error can reach a log, a screen or a JSON body through."""
    return f"{error!r} | {error} | {error.message} | {error.code} | {error.args}"


def test_no_failure_of_the_service_ever_repeats_the_access_code():
    """The code is a credential: it must not survive into a message, a log or a screen."""
    congregation_id = uuid4()
    service = make_service()

    expired = service.create(congregation_id=congregation_id, name="Ana", now=NOW)
    expired_code = expired.access_code

    spent = service.create(congregation_id=congregation_id, name="Bia", now=NOW)
    spent_code = spent.access_code
    service.activate(spent_code, now=NOW)

    revoked = service.create(congregation_id=congregation_id, name="Caio", now=NOW)
    revoked_code = revoked.access_code
    service.set_active(congregation_id, revoked.id, is_active=False)

    attempts = [
        (expired_code, lambda: service.activate(expired_code, now=NOW + timedelta(hours=25))),
        (spent_code, lambda: service.activate(spent_code, now=NOW)),
        (revoked_code, lambda: service.activate(revoked_code, now=NOW)),
        ("ZZZZZZZZ", lambda: service.activate("ZZZZZZZZ", now=NOW)),
    ]

    for code, attempt in attempts:
        with pytest.raises(DomainError) as raised:
            attempt()
        assert code not in _rendered(raised.value), f"o código vazou: {raised.value!r}"


def test_the_code_generation_failure_does_not_repeat_the_code_it_could_not_place():
    taken = FakeUserRepository()
    taken.create(congregation_id=uuid4(), name="Bia", access_code="AAAAAAAA")
    service = UserService(
        taken,
        now_provider=lambda: NOW,
        generate_access_code=lambda: "AAAAAAAA",
    )

    with pytest.raises(DomainError) as raised:
        service.create(congregation_id=uuid4(), name="Ana", now=NOW)

    assert "AAAAAAAA" not in _rendered(raised.value)


class LooseMatchRepository(FakeUserRepository):
    """A repository whose lookup matches more codes than it should."""

    def get_by_access_code(self, code: str | None) -> User | None:
        if not code:
            return None
        return next(
            (
                user
                for user in self.users
                if user.access_code and user.access_code.lower() == code.lower()
            ),
            None,
        )


def test_a_row_whose_code_is_not_exactly_the_one_offered_is_refused():
    """The service confirms the match itself instead of trusting the lookup."""
    repository = LooseMatchRepository()
    repository.create(
        congregation_id=uuid4(),
        name="Ana",
        access_code="AAAAAAAA",
        access_code_expires_at=NOW + timedelta(hours=24),
    )
    service = make_service(repository)

    with pytest.raises(InvalidAccessCodeError):
        service.activate("aaaaaaaa", now=NOW)


class WipedCodeRepository(FakeUserRepository):
    """A lookup that hands back a row even though its code has already been wiped."""

    def get_by_access_code(self, code: str | None) -> User | None:
        return self.users[0] if self.users else None


def test_a_row_whose_code_was_already_wiped_is_refused_and_not_compared():
    """Refusal, not a crash: there is nothing on the row to compare the guess against."""
    repository = WipedCodeRepository()
    repository.create(congregation_id=uuid4(), name="Ana")
    service = make_service(repository)

    with pytest.raises(InvalidAccessCodeError):
        service.activate("AAAAAAAA", now=NOW)


def test_a_caller_that_omits_now_gets_the_time_from_the_injected_provider():
    service = make_service()

    user = service.create(congregation_id=uuid4(), name="Ana")

    assert user.access_code_expires_at == NOW + timedelta(hours=24)


def test_omitting_now_on_redemption_also_uses_the_injected_provider():
    service = make_service()
    created = service.create(congregation_id=uuid4(), name="Ana")

    user, _ = service.activate(created.access_code)

    assert user.activated_at == NOW


def test_omitting_now_on_the_cleanup_also_uses_the_injected_provider():
    service = make_service()
    service.create(congregation_id=uuid4(), name="Ana", now=NOW - timedelta(hours=25))

    assert service.expire_codes() == 1


def test_the_service_never_reads_the_clock_itself():
    """Time arrives as an argument or through the provider -- never from the module."""
    tree = ast.parse(inspect.getsource(user_service))
    called = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        target = node.func
        parts = []
        while isinstance(target, ast.Attribute):
            parts.append(target.attr)
            target = target.value
        if isinstance(target, ast.Name):
            parts.append(target.id)
            called.add(".".join(reversed(parts)))

    assert not (called & {"datetime.now", "datetime.utcnow", "time.time"})

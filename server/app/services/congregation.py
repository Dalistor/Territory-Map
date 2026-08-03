"""Creating a congregation -- the one thing that has to exist before anything else.

There is no HTTP route for this, on purpose. A congregation carries the admin's
password and is the tenant boundary of the whole system; an open endpoint would let
anyone create one on someone else's server. It is reached only from
`app/jobs/create_congregation.py`, which runs inside the container.
"""

from collections.abc import Callable

from app.core import security
from app.core.exceptions import DuplicateNameError
from app.models.congregation import Congregation
from app.repositories.congregation import CongregationRepository


class CongregationService:
    def __init__(
        self,
        congregations: CongregationRepository,
        hash_password: Callable[[str], str] = security.hash_password,
    ) -> None:
        self._congregations = congregations
        self._hash_password = hash_password

    def create(self, name: str, city: str, password: str) -> Congregation:
        """Register a congregation, hashing its password on the way in.

        `(name, city)` is unique, and the database enforces it too; checking here is
        what turns a constraint violation into a domain error the caller can print.
        """
        if self._congregations.get_by_name_and_city(name, city):
            raise DuplicateNameError(f"Já existe uma congregação chamada '{name}' em {city}.")
        return self._congregations.create(
            name=name, city=city, password_hash=self._hash_password(password)
        )

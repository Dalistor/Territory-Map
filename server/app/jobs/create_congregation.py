"""Register a congregation -- the bootstrap step of a fresh installation.

Nothing else in the system can be created until one exists: the admin token is issued
against a congregation, and every other row is scoped by it. There is deliberately no
HTTP route for this, so on the server it is run as:

    docker compose exec api python -m app.jobs.create_congregation "Central" "Belo Horizonte"

The password is asked for on the terminal, never taken as an argument: an argument
lands in the shell history and in the process list, where anyone with a login can read
it. For an unattended run, set CONGREGATION_PASSWORD in the environment instead.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.exceptions import DomainError
from app.models.congregation import Congregation
from app.repositories.congregation import CongregationRepository
from app.services.congregation import CongregationService

#: A floor, not a recommendation. Online guessing is throttled to five attempts a
#: minute per IP on `/auth/login`, so the exposure of a short password is an offline
#: attack on a leaked database, where bcrypt's cost is what buys the time.
MIN_PASSWORD_LENGTH = 6

PASSWORD_ENV_VAR = "CONGREGATION_PASSWORD"


def read_password(prompt: Callable[[str], str] = getpass.getpass) -> str:
    """Take the password from the environment, or ask for it twice on the terminal.

    The wording matters: this password is being *defined* here, not looked up. There
    is no separate admin account anywhere in the system -- the congregation is the
    admin, and logging in means sending its name, its city and this password
    together. Asking for "the admin's password" read as a credential the operator was
    supposed to already have.
    """
    from_env = os.environ.get(PASSWORD_ENV_VAR)
    if from_env:
        return from_env

    print(
        "Defina a senha de administrador desta congregação. É com ela, mais o nome e "
        f"a cidade, que o app admin faz login. Mínimo de {MIN_PASSWORD_LENGTH} caracteres."
    )
    password = prompt("Nova senha: ")
    if password != prompt("Repita a senha: "):
        raise ValueError("As senhas não conferem.")
    return password


def run(
    name: str,
    city: str,
    password: str,
    session_factory: Callable[[], Session] = SessionLocal,
) -> Congregation:
    """Create the congregation in its own transaction and return it."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"A senha precisa ter ao menos {MIN_PASSWORD_LENGTH} caracteres.")

    session = session_factory()
    try:
        congregation = CongregationService(CongregationRepository(session)).create(
            name=name, city=city, password=password
        )
        session.commit()
        # Read the id before the session closes; the caller only needs these two
        # fields and must not have to keep a live session to see them.
        created = Congregation(id=congregation.id, name=congregation.name, city=congregation.city)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
    return created


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cadastra uma congregação.")
    parser.add_argument("name", help="Nome da congregação")
    parser.add_argument("city", help="Cidade")
    args = parser.parse_args(argv)

    try:
        congregation = run(args.name, args.city, read_password())
    except (DomainError, ValueError) as error:
        # The message, not a traceback: whoever runs this is the admin, not a developer.
        message = error.message if isinstance(error, DomainError) else str(error)
        print(f"Erro: {message}", file=sys.stderr)
        return 1

    print(f"Congregação criada: {congregation.name} / {congregation.city}")
    print(f"id: {congregation.id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Domain errors.

Services signal failure with these exceptions and never with `HTTPException`:
the router is the only layer that knows about HTTP and maps `code` to a status.

Each error carries:

* `code` -- a stable, machine-readable string. Clients branch on it, so it is part
  of the API contract and must not change once released.
* `default_message` -- Portuguese text written for the admin, saying what to do and
  not just what failed. A call site may pass a more specific message (for instance
  naming the block numbers that fell outside a new boundary).

Messages must never leak a credential: no password, no access code, and no hint
about which of several conditions failed when the errors are deliberately
indistinguishable (invalid credentials, invalid access code).
"""


class DomainError(Exception):
    """Base class for every business-rule failure."""

    code: str = "domain_error"
    default_message: str = "Não foi possível concluir a operação. Revise os dados e tente de novo."

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class NotFoundError(DomainError):
    """Resource does not exist -- or belongs to another congregation.

    Both cases raise this same error on purpose: answering 404 instead of 403 keeps
    the API from confirming that a resource of another congregation exists.
    """

    code = "not_found"
    default_message = (
        "Registro não encontrado. Ele pode ter sido removido — atualize a lista e tente de novo."
    )


class InvalidCredentialsError(DomainError):
    """Admin login failed. Deliberately does not say which of the three fields is wrong."""

    code = "invalid_credentials"
    default_message = "Não foi possível entrar. Confira o nome da congregação, a cidade e a senha."


class InvalidAccessCodeError(DomainError):
    """Access code is unknown, expired or already redeemed -- the three are indistinguishable."""

    code = "invalid_access_code"
    default_message = (
        "Código de acesso inválido, expirado ou já utilizado. "
        "Gere um novo código para o publicador e entregue a ele."
    )


class InactiveUserError(DomainError):
    """The publisher exists but had access revoked."""

    code = "inactive_user"
    default_message = (
        "Este publicador está desativado. Reative o cadastro dele para liberar o acesso."
    )


class InvalidPolygonError(DomainError):
    """Geometry is not a valid, simple polygon."""

    code = "invalid_polygon"
    default_message = (
        "O desenho não forma uma área válida. Verifique se há pelo menos 3 pontos "
        "distintos e se as linhas não se cruzam."
    )


class TerritoryOverlapError(DomainError):
    """Boundary invades another territory of the same congregation."""

    code = "territory_overlap"
    default_message = (
        "Esta demarcação invade a área de outro território da congregação. "
        "Ajuste o contorno — encostar na divisa é permitido, sobrepor não."
    )


class BlockOutsideTerritoryError(DomainError):
    """Block polygon is not entirely within the territory boundary."""

    code = "block_outside_territory"
    default_message = (
        "A quadra precisa ficar inteiramente dentro da demarcação do território. "
        "Ajuste o contorno da quadra ou a demarcação do território."
    )


class BlockOverlapError(DomainError):
    """Block polygon invades another block of the same territory."""

    code = "block_overlap"
    default_message = (
        "Esta quadra invade a área de outra quadra do mesmo território. "
        "Ajuste o contorno — encostar na divisa é permitido, sobrepor não."
    )


class DuplicateBlockNumberError(DomainError):
    """Block number already taken inside the territory."""

    code = "duplicate_block_number"
    default_message = "Já existe uma quadra com esse número neste território. Escolha outro número."


class DuplicateNameError(DomainError):
    """Name already taken inside the scope where it must be unique."""

    code = "duplicate_name"
    default_message = "Já existe um registro com esse nome. Escolha outro nome."


class InvalidWorkedAtError(DomainError):
    """`worked_at` is in the future or too far in the past."""

    code = "invalid_worked_at"
    default_message = (
        "A data em que a quadra foi trabalhada é inválida: não pode estar no futuro "
        "nem ter mais de 90 dias. Verifique o relógio do aparelho."
    )

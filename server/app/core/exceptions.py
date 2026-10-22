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


class PublisherHasOpenAssignmentError(DomainError):
    """The publisher still holds a territory, so deleting them would orphan the card.

    Refused rather than resolved for them: closing the assignment stamps a
    completion date on the S-13 card, and inventing that date on the way to a
    deletion would write a fact nobody stated.
    """

    code = "publisher_has_open_assignment"
    default_message = (
        "Este publicador ainda tem um território designado a ele. Marque a designação "
        "como concluída na página Designações e depois apague o cadastro."
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


class TerritoryNotAssignedError(DomainError):
    """Publisher tried to mark a block whose territory is not assigned to them."""

    code = "territory_not_assigned"
    default_message = (
        "Este território não está designado a você. Peça a quem cuida dos territórios "
        "na congregação para atribuí-lo antes de marcar quadras."
    )


class OpenAssignmentConflictError(DomainError):
    """Territory already has an open assignment."""

    code = "open_assignment_conflict"
    default_message = "Este território já possui uma designação em andamento."


class InvalidAssignmentDatesError(DomainError):
    """Assignment start date cannot be after completion date."""

    code = "invalid_assignment_dates"
    default_message = "A data de início não pode ser posterior à data de conclusão."


class CampaignActiveError(DomainError):
    """The campaign is out right now, and the operation needs it completed first.

    Raised for deleting it -- which would erase the lines it holds open on the cards --
    and for designating it again while a period is already open. The call site passes
    the message that says which of the two the admin should do.
    """

    code = "campaign_active"
    default_message = "Esta campanha está em andamento. Marque-a como concluída antes de apagá-la."


class CampaignWithoutPublishersError(DomainError):
    """A campaign period with nobody in it would leave its territories unworkable."""

    code = "campaign_without_publishers"
    default_message = "Escolha ao menos um publicador para designar a campanha."


class TerritoryInCampaignError(DomainError):
    """The territory is held by an active campaign, which forbids the operation.

    One class for both doors into the conflict -- designating the territory to a
    publisher, and putting it in a second active campaign -- because the cause and the
    way out are the same: conclude that campaign or take the territory out of it. The
    service passes a message naming the territory and the campaign.
    """

    code = "territory_in_campaign"
    default_message = (
        "Este território está numa campanha em andamento. Conclua a campanha ou tire o "
        "território dela antes."
    )


class CampaignAssignmentManagedError(DomainError):
    """The card row belongs to a campaign, so it is edited through the campaign."""

    code = "campaign_assignment"
    default_message = (
        "Esta linha do cartão pertence a uma campanha. Para alterá-la, concluí-la ou "
        "removê-la, use a página Campanhas."
    )

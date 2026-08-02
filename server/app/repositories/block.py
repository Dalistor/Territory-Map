"""Data access for `Block`: numbering, containment and overlap, all answered by PostGIS."""

from datetime import datetime
from uuid import UUID

from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape
from sqlalchemy import func, literal, not_, select, union_all
from sqlalchemy.orm import Session

from app.models.block import Block
from app.models.territory import Territory

SRID = 4326


class BlockRepository:
    """Queries over the `blocks` table, scoped by the territory that owns them.

    The three geometric questions this layer answers -- *is the block inside the
    territory*, *does it overlap a sibling*, *which blocks would fall outside a new
    demarcation* -- are all evaluated by PostgreSQL. Pulling the polygons into Python
    to compare them would throw away the GIST index and, worse, would reimplement
    predicates that PostGIS already gets right at the edges.
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, block_id: UUID) -> Block | None:
        """Fetch a block by id, or `None`. Ownership is not checked here."""
        return self.session.get(Block, block_id)

    def get_in_congregation(self, congregation_id: UUID, block_id: UUID) -> Block | None:
        """Fetch a block only if its territory belongs to this congregation.

        A block reached from a URL has to be filtered by the congregation of the token
        in the same statement, so a block of another congregation is simply not found.
        """
        return self.session.scalars(
            select(Block)
            .join(Territory, Block.territory_id == Territory.id)
            .where(
                Block.id == block_id,
                Territory.congregation_id == congregation_id,
            )
        ).one_or_none()

    def get_by_number(self, territory_id: UUID, number: int) -> Block | None:
        """Fetch the block carrying this number inside the territory, or `None`."""
        return self.session.scalars(
            select(Block).where(
                Block.territory_id == territory_id,
                Block.number == number,
            )
        ).one_or_none()

    def list_by_territory(self, territory_id: UUID) -> list[Block]:
        """Every block of the territory, in numeric order."""
        return list(
            self.session.scalars(
                select(Block).where(Block.territory_id == territory_id).order_by(Block.number)
            )
        )

    def create(self, territory_id: UUID, number: int, wkt: str) -> Block:
        """Insert a block and flush, so the caller gets its generated id."""
        block = Block(
            territory_id=territory_id,
            number=number,
            polygon=WKTElement(wkt, srid=SRID),
        )
        self.session.add(block)
        self.session.flush()
        return block

    def update(
        self,
        block: Block,
        *,
        number: int | None = None,
        wkt: str | None = None,
    ) -> Block:
        """Change the number, the outline or both. `None` means "leave as it is"."""
        if number is not None:
            block.number = number
        if wkt is not None:
            block.polygon = WKTElement(wkt, srid=SRID)
        self.session.flush()
        return block

    def delete(self, block: Block) -> None:
        """Remove the block; the FK cascade takes its work logs with it."""
        self.session.delete(block)
        self.session.flush()

    def set_last_worked_at(self, block: Block, worked_at: datetime | None) -> None:
        """Write the read cache derived from `BlockWorkLog`.

        Kept here so the recomputation after a log is inserted or deleted goes through
        the data layer like any other write; the value itself is decided by the service
        that owns the log.
        """
        block.last_worked_at = worked_at
        self.session.flush()

    def next_free_number(self, territory_id: UUID) -> int:
        """The smallest integer >= 1 not yet used in this territory.

        Numbers usually come from the paper map the congregation already uses, so they
        arrive out of order and with gaps; the suggestion has to fill the first gap
        (with 1, 2 and 4 taken the answer is 3), not simply continue from the highest.

        The candidate set is `1` plus `n + 1` for every existing number `n`: the first
        free integer is always one of those -- either the sequence never started, or it
        starts right after some block. Filtering out the ones already taken and taking
        the minimum answers the question in a single statement. The highest number plus
        one is always a candidate and always free, so the result is never empty.
        """
        candidates = union_all(
            select(literal(1).label("number")),
            select((Block.number + 1).label("number")).where(Block.territory_id == territory_id),
        ).subquery("candidate")
        taken = (
            select(literal(1))
            .where(
                Block.territory_id == territory_id,
                Block.number == candidates.c.number,
            )
            .exists()
        )
        return self.session.scalar(select(func.min(candidates.c.number)).where(not_(taken))) or 1

    def is_within_territory(self, territory_id: UUID, wkt: str) -> bool:
        """Whether the ring lies entirely inside the territory's demarcation.

        `ST_Within` includes the border, so a block drawn exactly over the territory
        outline is accepted while a single vertex outside is not -- which is the rule
        the admin is told about.

        A territory that does not exist yields `False`: there is no boundary to be
        inside of. Reporting that as "not found" is the service's job, not this one's.
        """
        return bool(
            self.session.scalar(
                select(func.ST_Within(WKTElement(wkt, srid=SRID), Territory.boundary)).where(
                    Territory.id == territory_id
                )
            )
        )

    def find_overlapping(
        self,
        territory_id: UUID,
        wkt: str,
        exclude_id: UUID | None = None,
    ) -> list[Block]:
        """Blocks of this territory whose area the given ring invades.

        Same predicate as between territories: neighbouring blocks share the street
        corner they meet at, so `ST_Touches` is expected and only an intersection that
        is *not* a touch means the interiors collide.

        `exclude_id` keeps a block from colliding with its own stored outline while it
        is being reshaped.
        """
        geometry = WKTElement(wkt, srid=SRID)
        statement = select(Block).where(
            Block.territory_id == territory_id,
            func.ST_Intersects(Block.polygon, geometry),
            not_(func.ST_Touches(Block.polygon, geometry)),
        )
        if exclude_id is not None:
            statement = statement.where(Block.id != exclude_id)
        return list(self.session.scalars(statement.order_by(Block.number)))

    def find_outside_boundary(self, territory_id: UUID, new_boundary_wkt: str) -> list[Block]:
        """Blocks that would stop being contained if the territory were redrawn like this.

        Answered before the update is applied, so the caller can refuse the change and
        name the blocks that would be orphaned instead of leaving them dangling outside
        the territory that owns them.
        """
        return list(
            self.session.scalars(
                select(Block)
                .where(
                    Block.territory_id == territory_id,
                    not_(
                        func.ST_Within(
                            Block.polygon,
                            WKTElement(new_boundary_wkt, srid=SRID),
                        )
                    ),
                )
                .order_by(Block.number)
            )
        )

    def polygon_wkt(self, block: Block) -> str:
        """The outline of a loaded block as WKT, with no extra round trip."""
        return to_shape(block.polygon).wkt

"""Data access: every query, every ORM call, every PostGIS predicate lives here.

A repository is a thin class over a `Session`. It knows how to find, write and
count rows -- nothing else. It does not decide whether a code is still valid,
whether a polygon may overlap or whether the caller owns the row: those are
business rules and belong to `app/services/`. A lookup that finds nothing returns
`None` (or an empty list), never a `DomainError`.

No repository commits. The transaction is owned by the session -- `get_session()`
commits once per request -- so a failure anywhere in the request leaves nothing
half-written. `flush()` is used where the caller needs the generated primary key
before the request ends; it writes inside the open transaction and is still
undone by a rollback.
"""

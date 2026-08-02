"""HTTP endpoints.

The thinnest layer of the server: a router reads the request, resolves who is
calling through `app/core/deps.py`, assembles the service it needs over the request
session, calls one method and returns a DTO. No business rule lives here, and no
query -- a router that grew an `if` about the domain has taken work that belongs to
`app/services/`.

Failure is not handled route by route either: services raise domain errors and the
single handler registered in `app/main.py` turns them into status codes.
"""

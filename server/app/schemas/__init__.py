"""Pydantic DTOs: the shape of what enters and what leaves the API.

This layer validates *form* only -- types, ranges, sizes, normalisation. Whether a
name is already taken, whether a polygon overlaps a neighbour or whether a code is
still valid are business rules and live in `app/services/`. Nothing here touches the
database or calls a service.
"""

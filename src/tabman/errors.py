"""Shared domain errors for the Tabman CLI."""

from __future__ import annotations


class OrganizeError(RuntimeError):
    """Raised when a provider cannot return a complete, valid batch."""

"""Hermes Mobile platform plugin. Hermes imports this package and calls ``register(ctx)``."""


def register(ctx):
    from .adapter import register as _register  # imported lazily so core/server stay Hermes-free
    _register(ctx)


__all__ = ["register"]

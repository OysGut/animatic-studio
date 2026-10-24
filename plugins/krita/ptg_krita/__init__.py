"""From Pen to Glass for Krita 5.2+ (C-8). Registrerer tillegget; selve logikken ligger i logic.py."""
try:
    from krita import Krita  # type: ignore
    from .extension import PtgExtension
    Krita.instance().addExtension(PtgExtension(Krita.instance()))
except ImportError:  # utenfor Krita (tester)
    pass

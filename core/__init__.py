"""Load Celery app on Django startup (if available)."""
try:
    from .celery import app as celery_app
    __all__ = ('celery_app',)
except ImportError:
    # Celery is not installed — skip for local development
    pass

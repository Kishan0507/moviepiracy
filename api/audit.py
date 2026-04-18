"""Audit logging utility — call from views to track all actions."""
from .models import AuditLog, Notification


def log_action(action, description, user=None, movie=None, theatre=None, case=None, ip=None):
    """Create an audit log entry."""
    AuditLog.objects.create(
        action=action,
        description=description,
        user=user,
        related_movie=movie,
        related_theatre=theatre,
        related_case=case,
        ip_address=ip,
    )


def create_notification(title, message, ntype='INFO', link=''):
    """Create a notification for the dashboard bell."""
    Notification.objects.create(
        title=title,
        message=message,
        type=ntype,
        link=link,
    )


def log_and_notify(action, description, title=None, ntype='INFO', link='', **kwargs):
    """Convenience: log + notify in one call."""
    log_action(action, description, **kwargs)
    create_notification(
        title=title or description[:80],
        message=description,
        ntype=ntype,
        link=link,
    )

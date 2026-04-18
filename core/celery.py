"""Celery application configuration for CineMark."""
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

app = Celery('core')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Default task configuration
app.conf.update(
    task_track_started=True,
    task_time_limit=1800,          # Hard kill after 30 min
    task_soft_time_limit=1500,     # Raise SoftTimeLimitExceeded after 25 min
    worker_max_memory_per_child=512000,  # Restart worker after ~500 MB
    worker_prefetch_multiplier=1,  # One task at a time per worker
)

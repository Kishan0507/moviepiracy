"""Celery tasks for asynchronous watermark processing."""
import os
import logging
import time
import threading
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings

logger = logging.getLogger('api.tasks')


def _is_filesystem_broker():
    """Check if we're using the filesystem broker (no Redis)."""
    broker = getattr(settings, 'CELERY_BROKER_URL', '')
    return broker.startswith('filesystem://')


def dispatch_watermark(task_id):
    """
    Smart dispatcher: uses Celery if Redis is available,
    falls back to a background thread for local dev (filesystem broker).

    Returns (celery_task_id_or_none, method_used).
    """
    if _is_filesystem_broker():
        logger.info(f"[{task_id}] Filesystem broker detected — running in background thread")
        thread = threading.Thread(
            target=_run_in_thread, args=(str(task_id),), daemon=True
        )
        thread.start()
        return None, 'thread'
    else:
        result = process_watermark.delay(str(task_id))
        return result.id, 'celery'


def _run_in_thread(task_id):
    """Thread wrapper that mimics the Celery task execution."""
    try:
        _execute_watermark(task_id, celery_request_id=None)
    except Exception as e:
        logger.exception(f"[{task_id}] Thread execution failed: {e}")
        _update_task(task_id, status='FAILED', phase='ERROR',
                     error_message=str(e))


def _update_task(task_id, **fields):
    """Update a WatermarkTask record in the database."""
    from .models import WatermarkTask
    WatermarkTask.objects.filter(id=task_id).update(**fields)


@shared_task(
    bind=True,
    max_retries=3,
    autoretry_for=(OSError, IOError),
    retry_backoff=True,
    retry_backoff_max=120,
    time_limit=1800,
    soft_time_limit=1500,
    acks_late=True,
    name='api.tasks.process_watermark',
)
def process_watermark(self, task_id):
    """Celery entry point — delegates to shared execution logic."""
    return _execute_watermark(task_id, celery_request_id=self.request.id)


def _execute_watermark(task_id, celery_request_id=None):
    """
    Core watermark pipeline — used by both Celery and thread fallback.
    Phases: PROBING → HASHING → EMBEDDING → ENCODING → VALIDATING → DONE
    """
    from .models import WatermarkTask
    from .video_processor import process_video_stream
    from .audit import log_and_notify

    try:
        task = WatermarkTask.objects.select_related('movie', 'theatre').get(id=task_id)
    except WatermarkTask.DoesNotExist:
        logger.error(f"Task {task_id} not found in database.")
        return {'success': False, 'error': 'Task not found'}

    # Update to PROCESSING
    task.status = 'PROCESSING'
    task.phase = 'PROBING'
    task.progress_pct = 5
    if celery_request_id:
        task.celery_task_id = celery_request_id
    task.save()

    input_file_path = task.movie.original_file.path
    file_name, file_ext = os.path.splitext(os.path.basename(input_file_path))
    output_filename = f"watermarked_{task.theatre.id}_{file_name}{file_ext}"
    output_dir = os.path.join(settings.MEDIA_ROOT, 'watermarked')
    os.makedirs(output_dir, exist_ok=True)
    output_file_path = os.path.join(output_dir, output_filename)

    # Get showtime timestamp if available
    showtime_str = ''
    if task.showtime_timestamp:
        showtime_str = task.showtime_timestamp.isoformat()

    logger.info(f"[Task {task_id}] Starting watermark: "
                f"movie='{task.movie.title}', theatre='{task.theatre.name}'"
                f"{', showtime=' + showtime_str if showtime_str else ''}")

    start_time = time.time()

    try:
        result = process_video_stream(
            input_file=input_file_path,
            output_file=output_file_path,
            theatre_id=str(task.theatre.id),
            movie_id=str(task.movie.id),
            task_id=str(task_id),
            showtime_timestamp=showtime_str,
        )

        elapsed = time.time() - start_time

        if result.get('success'):
            task.status = 'COMPLETED'
            task.phase = 'DONE'
            task.progress_pct = 100
            task.watermarked_file.name = f"watermarked/{output_filename}"
            task.ffmpeg_log = result.get('ffmpeg_log', '')
            task.save()

            frames_info = (f", {result.get('frames_embedded', 0)} frames watermarked"
                          if result.get('frames_embedded') else '')
            logger.info(f"[Task {task_id}] Completed in {elapsed:.1f}s{frames_info}")

            log_and_notify(
                'WATERMARK_COMPLETED',
                f'Watermark completed: "{task.movie.title}" for {task.theatre.name} '
                f'({elapsed:.1f}s{frames_info})',
                title=f'✅ Watermark done: "{task.movie.title}"',
                ntype='SUCCESS', link='/',
                movie=task.movie, theatre=task.theatre,
            )
            return {'success': True, 'task_id': str(task_id), 'elapsed': elapsed}
        else:
            error_msg = result.get('error', 'Processing returned failure')
            task.status = 'FAILED'
            task.phase = 'ERROR'
            task.error_message = error_msg
            task.ffmpeg_log = result.get('ffmpeg_log', '')
            task.save()

            logger.error(f"[Task {task_id}] Failed: {error_msg}")
            return {'success': False, 'error': error_msg}

    except SoftTimeLimitExceeded:
        _update_task(task_id, status='FAILED', phase='ERROR',
                     error_message='Task exceeded time limit (25 min)')
        logger.error(f"[Task {task_id}] Soft time limit exceeded")
        return {'success': False, 'error': 'Time limit exceeded'}

    except Exception as exc:
        _update_task(task_id, status='FAILED', phase='ERROR',
                     error_message=str(exc))
        logger.exception(f"[Task {task_id}] Unhandled exception")
        raise

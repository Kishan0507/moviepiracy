from django.db import models
from django.contrib.auth.models import User
import uuid


class UserProfile(models.Model):
    """User profile for role management."""
    ROLE_CHOICES = (
        ('ADMIN', 'Admin'),
        ('DISTRIBUTOR', 'Distributor'),
        ('INVESTIGATOR', 'Investigator'),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='DISTRIBUTOR')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class Theatre(models.Model):
    """Theatre venue details and compliance tracking."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255)
    contact_email = models.EmailField(blank=True, null=True)
    compliance_score = models.FloatField(default=100.0)
    is_blacklisted = models.BooleanField(default=False)
    total_incidents = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.location}"


class Movie(models.Model):
    """Movie metadata and master file storage."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    original_file = models.FileField(upload_to='movies/')
    duration_seconds = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class MovieTiming(models.Model):
    """Scheduled showtimes for movies at theatres."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    theatre = models.ForeignKey(Theatre, on_delete=models.CASCADE)
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE)
    time = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.movie.title} at {self.theatre.name} - {self.time}"


class WatermarkTask(models.Model):
    """Background task for embedding video watermarks."""
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    )
    PHASE_CHOICES = (
        ('QUEUED', 'Queued'),
        ('PROBING', 'Probing'),
        ('EMBEDDING', 'Embedding'),
        ('ENCODING', 'Encoding'),
        ('VALIDATING', 'Validating'),
        ('DONE', 'Done'),
        ('ERROR', 'Error'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE)
    theatre = models.ForeignKey(Theatre, on_delete=models.CASCADE)
    celery_task_id = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    phase = models.CharField(max_length=20, choices=PHASE_CHOICES, default='QUEUED')
    progress_pct = models.IntegerField(default=0)
    watermarked_file = models.FileField(upload_to='watermarked/', blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)
    ffmpeg_log = models.TextField(blank=True, default='')
    watermark_strength = models.FloatField(null=True, blank=True)
    showtime_timestamp = models.DateTimeField(null=True, blank=True)
    original_file_hash = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Task {self.id} - {self.status} ({self.phase})"


class PiracyCase(models.Model):
    """Piracy incident reports and investigations."""
    STATUS_CHOICES = (
        ('OPEN', 'Open'),
        ('INVESTIGATING', 'Investigating'),
        ('RESOLVED', 'Resolved'),
        ('CLOSED', 'Closed'),
    )
    SEVERITY_CHOICES = (
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case_number = models.CharField(max_length=20, unique=True, editable=False)
    movie = models.ForeignKey(Movie, on_delete=models.SET_NULL, null=True, blank=True)
    theatre = models.ForeignKey(Theatre, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='HIGH')
    confidence = models.FloatField(default=0)
    description = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    evidence_file = models.FileField(upload_to='evidence/', blank=True, null=True)
    detected_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.case_number:
            # Generate case number like PC-2026-00001
            from django.utils import timezone
            year = timezone.now().year
            count = PiracyCase.objects.filter(
                created_at__year=year
            ).count() + 1
            self.case_number = f"PC-{year}-{count:05d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.case_number} - {self.status}"

    class Meta:
        ordering = ['-created_at']


class AuditLog(models.Model):
    ACTION_CHOICES = (
        ('MOVIE_UPLOADED', 'Movie Uploaded'),
        ('THEATRE_REGISTERED', 'Theatre Registered'),
        ('SHOWTIME_CREATED', 'Showtime Created'),
        ('WATERMARK_STARTED', 'Watermark Started'),
        ('WATERMARK_COMPLETED', 'Watermark Completed'),
        ('WATERMARK_FAILED', 'Watermark Failed'),
        ('PIRACY_DETECTED', 'Piracy Detected'),
        ('CASE_CREATED', 'Case Created'),
        ('CASE_UPDATED', 'Case Updated'),
        ('VIDEO_DOWNLOADED', 'Video Downloaded'),
        ('VIDEO_SHARED', 'Video Shared'),
        ('DMCA_GENERATED', 'DMCA Report Generated'),
        ('USER_LOGIN', 'User Login'),
        ('USER_LOGOUT', 'User Logout'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    description = models.TextField()
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    related_movie = models.ForeignKey(Movie, on_delete=models.SET_NULL, null=True, blank=True)
    related_theatre = models.ForeignKey(Theatre, on_delete=models.SET_NULL, null=True, blank=True)
    related_case = models.ForeignKey(PiracyCase, on_delete=models.SET_NULL, null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.timestamp}] {self.action}: {self.description}"

    class Meta:
        ordering = ['-timestamp']


class Notification(models.Model):
    TYPE_CHOICES = (
        ('SUCCESS', 'Success'),
        ('WARNING', 'Warning'),
        ('DANGER', 'Danger'),
        ('INFO', 'Info'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='INFO')
    is_read = models.BooleanField(default=False)
    link = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{'🔴' if not self.is_read else '⚪'} {self.title}"

    class Meta:
        ordering = ['-created_at']



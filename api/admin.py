from django.contrib import admin
from .models import Theatre, Movie, MovieTiming, WatermarkTask, PiracyCase, AuditLog, Notification, UserProfile


@admin.register(Theatre)
class TheatreAdmin(admin.ModelAdmin):
    list_display = ['name', 'location', 'compliance_score', 'total_incidents', 'is_blacklisted']
    list_filter = ['is_blacklisted']


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    list_display = ['title', 'created_at']


@admin.register(MovieTiming)
class MovieTimingAdmin(admin.ModelAdmin):
    list_display = ['movie', 'theatre', 'time']


@admin.register(WatermarkTask)
class WatermarkTaskAdmin(admin.ModelAdmin):
    list_display = ['id', 'movie', 'theatre', 'status', 'phase', 'progress_pct',
                    'watermark_strength', 'created_at']
    list_filter = ['status', 'phase']


@admin.register(PiracyCase)
class PiracyCaseAdmin(admin.ModelAdmin):
    list_display = ['case_number', 'movie', 'theatre', 'status', 'severity', 'confidence', 'created_at']
    list_filter = ['status', 'severity']


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['action', 'description', 'user', 'timestamp']
    list_filter = ['action']
    readonly_fields = ['action', 'description', 'user', 'related_movie', 'related_theatre', 'related_case', 'timestamp']


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['title', 'type', 'is_read', 'created_at']
    list_filter = ['type', 'is_read']


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'role', 'created_at']
    list_filter = ['role']

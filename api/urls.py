from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TheatreViewSet, MovieViewSet, MovieTimingViewSet, WatermarkTaskViewSet,
    PiracyCaseViewSet, AuditLogViewSet, NotificationViewSet,
    register_user, login_user, logout_user, current_user, analytics_data,
    generate_presigned_url
)

router = DefaultRouter()
router.register(r'theatres', TheatreViewSet)
router.register(r'movies', MovieViewSet)
router.register(r'timings', MovieTimingViewSet)
router.register(r'tasks', WatermarkTaskViewSet)
router.register(r'cases', PiracyCaseViewSet)
router.register(r'audit', AuditLogViewSet)
router.register(r'notifications', NotificationViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('auth/register/', register_user),
    path('auth/login/', login_user),
    path('auth/logout/', logout_user),
    path('auth/me/', current_user),
    path('analytics/', analytics_data),
    path('upload/presigned/', generate_presigned_url),
]

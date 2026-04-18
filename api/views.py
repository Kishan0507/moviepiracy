from rest_framework import viewsets, status, parsers
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.http import FileResponse, HttpResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db.models import Count, Avg, Q, F
from django.db.models.functions import TruncMonth, TruncWeek
from django.utils import timezone
from datetime import timedelta
import os
import zipfile
import tempfile

from .models import (
    Theatre, Movie, MovieTiming, WatermarkTask, PiracyCase,
    AuditLog, Notification
)
from .serializers import (
    TheatreSerializer, MovieSerializer, MovieTimingSerializer,
    WatermarkTaskSerializer, PiracyCaseSerializer, AuditLogSerializer,
    NotificationSerializer, UserRegistrationSerializer
)
from .tasks import dispatch_watermark
from .audit import log_action, log_and_notify


# ─────── Auth ───────

@api_view(['POST'])
def register_user(request):
    serializer = UserRegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response({
        "message": f"User '{user.username}' created successfully",
        "username": user.username,
        "role": user.profile.role,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
def login_user(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(request, username=username, password=password)
    if user:
        login(request, user)
        log_action('USER_LOGIN', f"User '{username}' logged in", user=user)
        return Response({
            "message": "Login successful",
            "username": user.username,
            "role": getattr(user, 'profile', None) and user.profile.role or 'ADMIN',
        })
    return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
def logout_user(request):
    if request.user.is_authenticated:
        log_action('USER_LOGOUT', f"User '{request.user.username}' logged out", user=request.user)
    logout(request)
    return Response({"message": "Logged out"})


@api_view(['GET'])
def current_user(request):
    if request.user.is_authenticated:
        return Response({
            "authenticated": True,
            "username": request.user.username,
            "email": request.user.email,
            "role": getattr(request.user, 'profile', None) and request.user.profile.role or 'ADMIN',
        })
    return Response({"authenticated": False})


# ─────── Core Viewsets ───────

class MovieTimingViewSet(viewsets.ModelViewSet):
    queryset = MovieTiming.objects.all()
    serializer_class = MovieTimingSerializer

    def perform_create(self, serializer):
        timing = serializer.save()
        log_action('SHOWTIME_CREATED',
                   f'Showtime: "{timing.movie.title}" at {timing.theatre.name}',
                   movie=timing.movie, theatre=timing.theatre)


class TheatreViewSet(viewsets.ModelViewSet):
    queryset = Theatre.objects.all()
    serializer_class = TheatreSerializer

    def perform_create(self, serializer):
        theatre = serializer.save()
        log_and_notify('THEATRE_REGISTERED',
                       f'New theatre registered: "{theatre.name}" at {theatre.location}',
                       title=f'Theatre "{theatre.name}" registered',
                       ntype='SUCCESS', link='/theatres', theatre=theatre)


class MovieViewSet(viewsets.ModelViewSet):
    queryset = Movie.objects.all()
    serializer_class = MovieSerializer

    def perform_create(self, serializer):
        movie = serializer.save()
        log_and_notify('MOVIE_UPLOADED',
                       f'Movie "{movie.title}" uploaded',
                       title=f'Movie "{movie.title}" uploaded',
                       ntype='SUCCESS', link='/movies', movie=movie)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        movie = self.get_object()
        if not movie.original_file:
            return Response({"error": "No file available"}, status=status.HTTP_404_NOT_FOUND)
        file_path = movie.original_file.path
        if not os.path.exists(file_path):
            return Response({"error": "File not found on server"}, status=status.HTTP_404_NOT_FOUND)
        log_action('VIDEO_DOWNLOADED', f'Movie "{movie.title}" downloaded', movie=movie)
        response = FileResponse(open(file_path, 'rb'), content_type='application/octet-stream')
        response['Content-Disposition'] = f'attachment; filename="{os.path.basename(file_path)}"'
        return response

    @action(detail=False, methods=['post'], parser_classes=[parsers.MultiPartParser])
    def detect_frame(self, request):
        """Detect watermark from a single image (screenshot / phone photo of paused video)."""
        if 'file' not in request.FILES:
            return Response({"error": "No image file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES['file']
        from .image_detector import detect_from_image
        from datetime import datetime

        try:
            result = detect_from_image(uploaded_file)

            # ── Handle FORGED detection ──
            if result.get("forged"):
                case = PiracyCase.objects.create(
                    severity='CRITICAL', confidence=0,
                    description='CRYPTOGRAPHICALLY FORGED watermark detected via frame snapshot. '
                                'ECDSA signature verification FAILED. '
                                'Possible payload injection or spoofing attack.'
                )
                log_and_notify('PIRACY_DETECTED',
                               f'🔴 FORGED watermark detected! Case {case.case_number}. '
                               f'ECDSA signature verification FAILED.',
                               title=f'🔴 FORGED Watermark — Case {case.case_number}',
                               ntype='DANGER', link='/cases', case=case)
                return Response({
                    "success": False, "forged": True,
                    "error": result.get("error", "CRYPTOGRAPHICALLY FORGED"),
                    "case_number": case.case_number,
                    "case_id": str(case.id),
                    "detection_timestamp": datetime.now().isoformat(),
                    "confidence": 0, "risk_level": "CRITICAL",
                    "detection_method": "frame_snapshot",
                    "recommendations": [
                        "This watermark has been CRYPTOGRAPHICALLY FORGED",
                        "The ECDSA digital signature does not match the payload",
                        "Someone may be attempting to frame a theatre with a fake watermark",
                        "Preserve the original image as forensic evidence",
                        "Report to security team and investigate the source immediately",
                    ]
                }, status=status.HTTP_400_BAD_REQUEST)

            if result.get("success"):
                metadata = result.get("metadata", {})
                theatre_id = metadata.get("theatre_id")
                movie_id = metadata.get("movie_id")

                theatre_obj = None
                movie_obj = None
                theatre_data = None
                movie_data = None

                if theatre_id:
                    try:
                        theatre_obj = Theatre.objects.get(id=theatre_id)
                        theatre_data = {
                            "id": str(theatre_obj.id), "name": theatre_obj.name,
                            "location": theatre_obj.location,
                            "contact_email": theatre_obj.contact_email or "N/A",
                            "compliance_score": theatre_obj.compliance_score
                        }
                    except Theatre.DoesNotExist:
                        theatre_data = {"id": theatre_id, "name": "Unknown", "location": "Unknown", "contact_email": "N/A"}

                if movie_id:
                    try:
                        movie_obj = Movie.objects.get(id=movie_id)
                        movie_data = {
                            "id": str(movie_obj.id), "title": movie_obj.title,
                            "uploaded_at": movie_obj.created_at.isoformat() if movie_obj.created_at else None,
                        }
                    except Movie.DoesNotExist:
                        movie_data = {"id": movie_id, "title": "Unknown Movie"}

                # Auto-create piracy case
                case = PiracyCase.objects.create(
                    movie=movie_obj, theatre=theatre_obj,
                    severity='HIGH', confidence=95.0,
                    description=f'Pirated copy of "{movie_obj.title if movie_obj else "Unknown"}" '
                                f'traced to {theatre_obj.name if theatre_obj else "Unknown Theatre"} '
                                f'via frame snapshot detection'
                )

                # Reduce theatre compliance score
                if theatre_obj:
                    theatre_obj.total_incidents += 1
                    theatre_obj.compliance_score = max(0, theatre_obj.compliance_score - 15)
                    if theatre_obj.compliance_score < 30:
                        theatre_obj.is_blacklisted = True
                    theatre_obj.save()

                log_and_notify('PIRACY_DETECTED',
                               f'Piracy detected via frame snapshot: "{movie_obj.title if movie_obj else "Unknown"}" '
                               f'from {theatre_obj.name if theatre_obj else "Unknown"}. Case {case.case_number}',
                               title=f'🚨 Piracy Detected (Frame) — Case {case.case_number}',
                               ntype='DANGER', link='/cases',
                               movie=movie_obj, theatre=theatre_obj, case=case)

                return Response({
                    "success": True,
                    "message": "Watermark detected from frame snapshot — piracy source identified",
                    "theatre": theatre_data, "movie": movie_data,
                    "movie_id": movie_id,
                    "showtime": metadata.get("showtime", ""),
                    "case_number": case.case_number,
                    "case_id": str(case.id),
                    "detection_timestamp": datetime.now().isoformat(),
                    "confidence": 95.0, "risk_level": "HIGH",
                    "elapsed": result.get("elapsed", 0),
                    "embed_type": result.get("embed_type", "Frame Snapshot"),
                    "image_size": result.get("image_size", ""),
                    "detection_method": "frame_snapshot",
                    "signed": result.get("signed", False),
                    "signature_valid": result.get("signature_valid"),
                    "source_trace": {
                        "theatre_name": theatre_data.get("name", "Unknown") if theatre_data else "Unknown",
                        "theatre_location": theatre_data.get("location", "Unknown") if theatre_data else "Unknown",
                        "movie_title": movie_data.get("title", "Unknown") if movie_data else "Unknown",
                        "showtime": metadata.get("showtime", "Not Available"),
                        "piracy_origin": f"{theatre_data['name'] if theatre_data else 'Unknown'}, {theatre_data['location'] if theatre_data else 'Unknown'}",
                    },
                    "recommendations": [
                        "Contact the theatre management immediately",
                        "File a DMCA takedown notice for any public distribution",
                        "Preserve this detection report as evidence",
                        "Consider revoking future distribution rights to this theatre",
                        "Report to anti-piracy authorities if widespread distribution is confirmed"
                    ]
                })

            else:
                return Response({
                    "success": False, "error": result.get("error", "No watermark found"),
                    "detection_timestamp": datetime.now().isoformat(),
                    "detection_method": "frame_snapshot",
                    "confidence": 0, "risk_level": "UNKNOWN",
                    "elapsed": result.get("elapsed", 0),
                    "recommendations": [
                        "Ensure the QR watermark overlay is visible in the image",
                        "Try pausing the video at a different point where the QR is clearer",
                        "Use a clean screenshot instead of a phone camera photo if possible",
                        "Try the full video scan mode for more thorough detection",
                    ]
                }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], parser_classes=[parsers.MultiPartParser])
    def detect(self, request):
        if 'file' not in request.FILES:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES['file']
        import tempfile
        from .detector import detect_watermark
        from datetime import datetime

        try:
            fd, tmp_path = tempfile.mkstemp(suffix=".mp4")
            with os.fdopen(fd, 'wb') as f:
                for chunk in uploaded_file.chunks():
                    f.write(chunk)

            result = detect_watermark(tmp_path)
            try:
                os.remove(tmp_path)
            except OSError:
                pass

            # ── Handle FORGED detection ──
            if result.get("forged"):
                case = PiracyCase.objects.create(
                    severity='CRITICAL', confidence=0,
                    description='CRYPTOGRAPHICALLY FORGED watermark detected via full video scan. '
                                'ECDSA signature verification FAILED. '
                                'Possible payload injection or spoofing attack.'
                )
                log_and_notify('PIRACY_DETECTED',
                               f'🔴 FORGED watermark in video! Case {case.case_number}. '
                               f'ECDSA signature verification FAILED.',
                               title=f'🔴 FORGED Watermark — Case {case.case_number}',
                               ntype='DANGER', link='/cases', case=case)
                return Response({
                    "success": False, "forged": True,
                    "error": result.get("error", "CRYPTOGRAPHICALLY FORGED"),
                    "case_number": case.case_number,
                    "case_id": str(case.id),
                    "detection_timestamp": datetime.now().isoformat(),
                    "confidence": 0, "risk_level": "CRITICAL",
                    "scan_strategy": result.get("scan_strategy", "unknown"),
                    "frames_checked": result.get("frames_checked", 0),
                    "elapsed": result.get("elapsed", 0),
                    "detection_method": "full_video",
                    "recommendations": [
                        "This watermark has been CRYPTOGRAPHICALLY FORGED",
                        "The ECDSA digital signature does not match the payload",
                        "Someone may be attempting to frame a theatre with a fake watermark",
                        "Preserve the original video file as forensic evidence",
                        "Report to security team and investigate the source immediately",
                    ]
                }, status=status.HTTP_400_BAD_REQUEST)

            if result.get("success"):
                metadata = result.get("metadata", {})
                theatre_id = metadata.get("theatre_id")
                movie_id = metadata.get("movie_id")

                theatre_obj = None
                movie_obj = None
                theatre_data = None
                movie_data = None

                if theatre_id:
                    try:
                        theatre_obj = Theatre.objects.get(id=theatre_id)
                        theatre_data = {
                            "id": str(theatre_obj.id), "name": theatre_obj.name,
                            "location": theatre_obj.location,
                            "contact_email": theatre_obj.contact_email or "N/A",
                            "compliance_score": theatre_obj.compliance_score
                        }
                    except Theatre.DoesNotExist:
                        theatre_data = {"id": theatre_id, "name": "Unknown", "location": "Unknown", "contact_email": "N/A"}

                if movie_id:
                    try:
                        movie_obj = Movie.objects.get(id=movie_id)
                        movie_data = {
                            "id": str(movie_obj.id), "title": movie_obj.title,
                            "uploaded_at": movie_obj.created_at.isoformat() if movie_obj.created_at else None,
                        }
                    except Movie.DoesNotExist:
                        movie_data = {"id": movie_id, "title": "Unknown Movie"}

                # Auto-create piracy case
                case = PiracyCase.objects.create(
                    movie=movie_obj, theatre=theatre_obj,
                    severity='HIGH', confidence=92.5,
                    description=f'Pirated copy of "{movie_obj.title if movie_obj else "Unknown"}" '
                                f'traced to {theatre_obj.name if theatre_obj else "Unknown Theatre"}'
                )

                # Reduce theatre compliance score
                if theatre_obj:
                    theatre_obj.total_incidents += 1
                    theatre_obj.compliance_score = max(0, theatre_obj.compliance_score - 15)
                    if theatre_obj.compliance_score < 30:
                        theatre_obj.is_blacklisted = True
                    theatre_obj.save()

                log_and_notify('PIRACY_DETECTED',
                               f'Piracy detected: "{movie_obj.title if movie_obj else "Unknown"}" '
                               f'from {theatre_obj.name if theatre_obj else "Unknown"}. Case {case.case_number}',
                               title=f'🚨 Piracy Detected — Case {case.case_number}',
                               ntype='DANGER', link='/cases',
                               movie=movie_obj, theatre=theatre_obj, case=case)

                return Response({
                    "success": True,
                    "message": "Watermark detected — piracy source identified",
                    "theatre": theatre_data, "movie": movie_data,
                    "movie_id": movie_id,
                    "showtime": metadata.get("showtime", ""),
                    "case_number": case.case_number,
                    "case_id": str(case.id),
                    "detection_timestamp": datetime.now().isoformat(),
                    "confidence": 92.5, "risk_level": "HIGH",
                    "frames_checked": result.get("frames_checked", 0),
                    "elapsed": result.get("elapsed", 0),
                    "embed_type": result.get("embed_type", "Visible QR"),
                    "detection_method": "full_video",
                    "scan_strategy": result.get("scan_strategy", "unknown"),
                    "scan_phase": result.get("scan_phase"),
                    "total_video_duration": result.get("total_video_duration"),
                    "frames_skipped": result.get("frames_skipped", 0),
                    "signed": result.get("signed", False),
                    "signature_valid": result.get("signature_valid"),
                    "source_trace": {
                        "theatre_name": theatre_data.get("name", "Unknown") if theatre_data else "Unknown",
                        "theatre_location": theatre_data.get("location", "Unknown") if theatre_data else "Unknown",
                        "movie_title": movie_data.get("title", "Unknown") if movie_data else "Unknown",
                        "showtime": metadata.get("showtime", "Not Available"),
                        "piracy_origin": f"{theatre_data['name'] if theatre_data else 'Unknown'}, {theatre_data['location'] if theatre_data else 'Unknown'}",
                    },
                    "recommendations": [
                        "Contact the theatre management immediately",
                        "File a DMCA takedown notice for any public distribution",
                        "Preserve this detection report as evidence",
                        "Consider revoking future distribution rights to this theatre",
                        "Report to anti-piracy authorities if widespread distribution is confirmed"
                    ]
                })

            elif result.get("tampered"):
                case = PiracyCase.objects.create(
                    severity='CRITICAL', confidence=0,
                    description='Tampered watermark detected — GCM authentication failed. '
                                'Possible payload injection or spoofing attack.'
                )
                log_and_notify('PIRACY_DETECTED',
                               f'⚠️ TAMPERED watermark detected! Case {case.case_number}. '
                               f'GCM auth tag verification failed.',
                               title=f'🔴 TAMPERED Watermark — Case {case.case_number}',
                               ntype='DANGER', link='/cases', case=case)

                return Response({
                    "success": False, "tampered": True,
                    "error": result.get("error", "Watermark tampering detected"),
                    "case_number": case.case_number,
                    "case_id": str(case.id),
                    "detection_timestamp": datetime.now().isoformat(),
                    "confidence": 0, "risk_level": "CRITICAL",
                    "recommendations": [
                        "This watermark appears to have been tampered with",
                        "Preserve the original video file as evidence",
                        "Investigate potential payload injection attack",
                        "Report to security team immediately",
                    ]
                }, status=status.HTTP_400_BAD_REQUEST)

            else:
                return Response({
                    "success": False, "error": result.get("error", "No watermark found"),
                    "detection_timestamp": datetime.now().isoformat(),
                    "confidence": 0, "risk_level": "UNKNOWN",
                    "scan_strategy": result.get("scan_strategy", "unknown"),
                    "frames_checked": result.get("frames_checked", 0),
                    "elapsed": result.get("elapsed", 0),
                    "total_video_duration": result.get("total_video_duration"),
                    "frames_skipped": result.get("frames_skipped", 0),
                    "recommendations": [
                        "The video may not have been watermarked by this system",
                        "Try uploading a different segment of the video",
                        "Ensure the video quality is sufficient for detection"
                    ]
                }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WatermarkTaskViewSet(viewsets.ModelViewSet):
    queryset = WatermarkTask.objects.all()
    serializer_class = WatermarkTaskSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = serializer.save()

        # Extract specific showtime from request, OR auto-detect from active timings
        showtime_timestamp = request.data.get('showtime_timestamp')
        if not showtime_timestamp:
            timing = MovieTiming.objects.filter(movie=task.movie, theatre=task.theatre).first()
            if timing:
                showtime_timestamp = timing.time
        
        if showtime_timestamp:
            task.showtime_timestamp = showtime_timestamp
            task.save(update_fields=['showtime_timestamp'])

        # Smart dispatch — Celery if Redis, threading if filesystem broker
        celery_id, method = dispatch_watermark(str(task.id))
        if celery_id:
            task.celery_task_id = celery_id
            task.save(update_fields=['celery_task_id'])

        log_and_notify('WATERMARK_STARTED',
                       f'Watermark processing queued for "{task.movie.title}" → {task.theatre.name} (via {method})',
                       title=f'Processing: "{task.movie.title}"',
                       ntype='INFO', link='/',
                       movie=task.movie, theatre=task.theatre)

        headers = self.get_success_headers(serializer.data)
        response_data = WatermarkTaskSerializer(task).data
        return Response(response_data, status=status.HTTP_202_ACCEPTED, headers=headers)

    @action(detail=True, methods=['get'])
    def download_watermarked(self, request, pk=None):
        task = self.get_object()
        if not task.watermarked_file:
            return Response({"error": "No watermarked file available"}, status=status.HTTP_404_NOT_FOUND)
        file_path = task.watermarked_file.path
        if not os.path.exists(file_path):
            return Response({"error": "File not found on server"}, status=status.HTTP_404_NOT_FOUND)
        response = FileResponse(open(file_path, 'rb'), content_type='application/octet-stream')
        response['Content-Disposition'] = f'attachment; filename="{os.path.basename(file_path)}"'
        return response

    @action(detail=True, methods=['get'])
    def share(self, request, pk=None):
        task = self.get_object()
        if not task.watermarked_file:
            return Response({"error": "No watermarked file available yet"}, status=status.HTTP_404_NOT_FOUND)
        host = request.build_absolute_uri('/')[:-1]
        log_action('VIDEO_SHARED', f'Watermarked copy shared: "{task.movie.title}" for {task.theatre.name}',
                   movie=task.movie, theatre=task.theatre)
        return Response({
            "task_id": str(task.id),
            "movie_title": task.movie.title,
            "theatre_name": task.theatre.name,
            "download_url": f"{host}/api/tasks/{task.id}/download_watermarked/",
            "status": task.status,
        })


    @action(detail=False, methods=['get'])
    def stats(self, request):
        total = WatermarkTask.objects.count()
        completed = WatermarkTask.objects.filter(status='COMPLETED').count()
        processing = WatermarkTask.objects.filter(status='PROCESSING').count()
        failed = WatermarkTask.objects.filter(status='FAILED').count()
        pending = WatermarkTask.objects.filter(status='PENDING').count()
        return Response({
            "total": total, "completed": completed, "processing": processing,
            "failed": failed, "pending": pending,
            "total_movies": Movie.objects.count(),
            "total_theatres": Theatre.objects.count(),
            "total_showtimes": MovieTiming.objects.count(),
            "total_cases": PiracyCase.objects.count(),
            "open_cases": PiracyCase.objects.filter(status='OPEN').count(),
            "total_notifications": Notification.objects.filter(is_read=False).count(),
        })


# ─────── Piracy Cases ───────

class PiracyCaseViewSet(viewsets.ModelViewSet):
    queryset = PiracyCase.objects.all()
    serializer_class = PiracyCaseSerializer

    def perform_update(self, serializer):
        case = serializer.save()
        log_action('CASE_UPDATED', f'Case {case.case_number} updated to {case.status}', case=case)

    @action(detail=True, methods=['get'])
    def dmca(self, request, pk=None):
        """Generate and download DMCA takedown report as PDF."""
        from .dmca_generator import generate_dmca_pdf
        case = self.get_object()
        pdf_buffer = generate_dmca_pdf(case)
        log_action('DMCA_GENERATED', f'DMCA report generated for case {case.case_number}', case=case)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="DMCA_{case.case_number}.pdf"'
        return response


# ─────── Audit Log ───────

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer


# ─────── Notifications ───────

class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        Notification.objects.filter(is_read=False).update(is_read=True)
        return Response({"message": "All notifications marked as read"})

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save()
        return Response({"message": "Marked as read"})





# ─────── Analytics ───────

@api_view(['GET'])
def analytics_data(request):
    """Return comprehensive chart-ready data for the analytics dashboard."""
    now = timezone.now()

    # Cases by month (last 6 months)
    six_months_ago = now - timedelta(days=180)
    cases_by_month = (
        PiracyCase.objects
        .filter(created_at__gte=six_months_ago)
        .annotate(month=TruncMonth('created_at'))
        .values('month')
        .annotate(count=Count('id'))
        .order_by('month')
    )

    # Cases by severity per month
    cases_by_severity_month = (
        PiracyCase.objects
        .filter(created_at__gte=six_months_ago)
        .annotate(month=TruncMonth('created_at'))
        .values('month', 'severity')
        .annotate(count=Count('id'))
        .order_by('month')
    )

    # Transform into {month: {severity: count}} format
    severity_monthly = {}
    for entry in cases_by_severity_month:
        month_str = entry['month'].strftime('%b %Y')
        if month_str not in severity_monthly:
            severity_monthly[month_str] = {'month': month_str, 'CRITICAL': 0, 'HIGH': 0, 'MEDIUM': 0, 'LOW': 0}
        severity_monthly[month_str][entry['severity']] = entry['count']

    # Most pirated movies
    top_movies = (
        PiracyCase.objects
        .exclude(movie__isnull=True)
        .values('movie__title')
        .annotate(incidents=Count('id'))
        .order_by('-incidents')[:8]
    )

    # ── NAUGHTY LIST: Theatre risk ranking ──
    theatre_risks = list(
        Theatre.objects
        .values('id', 'name', 'location', 'compliance_score',
                'total_incidents', 'is_blacklisted', 'contact_email')
        .order_by('compliance_score')[:15]
    )
    # Add risk level labels
    for t in theatre_risks:
        score = t['compliance_score']
        if t['is_blacklisted']:
            t['risk_level'] = 'BLACKLISTED'
        elif score < 30:
            t['risk_level'] = 'CRITICAL'
        elif score < 50:
            t['risk_level'] = 'HIGH'
        elif score < 80:
            t['risk_level'] = 'WARNING'
        else:
            t['risk_level'] = 'LOW'

    # Task status distribution
    task_statuses = {
        'COMPLETED': WatermarkTask.objects.filter(status='COMPLETED').count(),
        'PROCESSING': WatermarkTask.objects.filter(status='PROCESSING').count(),
        'FAILED': WatermarkTask.objects.filter(status='FAILED').count(),
        'PENDING': WatermarkTask.objects.filter(status='PENDING').count(),
    }

    # Case severity distribution
    severity_dist = {
        'CRITICAL': PiracyCase.objects.filter(severity='CRITICAL').count(),
        'HIGH': PiracyCase.objects.filter(severity='HIGH').count(),
        'MEDIUM': PiracyCase.objects.filter(severity='MEDIUM').count(),
        'LOW': PiracyCase.objects.filter(severity='LOW').count(),
    }

    # Case status distribution (resolution rate)
    case_status_dist = {
        'OPEN': PiracyCase.objects.filter(status='OPEN').count(),
        'INVESTIGATING': PiracyCase.objects.filter(status='INVESTIGATING').count(),
        'RESOLVED': PiracyCase.objects.filter(status='RESOLVED').count(),
        'CLOSED': PiracyCase.objects.filter(status='CLOSED').count(),
    }

    total_cases = PiracyCase.objects.count()
    resolved_closed = case_status_dist['RESOLVED'] + case_status_dist['CLOSED']
    resolution_rate = (resolved_closed / total_cases * 100) if total_cases > 0 else 0

    # Risk distribution summary
    risk_summary = {
        'blacklisted': Theatre.objects.filter(is_blacklisted=True).count(),
        'critical': Theatre.objects.filter(compliance_score__lt=30, is_blacklisted=False).count(),
        'high_risk': Theatre.objects.filter(compliance_score__gte=30, compliance_score__lt=50).count(),
        'warning': Theatre.objects.filter(compliance_score__gte=50, compliance_score__lt=80).count(),
        'compliant': Theatre.objects.filter(compliance_score__gte=80).count(),
    }

    return Response({
        "cases_by_month": [
            {"month": c['month'].strftime('%b %Y'), "count": c['count']}
            for c in cases_by_month
        ],
        "cases_by_severity_month": list(severity_monthly.values()),
        "top_pirated_movies": list(top_movies),
        "theatre_risks": theatre_risks,
        "task_statuses": task_statuses,
        "severity_distribution": severity_dist,
        "case_status_distribution": case_status_dist,
        "resolution_rate": round(resolution_rate, 1),
        "risk_summary": risk_summary,
        "total_theatres": Theatre.objects.count(),
        "total_cases": total_cases,
    })


@api_view(['POST'])
def generate_presigned_url(request):
    """
    Generate a presigned URL for direct upload to object storage (S3/MinIO).
    Stub endpoint for future integration — currently returns a placeholder.
    """
    filename = request.data.get('filename', 'upload.mp4')
    content_type = request.data.get('content_type', 'video/mp4')
    return Response({
        "message": "Direct upload not configured — use standard upload endpoint",
        "upload_url": "/api/movies/",
        "method": "POST",
        "fields": {
            "filename": filename,
            "content_type": content_type,
        },
        "note": "Configure S3/MinIO credentials to enable presigned URL uploads"
    })

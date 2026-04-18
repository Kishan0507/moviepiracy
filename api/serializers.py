from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    Theatre, Movie, MovieTiming, WatermarkTask, PiracyCase,
    AuditLog, Notification, UserProfile
)


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source='user.username')
    email = serializers.ReadOnlyField(source='user.email')

    class Meta:
        model = UserProfile
        fields = ['id', 'username', 'email', 'role', 'created_at']


class UserRegistrationSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=6)
    role = serializers.ChoiceField(choices=['ADMIN', 'DISTRIBUTOR', 'INVESTIGATOR'], default='DISTRIBUTOR')

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists")
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )
        UserProfile.objects.create(user=user, role=validated_data.get('role', 'DISTRIBUTOR'))
        return user


class TheatreSerializer(serializers.ModelSerializer):
    risk_level = serializers.SerializerMethodField()

    class Meta:
        model = Theatre
        fields = '__all__'

    def get_risk_level(self, obj):
        if obj.is_blacklisted:
            return 'BLACKLISTED'
        if obj.compliance_score >= 80:
            return 'LOW'
        elif obj.compliance_score >= 50:
            return 'MEDIUM'
        else:
            return 'HIGH'


class MovieSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = Movie
        fields = '__all__'

    def validate_original_file(self, value):
        from django.conf import settings
        max_size = getattr(settings, 'CINEMARK_MAX_FILE_SIZE', 10 * 1024 * 1024 * 1024)
        if value.size > max_size:
            raise serializers.ValidationError(
                f"File too large: {value.size / (1024**3):.1f} GB. Maximum is {max_size / (1024**3):.0f} GB."
            )
        return value

    def get_download_url(self, obj):
        if obj.original_file:
            return f'/api/movies/{obj.id}/download/'
        return None

    def get_file_size(self, obj):
        try:
            if obj.original_file and obj.original_file.storage.exists(obj.original_file.name):
                size = obj.original_file.size
                if size < 1024:
                    return f"{size} B"
                elif size < 1024 * 1024:
                    return f"{size / 1024:.1f} KB"
                elif size < 1024 * 1024 * 1024:
                    return f"{size / (1024 * 1024):.1f} MB"
                else:
                    return f"{size / (1024 * 1024 * 1024):.2f} GB"
        except Exception:
            pass
        return None


class MovieTimingSerializer(serializers.ModelSerializer):
    theatre_name = serializers.ReadOnlyField(source='theatre.name')
    movie_title = serializers.ReadOnlyField(source='movie.title')

    class Meta:
        model = MovieTiming
        fields = '__all__'


class WatermarkTaskSerializer(serializers.ModelSerializer):
    movie_title = serializers.ReadOnlyField(source='movie.title')
    theatre_name = serializers.ReadOnlyField(source='theatre.name')
    watermarked_download_url = serializers.SerializerMethodField()

    class Meta:
        model = WatermarkTask
        fields = ['id', 'movie', 'movie_title', 'theatre', 'theatre_name', 'status',
                  'phase', 'progress_pct', 'celery_task_id',
                  'watermarked_file', 'watermarked_download_url',
                  'error_message', 'watermark_strength',
                  'showtime_timestamp', 'original_file_hash', 'created_at']
        read_only_fields = ['status', 'phase', 'progress_pct', 'celery_task_id',
                           'watermarked_file', 'error_message', 'watermark_strength',
                           'original_file_hash']

    def get_watermarked_download_url(self, obj):
        if obj.watermarked_file:
            return f'/api/tasks/{obj.id}/download_watermarked/'
        return None


class PiracyCaseSerializer(serializers.ModelSerializer):
    movie_title = serializers.ReadOnlyField(source='movie.title')
    theatre_name = serializers.ReadOnlyField(source='theatre.name')
    theatre_location = serializers.ReadOnlyField(source='theatre.location')

    class Meta:
        model = PiracyCase
        fields = '__all__'
        read_only_fields = ['case_number']


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source='user.username')
    movie_title = serializers.ReadOnlyField(source='related_movie.title')
    theatre_name = serializers.ReadOnlyField(source='related_theatre.name')
    case_number = serializers.ReadOnlyField(source='related_case.case_number')

    class Meta:
        model = AuditLog
        fields = '__all__'


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = '__all__'




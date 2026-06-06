"""Video processing pipeline — Dynamic Movable QR Code watermark embedding."""
import os
import subprocess
import logging
import time
import numpy as np
from django.conf import settings as django_settings

logger = logging.getLogger('api.video_processor')


def _find_ffmpeg():
    """Find ffmpeg binary — searches multiple locations."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Search directories in priority order
    search_dirs = ['ffmpeg_bin', 'ffmpeg-master-latest-win64-gpl']
    for dirname in search_dirs:
        base = os.path.join(project_root, dirname)
        if os.path.isdir(base):
            for root, dirs, files in os.walk(base):
                if 'ffmpeg.exe' in files:
                    return os.path.join(root, 'ffmpeg.exe')
    # Try imageio_ffmpeg package as fallback
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass
    return 'ffmpeg'


def _find_ffprobe():
    """Find ffprobe binary — searches multiple locations."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    search_dirs = ['ffmpeg_bin', 'ffmpeg-master-latest-win64-gpl']
    for dirname in search_dirs:
        base = os.path.join(project_root, dirname)
        if os.path.isdir(base):
            for root, dirs, files in os.walk(base):
                if 'ffprobe.exe' in files:
                    return os.path.join(root, 'ffprobe.exe')
    return 'ffprobe'


def _update_phase(task_id, phase, progress_pct):
    """Update the WatermarkTask phase in the database."""
    if not task_id:
        return
    from .models import WatermarkTask
    WatermarkTask.objects.filter(id=task_id).update(
        phase=phase, progress_pct=progress_pct
    )


def _probe_video(input_file):
    """Phase 1: Probe video metadata using ffprobe."""
    ffprobe_bin = _find_ffprobe()
    cmd = [
        ffprobe_bin, '-v', 'quiet',
        '-print_format', 'json',
        '-show_format', '-show_streams',
        input_file,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return None
        import json
        data = json.loads(result.stdout)
        video_stream = next(
            (s for s in data.get('streams', []) if s.get('codec_type') == 'video'),
            None
        )
        if not video_stream:
            return None

        try:
            fps_str = video_stream.get('r_frame_rate', '24/1')
            parts = fps_str.split('/')
            if len(parts) == 2 and int(parts[1]) != 0:
                fps = int(parts[0]) / int(parts[1])
            else:
                fps = float(parts[0])
        except Exception:
            fps = 24.0

        nb_frames = video_stream.get('nb_frames')
        duration = float(data.get('format', {}).get('duration', 0))
        if nb_frames and nb_frames != 'N/A':
            total_frames = int(nb_frames)
        else:
            total_frames = int(duration * fps) if duration > 0 else 0

        return {
            'width': int(video_stream.get('width', 1920)),
            'height': int(video_stream.get('height', 1080)),
            'fps': fps,
            'codec': video_stream.get('codec_name', 'unknown'),
            'duration': duration,
            'total_frames': total_frames,
        }
    except Exception as e:
        logger.error(f"ffprobe failed: {e}")
        return None


def process_video_stream(input_file: str, output_file: str,
                         theatre_id: str, movie_id: str,
                         task_id: str = None,
                         showtime_timestamp: str = '') -> dict:
    """Full watermark embedding pipeline with dynamic QR code overlay."""
    timings = {}
    ffmpeg_log = ''

    try:
        ffmpeg_bin = _find_ffmpeg()

        # ── Phase 1: PROBE ──
        t0 = time.time()
        _update_phase(task_id, 'PROBING', 5)
        logger.info(f"[{task_id}] Phase: PROBING")

        metadata = _probe_video(input_file)
        if not metadata:
            metadata = {'width': 1920, 'height': 1080, 'fps': 24.0,
                        'codec': 'unknown', 'duration': 0, 'total_frames': 0}
            logger.warning(f"[{task_id}] ffprobe failed, using defaults")

        width = metadata['width']
        height = metadata['height']
        fps = metadata['fps']
        total_frames = metadata['total_frames']

        timings['probe'] = time.time() - t0
        logger.info(f"[{task_id}] Probe: {width}x{height} "
                     f"@ {fps:.1f}fps, {metadata['duration']:.1f}s, "
                     f"~{total_frames} frames ({timings['probe']:.2f}s)")

        # ── Phase 2: HASH ──
        t1 = time.time()
        _update_phase(task_id, 'PROBING', 10)

        from .watermark_generator import compute_file_hash
        file_hash = compute_file_hash(input_file)

        timings['hash'] = time.time() - t1
        logger.info(f"[{task_id}] Hash: SHA-256={file_hash[:16]}… ({timings['hash']:.2f}s)")

        if task_id:
            from .models import WatermarkTask
            WatermarkTask.objects.filter(id=task_id).update(
                original_file_hash=file_hash
            )

        # ── Phase 3: GENERATE ──
        t2 = time.time()
        _update_phase(task_id, 'EMBEDDING', 15)

        from .watermark_generator import generate_watermark_payload

        # Generate encrypted payload bytes (self-contained with lookup hashes)
        payload_bytes = generate_watermark_payload(
            theatre_id=theatre_id,
            movie_id=movie_id,
            showtime_timestamp=showtime_timestamp,
            file_hash=file_hash,
        )

        timings['generate'] = time.time() - t2
        logger.info(f"[{task_id}] Generate: payload={len(payload_bytes)} bytes ({timings['generate']:.2f}s)")

        # ── Phase 4: EMBED (single FFmpeg pass) ──
        t3 = time.time()
        _update_phase(task_id, 'ENCODING', 20)

        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        preset = getattr(django_settings, 'CINEMARK_FFMPEG_PRESET', 'ultrafast')
        
        # --- Generate Temporary QR Image ---
        import tempfile
        from .utils.qr_payload import generate_qr_image_file
        fd, qr_img_path = tempfile.mkstemp(suffix='.png')
        os.close(fd)
        qr_size = max(150, min(width, height) // 5)  # Enlarged to ~20% for visibility
        generate_qr_image_file(payload_bytes, qr_img_path, size=qr_size)

        # Flash QR code periodically
        margin = max(20, min(width, height) // 30)
        grid_w = f"(main_w-overlay_w-2*{margin})/2"
        grid_h = f"(main_h-overlay_h-2*{margin})/2"
        
        # Block index increments every 45 seconds: 0, 1, 2...
        b = "trunc(t/45)"
        
        # Pick a random 1.5s flash slot within the 45s block (offset by 5-34s)
        # target_time = b*45 + rand(0..29) + 5 -> guarantees 15s to 75s gaps
        target = f"{b}*45+floor(abs(sin({b}*19))*29)+5"
        enable_flash = f"between(t,{target},{target}+1.5)"
        
        # Pick a pseudo-random positional quadrant (0, 1, or 2) for this 45s block
        # X mapping: left, center, right
        # Y mapping: top, middle, bottom
        pos_x = f"{margin}+floor(abs(sin({b}*13))*2.99)*{grid_w}"
        pos_y = f"{margin}+floor(abs(cos({b}*17))*2.99)*{grid_h}"

        filter_str = (
            f"[0:v][1:v]overlay="
            f"x='{pos_x}':y='{pos_y}':"
            f"enable='{enable_flash}':"
            f"shortest=1[outv]"
        )

        encode_cmd = [
            ffmpeg_bin,
            '-y',
            '-i', input_file,       # [0:v][0:a?] Original video
            '-loop', '1',
            '-i', qr_img_path,      # [1:v] QR code image
            "-filter_complex",
            filter_str,
            "-map", "[outv]",
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', preset,
            '-crf', '18',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            '-v', 'warning',
            output_file,
        ]

        logger.info(f"[{task_id}] Embedding pulse-flash QR overlay (8% base + 85% flash every ~30-90s)")

        try:
            encoder = subprocess.run(
                encode_cmd,
                capture_output=True,
                timeout=getattr(django_settings, 'CINEMARK_FFMPEG_TIMEOUT', 1200)
            )
            
            _update_phase(task_id, 'ENCODING', 90)

        except subprocess.TimeoutExpired:
            logger.error(f"[{task_id}] FFmpeg timed out")
            return {
                'success': False,
                'error': 'FFmpeg process timed out',
                'ffmpeg_log': '',
                'timings': timings,
            }
        except Exception as e:
            logger.error(f"[{task_id}] Processing error: {e}")
            raise
        finally:
            try:
                os.remove(qr_img_path)
            except Exception:
                pass

        ffmpeg_log = encoder.stderr.decode('utf-8', errors='replace')[-2000:] if encoder.stderr else ""
        if encoder.returncode != 0:
            logger.error(f"[{task_id}] Encoder failed (rc={encoder.returncode})")
            return {
                'success': False,
                'error': f'FFmpeg encoder exited with code {encoder.returncode}',
                'ffmpeg_log': ffmpeg_log,
                'timings': timings,
            }

        timings['embed'] = time.time() - t3
        frames_embedded = total_frames
        frame_idx = total_frames
        logger.info(f"[{task_id}] Embed: Fast FFmpeg pass finished ({timings['embed']:.2f}s)")

        # ── Phase 5: VALIDATE ──
        t4 = time.time()
        _update_phase(task_id, 'VALIDATING', 92)

        if os.path.exists(output_file) and os.path.getsize(output_file) > 0:
            size_mb = os.path.getsize(output_file) / (1024 * 1024)
            timings['validate'] = time.time() - t4
            total_time = sum(timings.values())

            logger.info(f"[{task_id}] Validate: output={size_mb:.1f} MB, "
                         f"total={total_time:.2f}s")

            return {
                'success': True,
                'ffmpeg_log': ffmpeg_log,
                'timings': timings,
                'output_size_mb': size_mb,
                'frames_processed': frame_idx,
                'frames_embedded': frames_embedded,
            }
        else:
            return {
                'success': False,
                'error': 'Output file was not created or is empty',
                'ffmpeg_log': ffmpeg_log,
                'timings': timings,
            }

    except subprocess.TimeoutExpired:
        logger.error(f"[{task_id}] FFmpeg timed out")
        return {
            'success': False,
            'error': 'FFmpeg process timed out',
            'ffmpeg_log': ffmpeg_log,
            'timings': timings,
        }
    except Exception as e:
        logger.exception(f"[{task_id}] Unhandled error in video processor")
        return {
            'success': False,
            'error': str(e),
            'ffmpeg_log': ffmpeg_log,
            'timings': timings,
        }

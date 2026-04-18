"""
Piracy detection pipeline — Fast Multi-Threaded Multi-Angle Scanner.

Includes: threaded concurrent parsing, FFMPEG frame downscaling, 
and mobile video rotational distortion resolution.
"""
import os
import logging
import time
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

logger = logging.getLogger('api.detector')


def detect_watermark(input_file: str,
                     sample_interval_seconds: float = 1.0,
                     max_frames_to_check: int = 120) -> dict:
    """
    Scan a video for the visible dynamic QR code watermark.
    Sweeps frames quickly using concurrent workers and rot-matrices.
    """
    start_time = time.time()
    from django.conf import settings as django_settings
    from .watermark_generator import decrypt_watermark_payload
    from pyzbar.pyzbar import decode as pyzbar_decode
    import cv2

    def _find_ffmpeg():
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        for dirname in ['ffmpeg_bin', 'ffmpeg-master-latest-win64-gpl']:
            base = os.path.join(project_root, dirname)
            if os.path.isdir(base):
                for root, dirs, files in os.walk(base):
                    if 'ffmpeg.exe' in files:
                        return os.path.join(root, 'ffmpeg.exe')
        try:
            import imageio_ffmpeg
            return imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            pass
        return 'ffmpeg'

    def _find_ffprobe():
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        for dirname in ['ffmpeg_bin', 'ffmpeg-master-latest-win64-gpl']:
            base = os.path.join(project_root, dirname)
            if os.path.isdir(base):
                for root, dirs, files in os.walk(base):
                    if 'ffprobe.exe' in files:
                        return os.path.join(root, 'ffprobe.exe')
        return 'ffprobe'

    def _probe_video(input_file):
        import json
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
            return {
                'width': int(video_stream.get('width', 1920)),
                'height': int(video_stream.get('height', 1080)),
                'fps': fps,
                'duration': float(data.get('format', {}).get('duration', 0)),
            }
        except Exception as e:
            logger.error(f"ffprobe failed: {e}")
            return None

    def _extract_y_plane(ffmpeg_bin, input_file, timestamp, orig_w, orig_h):
        # Scale output width down to 720p maximum so parsing is blazing fast
        scale_limit = 720
        proc_w = orig_w
        proc_h = orig_h
        if orig_h > scale_limit:
            ratio = scale_limit / orig_h
            proc_w = int(orig_w * ratio)
            proc_h = scale_limit

        proc_w = proc_w if proc_w % 2 == 0 else proc_w - 1
        proc_h = proc_h if proc_h % 2 == 0 else proc_h - 1
        y_size = proc_w * proc_h

        cmd = [
            ffmpeg_bin,
            '-ss', str(timestamp),
            '-i', input_file,
            '-vframes', '1',
            '-f', 'rawvideo',
            '-pix_fmt', 'yuv420p',
            '-s', f'{proc_w}x{proc_h}',
            '-v', 'quiet',
            'pipe:1',
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=15)
            if result.returncode == 0 and len(result.stdout) >= y_size:
                y_plane = np.frombuffer(result.stdout[:y_size],
                                        dtype=np.uint8).reshape((proc_h, proc_w))
                return y_plane
        except Exception as e:
            logger.debug(f"Frame extraction at {timestamp}s failed: {e}")
        return None

    ffmpeg_bin = _find_ffmpeg()

    try:
        metadata = _probe_video(input_file)
        if not metadata:
            metadata = {'width': 1920, 'height': 1080, 'fps': 24.0, 'duration': 10}
            logger.warning("ffprobe failed, using defaults for detection")

        duration = metadata['duration']
        width = metadata['width']
        height = metadata['height']

        logger.info(f"Fast Multi-Threaded detection: {duration:.1f}s video, "
                    f"{width}x{height} (Downscaling internally)")

        # Prioritize checking random distribution over just the end.
        import random
        timestamps = list(np.arange(0, duration, sample_interval_seconds))
        random.shuffle(timestamps)
        timestamps = timestamps[:max_frames_to_check]

        if not timestamps:
            timestamps = [0.0]

        stop_event = threading.Event()
        result_lock = threading.Lock()
        final_result = None
        frames_checked_for_qr = 0

        def process_timestamp(ts):
            nonlocal final_result, frames_checked_for_qr
            if stop_event.is_set():
                return
            
            y_plane = _extract_y_plane(ffmpeg_bin, input_file, ts, width, height)
            if y_plane is None:
                return

            with result_lock:
                frames_checked_for_qr += 1

            if stop_event.is_set():
                return

            # Apply Gaussian Denoising right away for mobile upload noise
            base_np = cv2.GaussianBlur(y_plane, (3, 3), 0)

            def attempt_parse(np_mat):
                if stop_event.is_set():
                    return None
                
                # Fast standard scan
                decoded = pyzbar_decode(Image.fromarray(np_mat, mode='L'))
                if decoded:
                    return decoded
                
                # Heavy CLAHE scan for weird mobile contrasts
                clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
                cl_img = clahe.apply(np_mat)
                thresh = cv2.adaptiveThreshold(
                    cl_img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY, 21, 4
                )
                decoded = pyzbar_decode(Image.fromarray(thresh))
                if decoded:
                    return decoded
                return pyzbar_decode(Image.fromarray(cl_img))

            decoded_items = None

            # Loop multiple angles to combat rotated mobile phone grabs!
            for angle in [0, 90, 180, 270]:
                if angle == 0:
                    rot_np = base_np
                elif angle == 90:
                    rot_np = cv2.rotate(base_np, cv2.ROTATE_90_CLOCKWISE)
                elif angle == 180:
                    rot_np = cv2.rotate(base_np, cv2.ROTATE_180)
                elif angle == 270:
                    rot_np = cv2.rotate(base_np, cv2.ROTATE_90_COUNTERCLOCKWISE)
                
                decoded_items = attempt_parse(rot_np)
                if decoded_items:
                    break

            if decoded_items:
                for item in decoded_items:
                    if item.type == 'QRCODE' and not stop_event.is_set():
                        import base64
                        try:
                            payload_b64 = item.data.decode('utf-8')
                            payload_bytes = base64.b64decode(payload_b64)
                            res = decrypt_watermark_payload(payload_bytes)
                            if res.get('success') or res.get('forged'):
                                with result_lock:
                                    if not stop_event.is_set(): # Double check
                                        stop_event.set()
                                        final_result = res
                                        final_result['scan_strategy'] = 'fast_threaded'
                                        final_result['elapsed'] = time.time() - start_time
                                        logger.info("QR Watermark identified! Halting all threads.")
                        except Exception as e:
                            logger.warning(f"Failed to decode payload: {e}")

        # Spawn workers
        with ThreadPoolExecutor(max_workers=4) as executor:
            for ts in timestamps:
                if stop_event.is_set():
                    break
                executor.submit(process_timestamp, ts)

        if final_result:
            final_result['frames_checked'] = frames_checked_for_qr
            return final_result

        elapsed = time.time() - start_time
        return {
            "success": False,
            "error": f"No watermark detected after scanning {frames_checked_for_qr} frames. "
                     f"The video may not be watermarked.",
            "frames_checked": frames_checked_for_qr,
            "elapsed": elapsed,
            "scan_strategy": "fast_threaded",
        }

    except Exception as e:
        logger.exception(f"Detection pipeline error: {e}")
        return {"success": False, "error": str(e)}

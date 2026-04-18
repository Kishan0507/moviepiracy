"""
Image-based piracy detection — single frame/screenshot QR code extraction.

Instead of scanning an entire video, this module detects the QR code watermark
from a single image — a screenshot, a photo of a paused screen, or a frame
captured from a phone camera recording.

Multi-strategy QR recovery pipeline:
  1. Direct pyzbar decode on raw image
  2. CLAHE enhancement + multiple adaptive threshold block sizes
  3. Morphological cleanup (erode/dilate) for phone-camera noise
  4. Inverted variants of all above strategies
  5. Multi-scale detection (resize + retry for small QR codes)
"""
import logging
import time
import numpy as np
from PIL import Image
from io import BytesIO

logger = logging.getLogger('api.image_detector')


def _decode_qr_from_array(img_array, label=""):
    """Try to decode QR from a numpy array (grayscale uint8)."""
    from pyzbar.pyzbar import decode as pyzbar_decode
    pil_img = Image.fromarray(img_array, mode='L')
    decoded = pyzbar_decode(pil_img)
    for item in decoded:
        if item.type == 'QRCODE':
            logger.debug(f"QR found via {label}")
            return item.data
    return None


def _try_all_strategies(gray_np):
    """
    Apply multiple image processing strategies to extract the QR code.
    Returns raw QR data bytes on success, None on failure.
    """
    import cv2

    # Strategy 1: Direct decode on raw grayscale
    result = _decode_qr_from_array(gray_np, "direct")
    if result:
        return result

    # Strategy 2: CLAHE enhancement
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    cl_img = clahe.apply(gray_np)

    result = _decode_qr_from_array(cl_img, "CLAHE")
    if result:
        return result

    # Strategy 3: Adaptive thresholding with multiple block sizes
    for block_size in [11, 21, 31, 51]:
        thresh = cv2.adaptiveThreshold(
            cl_img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, block_size, 4
        )

        # Try normal threshold
        result = _decode_qr_from_array(thresh, f"thresh-{block_size}")
        if result:
            return result

        # Try inverted (white modules → black for pyzbar)
        thresh_inv = cv2.bitwise_not(thresh)
        result = _decode_qr_from_array(thresh_inv, f"thresh-inv-{block_size}")
        if result:
            return result

    # Strategy 4: Morphological cleanup for noisy phone camera captures
    kernel_small = np.ones((2, 2), np.uint8)
    kernel_medium = np.ones((3, 3), np.uint8)

    for block_size in [21, 31]:
        thresh = cv2.adaptiveThreshold(
            cl_img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, block_size, 4
        )

        # Erode then dilate (opening) — removes small noise
        opened = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel_small)
        result = _decode_qr_from_array(opened, f"morph-open-{block_size}")
        if result:
            return result

        # Dilate then erode (closing) — fills small gaps
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel_medium)
        result = _decode_qr_from_array(closed, f"morph-close-{block_size}")
        if result:
            return result

        # Inverted versions
        for processed, name in [(opened, "open-inv"), (closed, "close-inv")]:
            inv = cv2.bitwise_not(processed)
            result = _decode_qr_from_array(inv, f"morph-{name}-{block_size}")
            if result:
                return result

    # Strategy 5: Otsu binarization
    _, otsu = cv2.threshold(cl_img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    result = _decode_qr_from_array(otsu, "otsu")
    if result:
        return result
    result = _decode_qr_from_array(cv2.bitwise_not(otsu), "otsu-inv")
    if result:
        return result

    # Strategy 6: Sharpening filter
    sharpen_kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(cl_img, -1, sharpen_kernel)
    result = _decode_qr_from_array(sharpened, "sharpened")
    if result:
        return result

    for block_size in [21, 31]:
        thresh = cv2.adaptiveThreshold(
            sharpened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, block_size, 4
        )
        result = _decode_qr_from_array(thresh, f"sharp-thresh-{block_size}")
        if result:
            return result
        result = _decode_qr_from_array(
            cv2.bitwise_not(thresh), f"sharp-thresh-inv-{block_size}"
        )
        if result:
            return result

    return None


def detect_from_image(image_file) -> dict:
    """
    Detect QR code watermark from a single image file.

    Args:
        image_file: A file-like object (Django UploadedFile, BytesIO, etc.)
            containing a screenshot or photo of a video frame.

    Returns:
        Dict with 'success', 'metadata', 'elapsed', 'strategy', etc.
    """
    from .watermark_generator import decrypt_watermark_payload
    import base64

    start_time = time.time()

    try:
        # Load image
        pil_img = Image.open(image_file)
        pil_img = pil_img.convert('RGB')
        width, height = pil_img.size

        logger.info(f"Image detection: {width}x{height} image")

        # Convert to grayscale numpy
        gray_pil = pil_img.convert('L')
        gray_np = np.array(gray_pil, dtype=np.uint8)

        import cv2

        qr_data = None
        
        # Helper to apply rotations and blur
        def _check_rotations(base_np, scale_label="1.0"):
            blurred_np = cv2.GaussianBlur(base_np, (5, 5), 0)
            for angle in [0, 90, 180, 270]:
                if angle == 0:
                    rot_np = blurred_np
                elif angle == 90:
                    rot_np = cv2.rotate(blurred_np, cv2.ROTATE_90_CLOCKWISE)
                elif angle == 180:
                    rot_np = cv2.rotate(blurred_np, cv2.ROTATE_180)
                elif angle == 270:
                    rot_np = cv2.rotate(blurred_np, cv2.ROTATE_90_COUNTERCLOCKWISE)
                
                logger.info(f"Trying scale {scale_label}x at angle {angle}°")
                result = _try_all_strategies(rot_np)
                if result:
                    return result
            return None

        # Try detection at original scale with rotations
        qr_data = _check_rotations(gray_np, "1.0")

        # If not found, try multi-scale (upscale small images, downscale huge ones)
        if qr_data is None:
            scales = []
            if max(width, height) < 1000:
                scales = [1.5, 2.0, 2.5]  # Upscale small images
            elif max(width, height) > 3000:
                scales = [0.75, 0.5]  # Downscale huge images
            else:
                scales = [0.75, 1.5, 2.0]

            for scale in scales:
                new_w = int(width * scale)
                new_h = int(height * scale)
                resized = cv2.resize(gray_np, (new_w, new_h),
                                     interpolation=cv2.INTER_LINEAR)
                qr_data = _check_rotations(resized, str(scale))
                if qr_data:
                    break

        if qr_data is None:
            elapsed = time.time() - start_time
            logger.info(f"No QR code found in image after {elapsed:.2f}s")
            return {
                "success": False,
                "error": "No QR code watermark detected in this image. "
                         "Tips: Ensure the QR overlay is visible in the frame. "
                         "Try pausing at a different moment where the QR is clearly visible. "
                         "If using a phone camera, ensure the image is in focus.",
                "elapsed": elapsed,
                "image_size": f"{width}x{height}",
            }

        # Decode the QR payload
        try:
            payload_str = qr_data.decode('utf-8')
            payload_bytes = base64.b64decode(payload_str)

            result = decrypt_watermark_payload(payload_bytes)
            if result.get('success'):
                elapsed = time.time() - start_time
                metadata = result['metadata']
                logger.info(
                    f"Image QR watermark identified: movie={metadata['movie_id']}, "
                    f"theatre={metadata['theatre_id']} in {elapsed:.2f}s"
                )
                return {
                    "success": True,
                    "metadata": metadata,
                    "elapsed": elapsed,
                    "embed_type": "Visible QR (Frame Snapshot)",
                    "image_size": f"{width}x{height}",
                    "detection_method": "image_frame",
                    "signed": result.get("signed", False),
                    "signature_valid": result.get("signature_valid"),
                }
            elif result.get('forged'):
                elapsed = time.time() - start_time
                logger.warning(f"FORGED watermark detected in image!")
                return {
                    "success": False,
                    "forged": True,
                    "error": result.get("error", "CRYPTOGRAPHICALLY FORGED"),
                    "elapsed": elapsed,
                    "image_size": f"{width}x{height}",
                    "detection_method": "image_frame",
                }
            else:
                elapsed = time.time() - start_time
                return {
                    "success": False,
                    "error": result.get("error", "Failed to decrypt QR payload"),
                    "elapsed": elapsed,
                }

        except Exception as e:
            elapsed = time.time() - start_time
            logger.warning(f"QR payload decode failed: {e}")
            return {
                "success": False,
                "error": f"QR code found but payload decoding failed: {str(e)}",
                "elapsed": elapsed,
            }

    except Exception as e:
        elapsed = time.time() - start_time
        logger.exception(f"Image detection error: {e}")
        return {
            "success": False,
            "error": str(e),
            "elapsed": elapsed,
        }

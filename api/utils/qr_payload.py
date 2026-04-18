"""
QR Matrix payload encoder / decoder.

Converts encrypted+RS-encoded bytes into a binary QR matrix (2D numpy array)
for invisible DCT-domain embedding. The QR structure provides built-in
error correction on top of our Reed-Solomon coding.

The QR code is never rendered visually on the video — only its module data
(binary matrix) is used, which gets embedded into DCT coefficients.
"""
import numpy as np
import qrcode
import logging
from io import BytesIO
from PIL import Image

logger = logging.getLogger('api.qr_payload')


def payload_to_qr_matrix(payload_b64: str) -> np.ndarray:
    """
    Encode a base64 payload string into a binary QR matrix.

    Args:
        payload_b64: Base64-encoded encrypted payload string.

    Returns:
        2D numpy array of 0s and 1s (the QR module grid).
        1 = black module, 0 = white module.
    """
    qr = qrcode.QRCode(
        version=None,  # Auto-size
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=1,   # 1 pixel per module — raw matrix
        border=0,      # No border — we handle positioning ourselves
    )
    qr.add_data(payload_b64)
    qr.make(fit=True)

    # Get the module matrix directly from qrcode internals
    # Each entry is True (black) or False (white)
    modules = qr.modules
    matrix = np.array([[1 if cell else 0 for cell in row] for row in modules],
                      dtype=np.uint8)

    logger.debug(f"QR matrix: {matrix.shape[0]}x{matrix.shape[1]} modules "
                 f"from {len(payload_b64)} char payload")
    return matrix


def qr_matrix_to_payload(matrix: np.ndarray) -> str:
    """
    Decode a reconstructed binary QR matrix back to the payload string.

    Renders the matrix as a black-and-white image with quiet zone,
    then uses pyzbar to decode.

    Args:
        matrix: 2D numpy array of 0s and 1s.

    Returns:
        Decoded payload string, or empty string on failure.
    """
    try:
        from pyzbar.pyzbar import decode as pyzbar_decode

        h, w = matrix.shape

        # Render at larger scale with quiet zone for reliable pyzbar decoding
        scale = 10
        border = 4 * scale  # QR quiet zone = 4 modules

        img_h = h * scale + 2 * border
        img_w = w * scale + 2 * border
        img = np.ones((img_h, img_w), dtype=np.uint8) * 255  # White background

        for r in range(h):
            for c in range(w):
                if matrix[r, c]:
                    y0 = border + r * scale
                    x0 = border + c * scale
                    img[y0:y0 + scale, x0:x0 + scale] = 0  # Black

        pil_img = Image.fromarray(img, mode='L')

        decoded = pyzbar_decode(pil_img)
        for item in decoded:
            if item.type == 'QRCODE':
                return item.data.decode('utf-8')

        # Retry with threshold (in case of soft values)
        threshold_img = pil_img.point(lambda p: 255 if p > 128 else 0)
        decoded = pyzbar_decode(threshold_img)
        for item in decoded:
            if item.type == 'QRCODE':
                return item.data.decode('utf-8')

        logger.warning("qr_matrix_to_payload: pyzbar could not decode the matrix")
        return ''

    except Exception as e:
        logger.error(f"QR matrix decode error: {e}")
        return ''


def get_qr_matrix_size(payload_b64: str) -> int:
    """
    Return the side length of the QR matrix for a given payload.
    Useful for pre-calculating embedding region sizes.
    """
    matrix = payload_to_qr_matrix(payload_b64)
    return matrix.shape[0]


def generate_qr_image_file(payload_bytes: bytes, output_path: str, size: int = 150):
    """
    Generate a high-contrast, crystal-clear QR code PNG.

    Design goals for mobile phone capture resilience:
      - Pure stark contrast: Solid black modules on a pure white background
      - High error correction (ERROR_CORRECT_H — survives 30% damage)
      - Thick, standard 4-module quiet zone boundary around it
      - Perfectly sharp square modules (no frosted rounding)
      - Completely opaque (prevents movie backlight from blending into the QR)
    """
    import base64
    payload_b64 = base64.b64encode(payload_bytes).decode('utf-8')

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,   # Render large and crisp initially
        border=4,      # Standard thick white quiet zone
    )
    qr.add_data(payload_b64)
    qr.make(fit=True)

    # Produce the stark baseline QR image
    img = qr.make_image(fill_color="black", back_color="white").convert('RGBA')

    # Resize to the dynamic target size needed by FFmpeg
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    
    img.save(output_path, "PNG")
    logger.debug(f"Saved high-contrast solid QR image to {output_path} ({size}x{size})")


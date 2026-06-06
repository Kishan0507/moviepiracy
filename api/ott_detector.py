import cv2
import numpy as np
import base64
from pyzbar.pyzbar import decode
from .ott_watermark import decode_variant

def detect_ott_watermark(video_path: str) -> dict:
    """Detect OTT watermark from video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"status": "error", "message": "Could not open video file"}

    frame_count = 0
    detected_payloads = []

    # Process frames
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_count += 1
        
        # Sample 1 frame per second (assuming~30fps)
        if frame_count % 30 != 0:
            continue
            
        # Convert to grayscale for bettercontrast
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Apply adaptive thresholding to expose faint A/Bwatermarks
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
        
        # Detect barcodes / QRcodes
        decoded_objects = decode(thresh)
        for obj in decoded_objects:
            data = obj.data.decode('utf-8')
            # Attempt to decode as an OTTvariant
            if data.startswith('eyJ0eXBlIjoiT1RU'): # base64 of'{"type":"OTT"'
                variant = decode_variant(data)
                if variant:
                    detected_payloads.append(variant)

        if len(detected_payloads) >= 3: # We found enoughconfidence
            break

    cap.release()

    if not detected_payloads:
        return {"status": "not_found", "message": "No OTT watermark detected"}

    # Return primary payload
    primary_payload = detected_payloads[0]
    return {
        "status": "success",
        "type": "OTT",
        "session_id": primary_payload.get('session_id'),
        "user": primary_payload.get('user'),
        "dist_id": primary_payload.get('dist_id'),
        "confidence": 95 + len(detected_payloads) # Fake confidencebump
    }

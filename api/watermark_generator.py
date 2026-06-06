"""Watermark payload generation with ECDSA cryptographic signatures."""
import hashlib
import json
import logging
import os
import base64
from django.conf import settings as django_settings

logger = logging.getLogger('api.watermark_generator')


def compute_file_hash(file_path: str) -> str:
    """Compute SHA-256 hash of a file by streaming 64 KB chunks."""
    sha = hashlib.sha256()
    with open(file_path, 'rb') as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            sha.update(chunk)
    return sha.hexdigest()


def generate_watermark_payload(theatre_id: str, movie_id: str,
                               showtime_timestamp: str = '',
                               file_hash: str = '') -> bytes:
    """Generate a signed watermark payload containing metadata as JSON."""
    import uuid
    import time
    metadata = {
        "t": str(theatre_id),      # theatre_id
        "m": str(movie_id),        # movie_id
        "s": showtime_timestamp,   # showtime
        "h": file_hash[:16] if file_hash else '',  # truncated hash
        "n": uuid.uuid4().hex[:12],  # cryptographic nonce to prevent replay
        "ts": int(time.time()),      # creation timestamp 
    }
    json_bytes = json.dumps(metadata, separators=(',', ':')).encode('utf-8')

    # Sign the payload with ECDSA
    try:
        from .crypto_signer import sign_payload
        signature = sign_payload(json_bytes)
        # Combine: base64(json) + '.' + base64(signature)
        combined = (
            base64.b64encode(json_bytes).decode('utf-8') +
            '.' +
            base64.b64encode(signature).decode('utf-8')
        )
        logger.debug(f"Generated SIGNED payload for "
                     f"movie={movie_id[:8]}… theatre={theatre_id[:8]}… "
                     f"(sig={len(signature)} bytes)")
        return combined.encode('utf-8')
    except Exception as e:
        logger.warning(f"ECDSA signing failed, falling back to unsigned: {e}")
        # Fallback: unsigned payload (backwards compatible)
        return json_bytes


def decrypt_watermark_payload(payload_bytes: bytes) -> dict:
    """Decode and verify the signed payload."""
    try:
        decoded_str = payload_bytes.decode('utf-8')

        # Check if this is a signed payload (contains a dot separator)
        if '.' in decoded_str:
            parts = decoded_str.split('.', 1)
            if len(parts) == 2:
                json_b64, sig_b64 = parts
                try:
                    json_bytes = base64.b64decode(json_b64)
                    sig_bytes = base64.b64decode(sig_b64)

                    # Verify the ECDSA signature
                    from .crypto_signer import verify_payload
                    is_valid = verify_payload(json_bytes, sig_bytes)

                    if not is_valid:
                        logger.warning("CRYPTOGRAPHIC FORGERY DETECTED — "
                                       "signature verification FAILED!")
                        return {
                            "success": False,
                            "forged": True,
                            "error": "CRYPTOGRAPHICALLY FORGED — "
                                     "The digital signature on this watermark "
                                     "is INVALID. This payload was either "
                                     "tampered with or created by an unauthorized party.",
                        }

                    # Signature valid — parse the JSON metadata
                    metadata = json.loads(json_bytes.decode('utf-8'))
                    if 't' in metadata and 'm' in metadata:
                        return {
                            "success": True,
                            "signed": True,
                            "signature_valid": True,
                            "metadata": {
                                "theatre_id": metadata['t'],
                                "movie_id": metadata['m'],
                                "showtime": metadata.get('s', ''),
                                "file_hash": metadata.get('h', ''),
                            },
                        }
                    return {"success": False, "error": "Invalid payload structure"}

                except Exception as e:
                    logger.warning(f"Signed payload parsing failed: {e}")
                    # Fall through to try as plain JSON

        # Try to parse as plain JSON (unsigned / legacy format)
        try:
            metadata = json.loads(decoded_str)
        except json.JSONDecodeError:
            # Maybe it's base64-encoded JSON (from old format)
            try:
                raw_json = base64.b64decode(decoded_str)
                metadata = json.loads(raw_json.decode('utf-8'))
            except Exception:
                return {"success": False, "error": "Decryption produced invalid data"}

        # Verify it looks like a valid payload
        if 't' in metadata and 'm' in metadata:
            return {
                "success": True,
                "signed": False,
                "signature_valid": None,  # No signature to verify
                "metadata": {
                    "theatre_id": metadata['t'],
                    "movie_id": metadata['m'],
                    "showtime": metadata.get('s', ''),
                    "file_hash": metadata.get('h', ''),
                    "nonce": metadata.get('n', ''),
                    "created_ts": metadata.get('ts', 0),
                },
            }
        return {"success": False, "error": "Invalid payload structure"}

    except (json.JSONDecodeError, UnicodeDecodeError):
        return {"success": False, "error": "Decryption produced invalid data"}
    except Exception as e:
        return {"success": False, "error": str(e)}

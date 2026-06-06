"""ECDSA P-256 digital signature module for watermark payload integrity."""
import os
import logging
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend
from django.conf import settings as django_settings

logger = logging.getLogger('api.crypto_signer')

# Key file paths from settings
_PRIVATE_KEY_PATH = getattr(
    django_settings, 'CINEMARK_ECDSA_PRIVATE_KEY',
    os.path.join(django_settings.MEDIA_ROOT, 'keys', 'ecdsa_private.pem')
)
_PUBLIC_KEY_PATH = getattr(
    django_settings, 'CINEMARK_ECDSA_PUBLIC_KEY',
    os.path.join(django_settings.MEDIA_ROOT, 'keys', 'ecdsa_public.pem')
)

# Module-level cache for loaded keys
_private_key = None
_public_key = None


def _ensure_keys_exist():
    """Generate ECDSA P-256 key pair if it doesn't already exist."""
    key_dir = os.path.dirname(_PRIVATE_KEY_PATH)
    os.makedirs(key_dir, exist_ok=True)

    if os.path.exists(_PRIVATE_KEY_PATH) and os.path.exists(_PUBLIC_KEY_PATH):
        return

    logger.info("Generating new ECDSA P-256 key pair...")

    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    # Write private key
    with open(_PRIVATE_KEY_PATH, 'wb') as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    # Write public key
    with open(_PUBLIC_KEY_PATH, 'wb') as f:
        f.write(public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ))

    logger.info(f"ECDSA key pair generated → {key_dir}")


def _load_private_key():
    """Load (or generate) the private key, caching in memory."""
    global _private_key
    if _private_key is not None:
        return _private_key

    _ensure_keys_exist()

    with open(_PRIVATE_KEY_PATH, 'rb') as f:
        _private_key = serialization.load_pem_private_key(
            f.read(), password=None, backend=default_backend()
        )
    return _private_key


def _load_public_key():
    """Load (or generate) the public key, caching in memory."""
    global _public_key
    if _public_key is not None:
        return _public_key

    _ensure_keys_exist()

    with open(_PUBLIC_KEY_PATH, 'rb') as f:
        _public_key = serialization.load_pem_public_key(
            f.read(), backend=default_backend()
        )
    return _public_key


def sign_payload(data: bytes) -> bytes:
    """Sign raw bytes with the ECDSA P-256 private key."""
    key = _load_private_key()
    signature = key.sign(data, ec.ECDSA(hashes.SHA256()))
    logger.debug(f"Signed {len(data)} bytes → {len(signature)} byte signature")
    return signature


def verify_payload(data: bytes, signature: bytes) -> bool:
    """Verify an ECDSA signature against the public key."""
    key = _load_public_key()
    try:
        key.verify(signature, data, ec.ECDSA(hashes.SHA256()))
        logger.debug("Signature verification: VALID ✓")
        return True
    except Exception:
        logger.warning("Signature verification: INVALID ✗ — possible forgery!")
        return False

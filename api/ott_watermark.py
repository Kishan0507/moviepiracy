import json
import base64
import hashlib
from datetime import datetime
from Crypto.Hash import SHA256
from Crypto.PublicKey import ECC
from Crypto.Signature import DSS

# Load private key
try:
    with open('watermark_private_key.pem', 'rt') as f:
        private_key = ECC.import_key(f.read())
except FileNotFoundError:
    # Generate a new key if notfound
    private_key = ECC.generate(curve='P-256')
    with open('watermark_private_key.pem', 'wt') as f:
        f.write(private_key.export_key(format='PEM'))

def generate_session_payload(session_id: int, user_identifier: str, distribution_id: int) -> dict:
    """Generate a signed forensic payload for an OTT streaming session."""
    payload = {
        'type': 'OTT',
        'session_id': session_id,
        'user': user_identifier[:20],  # Hash or partialidentifier
        'dist_id': distribution_id,
        'ts': int(datetime.utcnow().timestamp())
    }
    
    # Create deterministicsignature
    payload_str = json.dumps(payload, sort_keys=True)
    h = SHA256.new(payload_str.encode('utf-8'))
    signer = DSS.new(private_key, 'fips-186-3')
    signature = signer.sign(h)
    
    payload['sig'] = base64.b64encode(signature[:8]).decode('utf-8')  # Truncated signature forspace
    return payload

def encode_variant(payload: dict) -> str:
    """Encode payload to base64 string for embedding."""
    json_str = json.dumps(payload, separators=(',', ':'))
    return base64.urlsafe_b64encode(json_str.encode('utf-8')).decode('utf-8')

def decode_variant(variant_str: str) -> dict:
    """Decode and verify a session variant payload."""
    try:
        decoded_bytes = base64.urlsafe_b64decode(variant_str)
        payload = json.loads(decoded_bytes.decode('utf-8'))
        
        # Verifysignature
        sig = payload.pop('sig', None)
        if not sig:
            return None
            
        payload_str = json.dumps(payload, sort_keys=True)
        h = SHA256.new(payload_str.encode('utf-8'))
        
        # Compute signature
        expected_sig = base64.b64encode(DSS.new(private_key, 'fips-186-3').sign(h)[:8]).decode('utf-8')
        
        if sig == expected_sig:
            payload['sig'] = sig
            return payload
        return None
    except Exception as e:
        print(f"Failed to decode variant: {e}")
        return None

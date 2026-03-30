"""
CloudFront URL signing utility.
Generates signed CloudFront URLs using a private key for restricted access to media.
"""

import json
import base64
import time
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend

# Module-level cache: PEM string → parsed private key object.
# Survives across warm Lambda invocations so we pay the PEM parse cost once
# per container lifetime instead of once per item per request.
_key_cache: dict = {}


def _load_private_key(pem: str):
    if pem not in _key_cache:
        _key_cache[pem] = serialization.load_pem_private_key(
            pem.encode("utf-8"),
            password=None,
            backend=default_backend(),
        )
    return _key_cache[pem]


def create_signed_url(
    domain_name: str,
    object_key: str,
    key_pair_id: str,
    private_key_pem: str,
    expires_in_seconds: int,
) -> str:
    """
    Generate a CloudFront signed URL.

    Args:
        domain_name: CloudFront domain (e.g., "https://media.example.com")
        object_key: S3 object key (e.g., "media/abc123")
        key_pair_id: CloudFront key pair ID
        private_key_pem: Private key in PEM format
        expires_in_seconds: How long the URL should be valid (e.g., 900 for 15 min)

    Returns:
        Signed CloudFront URL string
    """
    if not domain_name or not object_key or not key_pair_id or not private_key_pem:
        raise ValueError("Missing required parameters for CloudFront signing")

    # Ensure domain has no trailing slash
    domain_name = domain_name.rstrip("/")
    
    # Build the full URL
    url = f"{domain_name}/{object_key}"

    # Round expiry UP to the next whole hour boundary.
    # All calls within the same clock-hour produce the same Expires value →
    # identical URL → browser disk cache hits on reload instead of re-downloading.
    now = int(time.time())
    raw_expiry = now + expires_in_seconds
    hour_secs = 3600
    expire_time = ((raw_expiry + hour_secs - 1) // hour_secs) * hour_secs

    # Build the policy document
    policy_dict = {
        "Statement": [
            {
                "Resource": url,
                "Condition": {
                    "DateLessThan": {
                        "AWS:EpochTime": expire_time
                    }
                },
            }
        ]
    }

    policy_json = json.dumps(policy_dict, separators=(",", ":"))
    policy_b64 = base64.b64encode(policy_json.encode("utf-8")).decode("utf-8")

    # Load (or retrieve cached) private key
    private_key = _load_private_key(private_key_pem)

    # Sign the policy
    signature = private_key.sign(
        policy_json.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA1(),
    )

    # Base64 encode the signature (URL-safe)
    signature_b64 = base64.b64encode(signature).decode("utf-8")
    # CloudFront requires URL-safe base64 (replace +, /, = with -, _, ~)
    signature_b64 = signature_b64.replace("+", "-").replace("/", "_").replace("=", "~")
    policy_b64 = policy_b64.replace("+", "-").replace("/", "_").replace("=", "~")

    # Build the signed URL
    signed_url = (
        f"{url}"
        f"?Policy={policy_b64}"
        f"&Signature={signature_b64}"
        f"&Key-Pair-Id={key_pair_id}"
    )

    return signed_url

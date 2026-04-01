#!/usr/bin/env python3
"""
Generate VAPID keys for Web Push notifications.

Run once, then add the output to GitHub Secrets:
  VAPID_PUBLIC_KEY  → also set as VITE_VAPID_PUBLIC_KEY in GitHub Actions vars
  VAPID_PRIVATE_KEY → kept secret in Lambda env

Usage:
    python scripts/generate_vapid_keys.py
"""
from cryptography.hazmat.primitives.asymmetric.ec import generate_private_key, SECP256R1
from cryptography.hazmat.primitives.serialization import (
    Encoding, PrivateFormat, PublicFormat, NoEncryption,
)
import base64

key = generate_private_key(SECP256R1())
priv_bytes = key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption())
pub_bytes = key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)

priv_b64 = base64.urlsafe_b64encode(priv_bytes).rstrip(b"=").decode()
pub_b64 = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode()

print("Add these to GitHub Secrets:\n")
print(f"VAPID_PUBLIC_KEY={pub_b64}")
print(f"VAPID_PRIVATE_KEY={priv_b64}")
print("\nAlso set VITE_VAPID_PUBLIC_KEY=" + pub_b64 + " in GitHub Actions variables (not secrets).")

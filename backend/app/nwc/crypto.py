"""Small, audited-spec-compatible NIP-44 v2 primitive used by NWC.

NWC messages are signed Nostr events, then encrypted. This module deliberately implements only
the bounded text payloads needed by NIP-47 and rejects oversized input before allocating memory.
"""

import base64
import hashlib
import hmac
import math
import os
import struct
from urllib.parse import parse_qs

from coincurve import PublicKey
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

# NIP-44 now defines a 32-bit extended prefix. NWC requests stay deliberately bounded to 64 KiB.
MAX_PLAINTEXT = 65_536


class Nip44Error(ValueError):
    pass


class Nip04Error(ValueError):
    pass


def _shared_x(secret_hex: str, peer_pubkey: str, error: type[ValueError]) -> bytes:
    try:
        secret = bytes.fromhex(secret_hex)
        peer = bytes.fromhex(peer_pubkey)
        if len(secret) != 32 or len(peer) != 32:
            raise ValueError
        return PublicKey(b"\x02" + peer).multiply(secret).format(compressed=False)[1:33]
    except Exception as exc:
        raise error("invalid Nostr encryption key") from exc


def _hkdf_extract(salt: bytes, ikm: bytes) -> bytes:
    return hmac.new(salt, ikm, hashlib.sha256).digest()


def _hkdf_expand(prk: bytes, info: bytes, length: int) -> bytes:
    output = b""
    previous = b""
    counter = 1
    while len(output) < length:
        previous = hmac.new(prk, previous + info + bytes([counter]), hashlib.sha256).digest()
        output += previous
        counter += 1
    return output[:length]


def conversation_key(secret_hex: str, peer_pubkey: str) -> bytes:
    return _hkdf_extract(b"nip44-v2", _shared_x(secret_hex, peer_pubkey, Nip44Error))


def nip04_encrypt(
    plaintext: str, secret_hex: str, peer_pubkey: str, iv: bytes | None = None
) -> str:
    raw = plaintext.encode()
    if not raw or len(raw) > MAX_PLAINTEXT:
        raise Nip04Error("invalid NIP-04 plaintext length")
    iv = os.urandom(16) if iv is None else iv
    if len(iv) != 16:
        raise Nip04Error("invalid NIP-04 IV")
    padder = padding.PKCS7(128).padder()
    padded = padder.update(raw) + padder.finalize()
    cipher = Cipher(algorithms.AES(_shared_x(secret_hex, peer_pubkey, Nip04Error)), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return f"{base64.b64encode(ciphertext).decode()}?iv={base64.b64encode(iv).decode()}"


def nip04_decrypt(payload: str, secret_hex: str, peer_pubkey: str) -> str:
    if not isinstance(payload, str) or len(payload) > 100_000:
        raise Nip04Error("invalid NIP-04 payload size")
    try:
        encoded, query = payload.split("?", 1)
        iv_values = parse_qs(query, strict_parsing=True).get("iv", [])
        if len(iv_values) != 1:
            raise ValueError
        ciphertext = base64.b64decode(encoded, validate=True)
        iv = base64.b64decode(iv_values[0], validate=True)
        if not ciphertext or len(ciphertext) % 16 or len(iv) != 16:
            raise ValueError
        cipher = Cipher(
            algorithms.AES(_shared_x(secret_hex, peer_pubkey, Nip04Error)), modes.CBC(iv)
        )
        decryptor = cipher.decryptor()
        padded = decryptor.update(ciphertext) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        return (unpadder.update(padded) + unpadder.finalize()).decode()
    except Nip04Error:
        raise
    except Exception as exc:
        raise Nip04Error("invalid NIP-04 payload") from exc


def padded_length(length: int) -> int:
    if length <= 32:
        return 32
    next_power = 1 << math.ceil(math.log2(length))
    chunk = 32 if next_power <= 256 else next_power // 8
    return chunk * math.ceil(length / chunk)


def _pad(plaintext: str) -> bytes:
    raw = plaintext.encode()
    size = len(raw)
    if size < 1 or size > MAX_PLAINTEXT:
        raise Nip44Error("invalid NIP-44 plaintext length")
    prefix = struct.pack(">H", size) if size < 65_536 else b"\0\0" + struct.pack(">I", size)
    return prefix + raw + bytes(padded_length(size) - size)


def _unpad(padded: bytes) -> str:
    if len(padded) < 2:
        raise Nip44Error("invalid NIP-44 padding")
    size = struct.unpack(">H", padded[:2])[0]
    prefix = 2
    if size == 0:
        if len(padded) < 6:
            raise Nip44Error("invalid NIP-44 padding")
        size = struct.unpack(">I", padded[2:6])[0]
        prefix = 6
        if size < 65_536:
            raise Nip44Error("invalid NIP-44 padding")
    if size < 1 or size > MAX_PLAINTEXT or len(padded) != prefix + padded_length(size):
        raise Nip44Error("invalid NIP-44 padding")
    try:
        return padded[prefix : prefix + size].decode()
    except UnicodeDecodeError as exc:
        raise Nip44Error("NIP-44 plaintext is not UTF-8") from exc


def _message_keys(key: bytes, nonce: bytes) -> tuple[bytes, bytes, bytes]:
    if len(key) != 32 or len(nonce) != 32:
        raise Nip44Error("invalid NIP-44 key material")
    material = _hkdf_expand(key, nonce, 76)
    return material[:32], material[32:44], material[44:]


def _chacha(key: bytes, nonce: bytes, value: bytes) -> bytes:
    # cryptography's ChaCha20 takes the RFC8439 32-bit counter followed by the 96-bit nonce.
    cipher = Cipher(algorithms.ChaCha20(key, b"\0\0\0\0" + nonce), mode=None)
    return cipher.encryptor().update(value)


def encrypt(plaintext: str, secret_hex: str, peer_pubkey: str, nonce: bytes | None = None) -> str:
    nonce = os.urandom(32) if nonce is None else nonce
    chacha_key, chacha_nonce, hmac_key = _message_keys(
        conversation_key(secret_hex, peer_pubkey), nonce
    )
    ciphertext = _chacha(chacha_key, chacha_nonce, _pad(plaintext))
    mac = hmac.new(hmac_key, nonce + ciphertext, hashlib.sha256).digest()
    return base64.b64encode(b"\x02" + nonce + ciphertext + mac).decode()


def decrypt(payload: str, secret_hex: str, peer_pubkey: str) -> str:
    if not isinstance(payload, str) or len(payload) < 132 or len(payload) > 100_000:
        raise Nip44Error("invalid NIP-44 payload size")
    try:
        data = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise Nip44Error("invalid NIP-44 base64") from exc
    if len(data) < 99 or data[0] != 2:
        raise Nip44Error("unsupported NIP-44 version")
    nonce, ciphertext, supplied_mac = data[1:33], data[33:-32], data[-32:]
    chacha_key, chacha_nonce, hmac_key = _message_keys(
        conversation_key(secret_hex, peer_pubkey), nonce
    )
    expected_mac = hmac.new(hmac_key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_mac, supplied_mac):
        raise Nip44Error("invalid NIP-44 MAC")
    return _unpad(_chacha(chacha_key, chacha_nonce, ciphertext))

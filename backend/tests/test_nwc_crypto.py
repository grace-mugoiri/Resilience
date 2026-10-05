import base64
import uuid

import pytest

from app.nostr.events import pubkey_of
from app.nwc.connection import NwcConnectionError, open_secret, parse_connection_uri, seal_secret
from app.nwc.crypto import (
    Nip04Error,
    Nip44Error,
    conversation_key,
    decrypt,
    encrypt,
    nip04_decrypt,
    nip04_encrypt,
    padded_length,
)
from app.settings import Settings

ALICE = "11" * 32
BOB = "22" * 32


def test_nip44_official_vector():
    secret_one = "00" * 31 + "01"
    secret_two = "00" * 31 + "02"
    nonce = bytes.fromhex("00" * 31 + "01")
    expected = (
        "AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABee0G5VSK0/9YypIObAtDKfYEAjD35uVk"
        "HyB0F4DwrcNaCXlCWZKaArsGrY6M9wnuTMxWfp1RTN9Xga8no+kF5Vsb"
    )
    assert conversation_key(secret_one, pubkey_of(secret_two)).hex() == (
        "c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d"
    )
    assert encrypt("a", secret_one, pubkey_of(secret_two), nonce) == expected
    assert decrypt(expected, secret_two, pubkey_of(secret_one)) == "a"


@pytest.mark.parametrize(
    ("length", "expected"),
    [(1, 32), (32, 32), (33, 64), (256, 256), (257, 320), (1_000, 1_024)],
)
def test_nip44_padding_buckets(length, expected):
    assert padded_length(length) == expected


def test_nip44_roundtrip_is_interoperable_between_both_key_sides_and_detects_tampering():
    payload = encrypt('{"method":"get_balance","params":{}}', ALICE, pubkey_of(BOB))
    assert decrypt(payload, BOB, pubkey_of(ALICE)) == '{"method":"get_balance","params":{}}'

    raw = bytearray(base64.b64decode(payload))
    raw[40] ^= 1
    with pytest.raises(Nip44Error, match="MAC"):
        decrypt(base64.b64encode(raw).decode(), BOB, pubkey_of(ALICE))


def test_nip04_legacy_roundtrip_and_padding_validation():
    payload = nip04_encrypt(
        '{"method":"get_info","params":{}}',
        ALICE,
        pubkey_of(BOB),
        iv=bytes(range(16)),
    )
    assert nip04_decrypt(payload, BOB, pubkey_of(ALICE)) == ('{"method":"get_info","params":{}}')

    encoded, iv = payload.split("?iv=", 1)
    raw = bytearray(base64.b64decode(encoded))
    raw[-1] ^= 1
    with pytest.raises(Nip04Error, match="invalid NIP-04 payload"):
        nip04_decrypt(f"{base64.b64encode(raw).decode()}?iv={iv}", BOB, pubkey_of(ALICE))


def test_nwc_uri_and_encrypted_storage_are_context_bound():
    settings = Settings(app_env="test")
    wallet = pubkey_of(BOB)
    uri = (
        f"nostr+walletconnect://{wallet}?relay=ws%3A%2F%2Flocalhost%3A7777"
        f"&relay=ws%3A%2F%2Flocalhost%3A7778&secret={ALICE}"
    )
    parsed = parse_connection_uri(uri, settings)
    assert parsed.wallet_pubkey == wallet
    assert parsed.client_pubkey == pubkey_of(ALICE)
    assert parsed.relays == ["ws://localhost:7777", "ws://localhost:7778"]

    org_id = uuid.uuid4()
    sealed = seal_secret(settings, org_id, ALICE)
    assert ALICE not in sealed
    assert open_secret(settings, org_id, sealed) == ALICE
    with pytest.raises(NwcConnectionError):
        open_secret(settings, uuid.uuid4(), sealed)


def test_production_nwc_uri_requires_tls_relay():
    settings = Settings(
        app_env="prod",
        relay_policy_hmac_key="x" * 32,
        membership_box_key="y" * 32,
        counselor_invite_hmac_key="z" * 32,
        nwc_storage_key="w" * 32,
    )
    uri = f"nostr+walletconnect://{pubkey_of(BOB)}?relay=ws://wallet.example&secret={ALICE}"
    with pytest.raises(NwcConnectionError, match="not allowed"):
        parse_connection_uri(uri, settings)

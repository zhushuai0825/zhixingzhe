from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
from typing import Optional


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
SECRET_KEY_PATH = DATA_DIR / "secret.key"
ENCRYPTED_PREFIX = "enc:v1:"


def _derive_key(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _get_fernet():
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        return None

    env_secret = os.getenv("ZHIXINGZHE_SECRET_KEY")
    if env_secret:
        return Fernet(_derive_key(env_secret))

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SECRET_KEY_PATH.exists():
        key = SECRET_KEY_PATH.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        SECRET_KEY_PATH.write_bytes(key)
    return Fernet(key)


def is_encrypted(value: Optional[str]) -> bool:
    return bool(value and value.startswith(ENCRYPTED_PREFIX))


def encrypt_secret(value: str) -> str:
    if is_encrypted(value):
        return value
    fernet = _get_fernet()
    if fernet is None:
        # Fallback keeps the app usable if dependencies are not installed yet.
        encoded = base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii")
        return f"enc:v0:{encoded}"
    token = fernet.encrypt(value.encode("utf-8")).decode("ascii")
    return f"{ENCRYPTED_PREFIX}{token}"


def decrypt_secret(value: str) -> str:
    if value.startswith("enc:v0:"):
        return base64.urlsafe_b64decode(value.removeprefix("enc:v0:")).decode("utf-8")
    if not is_encrypted(value):
        return value
    fernet = _get_fernet()
    if fernet is None:
        raise RuntimeError("缺少 cryptography 依赖，无法解密 API Key。")
    token = value.removeprefix(ENCRYPTED_PREFIX)
    return fernet.decrypt(token.encode("ascii")).decode("utf-8")


def mask_secret(value: str) -> str:
    plain = decrypt_secret(value)
    if len(plain) <= 8:
        return "*" * len(plain)
    return f"{plain[:4]}****{plain[-4:]}"


def migrate_plaintext_model_keys(connect_fn, now_fn) -> None:
    with connect_fn() as conn:
        rows = conn.execute("SELECT id, api_key FROM model_configs").fetchall()
        for row in rows:
            if not is_encrypted(row["api_key"]):
                conn.execute(
                    "UPDATE model_configs SET api_key = ?, updated_at = ? WHERE id = ?",
                    (encrypt_secret(row["api_key"]), now_fn(), row["id"]),
                )
